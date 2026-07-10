/* =============================================
   UNSPOTTED — main.js
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* --- Mobile menu --- */
  const hamburger = document.querySelector('.navbar__hamburger');
  const overlay   = document.querySelector('.nav-overlay');

  if (hamburger && overlay) {
    hamburger.addEventListener('click', () => {
      const isOpen = hamburger.classList.toggle('is-open');
      overlay.classList.toggle('is-open', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    overlay.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('is-open');
        overlay.classList.remove('is-open');
        document.body.style.overflow = '';
      });
    });
  }

  /* --- Scroll fade-in (Intersection Observer) --- */
  const fadeEls = document.querySelectorAll('.fade-in');

  if (fadeEls.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    fadeEls.forEach(el => observer.observe(el));
  }

  /* --- Hero parallax (index only) --- */
  const heroLogo = document.querySelector('.hero__logo-wrap');

  if (heroLogo) {
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      heroLogo.style.transform = `translateY(${y * 0.25}px)`;
    }, { passive: true });
  }

  /* --- Hero fade-in sequence (index only) --- */
  const heroLogoEl  = document.querySelector('.hero__logo');
  const heroTagline = document.querySelector('.hero__tagline');

  if (heroLogoEl) {
    heroLogoEl.style.opacity = '0';
    heroLogoEl.style.transition = 'opacity 1.5s ease';
    requestAnimationFrame(() => {
      setTimeout(() => { heroLogoEl.style.opacity = '1'; }, 100);
    });
  }

  if (heroTagline) {
    heroTagline.style.opacity = '0';
    heroTagline.style.transition = 'opacity 1.2s ease';
    setTimeout(() => { heroTagline.style.opacity = '1'; }, 1600);
  }

});
