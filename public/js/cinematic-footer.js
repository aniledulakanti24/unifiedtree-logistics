// ==========================================================================
// UT Logistics — Cinematic Motion Footer Controller (GSAP + ScrollTrigger)
// ==========================================================================
(function () {
  'use strict';

  function initCinematicFooter() {
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;

    // 1. Magnetic Buttons with elastic physics
    const magneticBtns = document.querySelectorAll('.footer-glass-pill, .magnetic-btn');
    magneticBtns.forEach((btn) => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const deltaX = e.clientX - centerX;
        const deltaY = e.clientY - centerY;

        if (gsap) {
          gsap.to(btn, {
            x: deltaX * 0.35,
            y: deltaY * 0.35,
            rotationX: -deltaY * 0.12,
            rotationY: deltaX * 0.12,
            scale: 1.04,
            ease: 'power2.out',
            duration: 0.35,
            overwrite: 'auto',
          });
        }
      });

      btn.addEventListener('mouseleave', () => {
        if (gsap) {
          gsap.to(btn, {
            x: 0,
            y: 0,
            rotationX: 0,
            rotationY: 0,
            scale: 1,
            ease: 'elastic.out(1, 0.35)',
            duration: 1.1,
            overwrite: 'auto',
          });
        }
      });
    });

    // 2. GSAP ScrollTrigger Parallax & Stagger
    if (gsap && ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);

      const curtain = document.querySelector('.cinematic-curtain');
      const giantText = document.querySelector('.footer-giant-bg-text');
      const heading = document.querySelector('.footer-heading');
      const pills = document.querySelector('.footer-pills-wrap');

      if (curtain && giantText) {
        gsap.fromTo(
          giantText,
          { y: '8vh', scale: 0.82, opacity: 0 },
          {
            y: '0vh',
            scale: 1,
            opacity: 1,
            ease: 'power1.out',
            scrollTrigger: {
              trigger: curtain,
              start: 'top 85%',
              end: 'bottom bottom',
              scrub: 1,
            },
          }
        );
      }

      if (curtain && heading && pills) {
        gsap.fromTo(
          [heading, pills],
          { y: 40, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            stagger: 0.15,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: curtain,
              start: 'top 50%',
              end: 'bottom bottom',
              scrub: 1,
            },
          }
        );
      }
    }

    // 3. Back to top button
    const backToTopBtn = document.getElementById('footerBackToTop');
    if (backToTopBtn) {
      backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCinematicFooter);
  } else {
    initCinematicFooter();
  }
})();
