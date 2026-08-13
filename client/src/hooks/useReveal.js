// Reusable landing motion: reveal-on-scroll + count-up, one IntersectionObserver.
// - Any `.reveal` element fades up when it enters the viewport (once). Stagger a
//   group via `style={{ '--i': index }}` (CSS turns it into a transition-delay).
// - Any `[data-count]` element counts up from 0 to its number once, preserving an
//   optional `data-suffix` (e.g. "+"), without layout shift.
// Respects prefers-reduced-motion: content is shown immediately, no motion.
import { useEffect } from 'react';

export default function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef?.current || document;
    const reveals = [...root.querySelectorAll('.reveal')];
    const counts = [...root.querySelectorAll('[data-count]')];
    const setCountFinal = (el) => {
      el.textContent = el.dataset.count + (el.dataset.suffix || '');
    };

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      reveals.forEach((el) => el.classList.add('is-in'));
      counts.forEach(setCountFinal);
      return;
    }

    const rafs = [];
    const countUp = (el) => {
      const target = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      if (Number.isNaN(target)) {
        setCountFinal(el);
        return;
      }
      const dur = 1500,
        start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(target * e) + suffix;
        if (t < 1) rafs.push(requestAnimationFrame(step));
        else setCountFinal(el);
      };
      rafs.push(requestAnimationFrame(step));
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          if (en.target.dataset.count != null) countUp(en.target);
          else en.target.classList.add('is-in');
          io.unobserve(en.target);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -6% 0px' },
    );

    // `.reveal-now` plays on load (the hero entrance) regardless of scroll; the
    // rest reveal when scrolled into view.
    rafs.push(
      requestAnimationFrame(() => {
        reveals.forEach((el) => {
          if (el.classList.contains('reveal-now')) el.classList.add('is-in');
        });
      }),
    );
    counts.forEach((el) => {
      el.textContent = '0' + (el.dataset.suffix || '');
      io.observe(el);
    });
    reveals.forEach((el) => {
      if (!el.classList.contains('reveal-now')) io.observe(el);
    });
    return () => {
      io.disconnect();
      rafs.forEach(cancelAnimationFrame);
    };
  }, [rootRef]);
}
