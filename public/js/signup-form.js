// Hero sign-up / login widget.
//
// Steps: mobile -> otp -> (profile, first login only) -> hand-off to the app,
// with an email branch: check -> login | signup | forgot -> forgot-otp -> reset.
//
// Behaviour:
//  - mobile auto-sends 600 ms after a valid 10-digit number settles
//  - OTP auto-verifies 600 ms after the sixth digit; paste spreads digits
//  - 30 s resend timer, max 2 resends, then a 30 min lockout kept in
//    localStorage per number so a reload does not reset it
//  - 20 s request timeout with friendly error text by status code
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const config = window.UT_SIGNUP_CONFIG || {};
  const API = config.apiBase || '/v1';
  const APP_URL = config.appUrl || '/app/';
  // Plug a bot check in here (reCAPTCHA, Turnstile...). Return '' to skip.
  const getCaptchaToken = config.getCaptchaToken || (async () => '');

  const AUTO_SUBMIT_SETTLE_MS = 600;
  const SEND_CONFIRM_MS = 900;
  const RESEND_INTERVAL = 30;
  const MAX_RESENDS = 2;
  const RESEND_LOCKOUT_MS = 30 * 60 * 1000;
  const RESEND_STORE_PREFIX = 'utOtpResend:';
  const REQUEST_TIMEOUT_MS = 20000;

  const $ = (s, scope = document) => scope.querySelector(s);
  const $$ = (s, scope = document) => Array.from(scope.querySelectorAll(s));
  const show = (s) => $(s) && $(s).classList.remove('hidden');
  const hide = (s) => $(s) && $(s).classList.add('hidden');
  const setText = (s, v) => { const el = $(s); if (el) el.textContent = v; };
  const clearMessages = (...sel) => sel.forEach((s) => setText(s, ''));
  const validateMobile = (m) => /^[6-9]\d{9}$/.test(m);
  const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  // ---- network --------------------------------------------------------------
  async function api(method, path, payload, token) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(API + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
        body: payload ? JSON.stringify(payload) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') { const e = new Error('timeout'); e.isTimeout = true; throw e; }
      throw err;
    } finally { clearTimeout(timer); }
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!response.ok) { const e = new Error('Request failed'); e.status = response.status; e.data = data; throw e; }
    showDevOtp(data);
    return data;
  }
  const postJSON = (path, payload, token) => api('POST', path, payload, token);

  function friendlyError(err, context) {
    if (err && err.isTimeout) return 'That took too long. Please check your connection and try again.';
    if (err && err.status === 429) return context === 'verify' ? 'Too many attempts. Please wait a moment and try again.' : 'Too many OTP requests. Please wait before trying again.';
    if (context === 'verify' && err && err.status === 400) return 'That code is incorrect or has expired. Please try again.';
    if (err && err.status >= 500) return 'Something went wrong at our end. Please try again in a moment.';
    if (err && err.data && err.data.message) return err.data.message;
    return context === 'verify' ? 'We could not verify that code. Please try again.' : 'We could not send the OTP. Please try again.';
  }

  // The dev server echoes OTPs so the flow can be tried without SMS.
  function showDevOtp(data) {
    if (data && data.dev_otp) { setText('#dev-hint', 'Dev mode: your code is ' + data.dev_otp); show('#dev-hint'); }
  }

  function setButtonBusy(btn, busyLabel) {
    if (!btn) return;
    if (busyLabel) {
      if (!btn.dataset.idleLabel) btn.dataset.idleLabel = btn.textContent.trim();
      btn.textContent = busyLabel;
      btn.classList.add('is-loading');
    } else {
      if (btn.dataset.idleLabel) btn.textContent = btn.dataset.idleLabel;
      btn.classList.remove('is-loading');
    }
  }

  function finishLogin(token) {
    hide('#dev-hint');
    const next = new URLSearchParams(location.search).get('next') || '';
    if (/^\/(?![/\\])/.test(next)) {
      try { localStorage.setItem('ut_token', token); } catch (e) {}
      location.assign(next);
      return;
    }
    if (!window.utHandoffRedirect || !window.utHandoffRedirect(token, APP_URL)) {
      setText('#otp-error', 'Could not complete login. Please refresh the page and try again.');
    }
  }

  // ---- resend bookkeeping ---------------------------------------------------
  let resendCount = 0;
  let canResend = false;
  let otpTimerInterval = null;

  function resendStateFor(mobile) {
    const empty = { count: 0, lockedUntil: 0 };
    if (!mobile) return empty;
    try {
      const raw = localStorage.getItem(RESEND_STORE_PREFIX + mobile);
      if (!raw) return empty;
      const p = JSON.parse(raw);
      const state = { count: Number(p.count) || 0, lockedUntil: Number(p.lockedUntil) || 0 };
      if (state.lockedUntil && Date.now() >= state.lockedUntil) { localStorage.removeItem(RESEND_STORE_PREFIX + mobile); return empty; }
      return state;
    } catch (e) { return empty; }
  }
  function saveResendState(mobile, state) {
    try { localStorage.setItem(RESEND_STORE_PREFIX + mobile, JSON.stringify(state)); } catch (e) {}
  }
  function activeMobile() {
    const phoneVisible = !$('#mobile-section').classList.contains('hidden');
    const typed = ($('#mobile').value || '').trim();
    if (phoneVisible && typed) return typed;
    return ($('#user-mobile-number').textContent || '').trim() || typed;
  }
  function resendLockRemainingMs(mobile) {
    const s = resendStateFor(mobile);
    return s.lockedUntil ? Math.max(0, s.lockedUntil - Date.now()) : 0;
  }
  const formatTime = (t) => Math.floor(t / 60) + ' : ' + String(t % 60).padStart(2, '0');

  function renderResendControl(state, secondsLeft) {
    const el = $('#resend-text');
    const lock = resendLockRemainingMs(activeMobile());
    if (resendCount >= MAX_RESENDS || lock > 0) {
      const mins = Math.ceil(lock / 60000);
      el.innerHTML = '<span style="color:#9a9a9a">You have reached the maximum number of resend attempts. ' +
        (lock > 0 ? 'You can request another in ' + (mins <= 1 ? 'a minute' : mins + ' minutes') + '.' : 'Please try again later.') + '</span>';
      return;
    }
    el.innerHTML = state === 'ready'
      ? "Didn't receive the code? <span id=\"resend-otp\" class=\"link\" role=\"button\" tabindex=\"0\">Resend OTP</span>"
      : "Didn't receive the code? Resend in <span id=\"timer\">" + formatTime(secondsLeft || 0) + '</span>';
  }

  function startOTPTimer(duration) {
    let time = duration;
    clearInterval(otpTimerInterval);
    canResend = false;
    renderResendControl('locked', time);
    otpTimerInterval = setInterval(() => {
      time--;
      const t = $('#timer');
      if (t) t.textContent = formatTime(Math.max(time, 0));
      if (time < 0) {
        clearInterval(otpTimerInterval);
        otpTimerInterval = null;
        canResend = resendCount < MAX_RESENDS;
        renderResendControl(canResend ? 'ready' : 'maxed');
      }
    }, 1000);
  }

  // ---- OTP inputs -----------------------------------------------------------
  const verifyOtpBtn = $('#feature-verify-otp-btn');
  const collectOTP = () => $$('.otp-digit').map((i) => i.value).join('');
  let otpAutoTimer = null;
  let lastAutoVerifiedOtp = '';
  let isVerifyingOtp = false;

  function setVerifyOtpButtonState(enabled) { verifyOtpBtn.disabled = !enabled; }

  function clearOTPInputs() {
    $$('.otp-digit').forEach((i) => { i.value = ''; });
    clearTimeout(otpAutoTimer); otpAutoTimer = null;
    lastAutoVerifiedOtp = '';
    setButtonBusy(verifyOtpBtn, null);
    setVerifyOtpButtonState(false);
    const first = $('.otp-digit');
    if (first) first.focus();
  }

  function scheduleOtpAutoSubmit(otp) {
    clearTimeout(otpAutoTimer); otpAutoTimer = null;
    if (otp.length !== 6 || otp === lastAutoVerifiedOtp) { if (!isVerifyingOtp) setButtonBusy(verifyOtpBtn, null); return; }
    setButtonBusy(verifyOtpBtn, 'Verifying…');
    otpAutoTimer = setTimeout(() => {
      otpAutoTimer = null;
      const current = collectOTP();
      if (current !== otp || current === lastAutoVerifiedOtp || isVerifyingOtp) return;
      lastAutoVerifiedOtp = current;
      verifyOtpBtn.click();
    }, AUTO_SUBMIT_SETTLE_MS);
  }

  function checkOTPCompletion() {
    const otp = collectOTP();
    setVerifyOtpButtonState(otp.length === 6);
    scheduleOtpAutoSubmit(otp);
  }

  function spreadOTP(inputs, index, digits) {
    const start = digits.length >= inputs.length ? 0 : index;
    for (let i = 0; i < inputs.length - start; i++) inputs[start + i].value = digits[i] || '';
    const last = Math.min(start + digits.length, inputs.length) - 1;
    (inputs[last + 1] || inputs[last]).focus();
    checkOTPCompletion();
  }

  document.addEventListener('paste', (e) => {
    if (!e.target.classList.contains('otp-digit')) return;
    const inputs = $$('.otp-digit');
    const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '');
    if (digits.length < 2) return;
    e.preventDefault();
    spreadOTP(inputs, inputs.indexOf(e.target), digits);
  });
  // maxlength trims a multi-char insert (SMS autofill, fast typing tools)
  // before 'input' fires, so spread it here while the full text is known.
  document.addEventListener('beforeinput', (e) => {
    if (!e.target.classList.contains('otp-digit')) return;
    const digits = (e.data || '').replace(/\D/g, '');
    if (digits.length < 2) return;
    e.preventDefault();
    const inputs = $$('.otp-digit');
    spreadOTP(inputs, inputs.indexOf(e.target), digits);
  });
  document.addEventListener('input', (e) => {
    if (!e.target.classList.contains('otp-digit')) return;
    const inputs = $$('.otp-digit');
    const index = inputs.indexOf(e.target);
    // maxlength trims a multi-char insert (SMS autofill), so read e.data first.
    const inserted = e.data && e.data.length > 1 ? e.data : e.target.value;
    const digits = (inserted || '').replace(/\D/g, '');
    if (digits.length > 1) { spreadOTP(inputs, index, digits); return; }
    e.target.value = digits;
    if (digits && inputs[index + 1]) inputs[index + 1].focus();
    checkOTPCompletion();
  });
  document.addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('otp-digit')) return;
    const inputs = $$('.otp-digit');
    const index = inputs.indexOf(e.target);
    if (e.key === 'Backspace' && !e.target.value && index > 0) inputs[index - 1].focus();
    if (e.key.length === 1 && !/[0-9]/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
  });

  // ---- mobile step ----------------------------------------------------------
  const mobileInput = $('#mobile');
  const requestOtpBtn = $('#feature-request-otp-btn');
  let mobileAutoTimer = null;
  let lastAutoSentMobile = '';
  let isSendingOtp = false;
  let isSwapPending = false;

  function scheduleMobileAutoSubmit(value) {
    clearTimeout(mobileAutoTimer); mobileAutoTimer = null;
    if (!validateMobile(value) || value === lastAutoSentMobile) { if (!isSendingOtp) setButtonBusy(requestOtpBtn, null); return; }
    setButtonBusy(requestOtpBtn, 'Sending OTP…');
    mobileAutoTimer = setTimeout(() => {
      mobileAutoTimer = null;
      const current = mobileInput.value.trim();
      if (current !== value || !validateMobile(current) || current === lastAutoSentMobile || isSendingOtp || isSwapPending) return;
      lastAutoSentMobile = current;
      sendOtp(false);
    }, AUTO_SUBMIT_SETTLE_MS);
  }

  function cleanMobile() {
    const value = this.value.replace(/\D/g, '').slice(0, 10);
    this.value = value;
    requestOtpBtn.disabled = !validateMobile(value);
    setText('#mobile-error', value.length >= 10 && !validateMobile(value) ? 'Please enter a valid 10-digit Indian mobile number.' : '');
    scheduleMobileAutoSubmit(value);
  }
  mobileInput.addEventListener('input', cleanMobile);
  mobileInput.addEventListener('change', cleanMobile);
  mobileInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !requestOtpBtn.disabled) { requestOtpBtn.click(); return; }
    if (e.key.length === 1 && !/[0-9]/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
  });

  async function sendOtp(isResend) {
    const mobile = mobileInput.value.trim();
    clearMessages('#mobile-error', '#request-message', '#request-success', '#otp-error', '#otp-message');
    if (!validateMobile(mobile)) { setText('#mobile-error', 'Please enter a valid Indian mobile number.'); return; }
    if (!isResend) resendCount = resendStateFor(mobile).count;
    if (isSendingOtp) return;
    isSendingOtp = true;
    requestOtpBtn.disabled = true;
    setButtonBusy(requestOtpBtn, 'Sending OTP…');
    try {
      await postJSON('/auth/onboard/request', { mobile, captcha_token: await getCaptchaToken('request_otp') });
      setText('#user-mobile-number', mobile);
      if (isResend) {
        resendCount++;
        saveResendState(mobile, { count: resendCount, lockedUntil: resendCount >= MAX_RESENDS ? Date.now() + RESEND_LOCKOUT_MS : 0 });
        setText('#otp-message', 'OTP resent successfully!');
        clearOTPInputs();
        startOTPTimer(RESEND_INTERVAL);
      } else {
        setText('#request-success', 'OTP sent successfully!');
        isSwapPending = true;
        setTimeout(() => {
          hide('#mobile-section'); show('#otp-section');
          clearOTPInputs();
          startOTPTimer(RESEND_INTERVAL);
          isSwapPending = false;
          isSendingOtp = false;
          setButtonBusy(requestOtpBtn, null);
          requestOtpBtn.disabled = !validateMobile(mobile);
        }, SEND_CONFIRM_MS);
      }
    } catch (err) {
      setText(isResend ? '#otp-error' : '#request-message', friendlyError(err, 'send'));
      lastAutoSentMobile = '';
      if (isResend && resendCount < MAX_RESENDS) { canResend = true; renderResendControl('ready'); }
    } finally {
      if (!isSwapPending) {
        isSendingOtp = false;
        setButtonBusy(requestOtpBtn, null);
        requestOtpBtn.disabled = !validateMobile(mobile);
      }
    }
  }

  requestOtpBtn.addEventListener('click', () => {
    clearTimeout(mobileAutoTimer); mobileAutoTimer = null;
    lastAutoSentMobile = mobileInput.value.trim();
    sendOtp(false);
  });

  // ---- verify step ----------------------------------------------------------
  let sessionToken = '';
  verifyOtpBtn.addEventListener('click', async () => {
    if (isVerifyingOtp) return;
    const mobile = $('#user-mobile-number').textContent.trim();
    const otp = collectOTP();
    clearMessages('#otp-error', '#otp-message');
    if (otp.length !== 6) { setText('#otp-error', 'Please enter the 6-digit OTP.'); return; }
    clearTimeout(otpAutoTimer); otpAutoTimer = null;
    lastAutoVerifiedOtp = otp;
    isVerifyingOtp = true;
    setVerifyOtpButtonState(false);
    setButtonBusy(verifyOtpBtn, 'Verifying…');
    try {
      const attribution = window.UTAttribution ? window.UTAttribution.current() : {};
      const res = await postJSON('/auth/onboard/validate', {
        mobile, otp, captcha_token: await getCaptchaToken('validate_otp'), manual_form_signup: 1, ...attribution,
      });
      if (!res || !res.token) { setText('#otp-error', 'We could not verify that code. Please try again.'); clearOTPInputs(); return; }
      sessionToken = res.token;
      clearInterval(otpTimerInterval);
      setText('#otp-message', 'Number verified!');
      if (res.is_new) { hide('#otp-section'); show('#profile-section'); $('#name').focus(); }
      else finishLogin(sessionToken);
    } catch (err) {
      setText('#otp-error', friendlyError(err, 'verify'));
      clearOTPInputs();
    } finally {
      isVerifyingOtp = false;
      setButtonBusy(verifyOtpBtn, null);
      setVerifyOtpButtonState(collectOTP().length === 6);
    }
  });

  $('#edit-mobile').addEventListener('click', () => {
    hide('#otp-section'); show('#mobile-section');
    resendCount = resendStateFor(activeMobile()).count;
    canResend = false;
    clearInterval(otpTimerInterval); otpTimerInterval = null;
    lastAutoSentMobile = '';
    clearMessages('#otp-error', '#otp-message', '#request-message', '#request-success');
    mobileInput.focus();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && (e.target.id === 'edit-mobile' || e.target.id === 'resend-otp')) {
      e.preventDefault(); e.target.click();
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target || e.target.id !== 'resend-otp') return;
    e.preventDefault();
    if (resendCount >= MAX_RESENDS || resendLockRemainingMs(activeMobile()) > 0) { renderResendControl('maxed'); return; }
    if (!canResend) return;
    canResend = false;
    sendOtp(true);
  });

  // ---- profile step (first login) -------------------------------------------
  const profileBtn = $('#update-profile-btn');
  profileBtn.addEventListener('click', async () => {
    const name = $('#name').value.trim();
    const email = $('#email').value.trim();
    clearMessages('#profile-error');
    if (!name) { setText('#profile-error', 'Please enter your name.'); return; }
    if (email && !validateEmail(email)) { setText('#profile-error', 'Please enter a valid email.'); return; }
    setButtonBusy(profileBtn, 'Saving…');
    try {
      await postJSON('/me', { name, email }, sessionToken);
      finishLogin(sessionToken);
    } catch (err) {
      setText('#profile-error', friendlyError(err, 'profile'));
    } finally { setButtonBusy(profileBtn, null); }
  });

  // ---- email branch ---------------------------------------------------------
  const EMAIL_STEPS = ['#email-check-step', '#email-login-step', '#email-signup-step', '#forgot-password-step', '#forgot-otp-step', '#reset-password-step'];
  const EMAIL_FIELDS = ['#email-input', '#login-password', '#signup-password', '#signup-password-confirm', '#fp-otp', '#new-password', '#new-password-confirm'];
  let currentEmail = '';
  let resetOtp = '';

  function emailStep(step) {
    EMAIL_STEPS.forEach(hide);
    show(step);
    $$('.email-display').forEach((el) => { el.textContent = currentEmail; });
    const first = $(step + ' input');
    if (first) first.focus();
  }

  $('#others-login-btn').addEventListener('click', () => { hide('#mobile-section'); show('#email-section'); emailStep('#email-check-step'); });
  $('#back-to-mobile-btn').addEventListener('click', () => {
    hide('#email-section'); show('#mobile-section');
    EMAIL_FIELDS.forEach((s) => { $(s).value = ''; });
    $$('#email-section .error, #email-section .success').forEach((el) => { el.textContent = ''; });
    currentEmail = '';
  });

  async function withBusy(btn, label, errSel, fn) {
    clearMessages(errSel);
    setButtonBusy(btn, label);
    btn.disabled = true;
    try { await fn(); } catch (err) { setText(errSel, friendlyError(err, 'email')); } finally { setButtonBusy(btn, null); btn.disabled = false; }
  }

  $('#check-email-btn').addEventListener('click', function () {
    const email = $('#email-input').value.trim().toLowerCase();
    if (!validateEmail(email)) { setText('#email-error', 'Please enter a valid email address.'); return; }
    withBusy(this, 'Checking…', '#email-error', async () => {
      const res = await postJSON('/auth/email/check', { email });
      currentEmail = email;
      emailStep(res.exists ? '#email-login-step' : '#email-signup-step');
    });
  });

  $('#email-login-btn').addEventListener('click', function () {
    const password = $('#login-password').value;
    if (!password) { setText('#login-error', 'Please enter your password.'); return; }
    withBusy(this, 'Logging in…', '#login-error', async () => {
      const res = await postJSON('/auth/email/login', { email: currentEmail, password });
      if (!res.twofa_required) { finishLogin(res.token); return; }
      // Two-factor is on for this account: ask for the code that was sent.
      const otp = window.prompt('Enter the 6-digit login code we sent you');
      if (!otp) { setText('#login-error', 'Login cancelled.'); return; }
      const done = await postJSON('/auth/email/2fa', { challenge_id: res.challenge_id, otp: otp.trim() });
      finishLogin(done.token);
    });
  });

  $('#email-signup-btn').addEventListener('click', function () {
    const password = $('#signup-password').value;
    if (password.length < 8) { setText('#signup-error', 'Password must be at least 8 characters.'); return; }
    if (password !== $('#signup-password-confirm').value) { setText('#signup-error', 'Passwords do not match.'); return; }
    withBusy(this, 'Creating account…', '#signup-error', async () => {
      const res = await postJSON('/auth/email/signup', { email: currentEmail, password });
      finishLogin(res.token);
    });
  });

  $('#forgot-password-btn').addEventListener('click', () => emailStep('#forgot-password-step'));

  $('#send-otp-btn').addEventListener('click', function () {
    withBusy(this, 'Sending…', '#fp-error', async () => {
      await postJSON('/users/reset/otp/send', { data: currentEmail });
      setText('#fp-otp-email-display', currentEmail);
      emailStep('#forgot-otp-step');
    });
  });

  $('#verify-fp-otp-btn').addEventListener('click', function () {
    const otp = $('#fp-otp').value.trim();
    if (!otp) { setText('#fp-otp-error', 'Please enter the OTP.'); return; }
    withBusy(this, 'Verifying…', '#fp-otp-error', async () => {
      const res = await postJSON('/users/reset/otp/confirm', { otp: parseInt(otp, 10), is_web: 1, data: currentEmail });
      if (!res || !res.success) { setText('#fp-otp-error', 'Invalid OTP. Please try again.'); return; }
      resetOtp = otp;
      setText('#reset-email-display', currentEmail);
      emailStep('#reset-password-step');
    });
  });

  $('#reset-password-btn').addEventListener('click', function () {
    const password = $('#new-password').value;
    if (password.length < 8) { setText('#reset-error', 'Password must be at least 8 characters.'); return; }
    if (password !== $('#new-password-confirm').value) { setText('#reset-error', 'Passwords do not match.'); return; }
    withBusy(this, 'Saving…', '#reset-error', async () => {
      await postJSON('/users/reset/password', { data: currentEmail, otp: resetOtp, password });
      $('#login-password').value = '';
      emailStep('#email-login-step');
      setText('#login-error', '');
      setText('#email-error', '');
      $('#login-password').placeholder = 'Password updated — log in';
    });
  });
});
