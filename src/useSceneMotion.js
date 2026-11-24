import { useEffect } from 'react';

const clampProgress = (value) => Math.min(1, Math.max(0, value));

export function useSceneMotion(journal, ready) {
  useEffect(() => {
    if (!ready || !('IntersectionObserver' in window)) return;

    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const scenes = journal.current.querySelectorAll('[data-reading-stop]');
    const nearby = new Set();
    let frame = 0;

    function render() {
      frame = 0;
      const height = window.innerHeight;
      const revealDistance = Math.min(160, Math.max(64, height * .18));
      const positions = Array.from(nearby, (scene) => [scene, scene.getBoundingClientRect()]);
      for (const [scene, bounds] of positions) {
        const progress = (height - bounds.top) / (height + bounds.height);
        const captionProgress = (height - bounds.bottom) / revealDistance + .85;
        scene.style.setProperty('--scene-progress', clampProgress(progress));
        scene.style.setProperty('--caption-progress', clampProgress(captionProgress));
      }
    }

    function schedule() {
      if (nearby.size && !frame) frame = window.requestAnimationFrame(render);
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) nearby.add(entry.target);
        else nearby.delete(entry.target);
      }
      schedule();
    }, { rootMargin: '120px 0px' });

    function stop() {
      observer.disconnect();
      nearby.clear();
      window.cancelAnimationFrame(frame);
      frame = 0;
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    }

    function syncPreference() {
      stop();
      if (preference.matches) return;
      scenes.forEach((scene) => observer.observe(scene));
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule);
    }

    syncPreference();
    preference.addEventListener('change', syncPreference);
    return () => {
      stop();
      preference.removeEventListener('change', syncPreference);
    };
  }, [journal, ready]);
}
