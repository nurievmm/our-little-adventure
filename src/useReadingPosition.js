import { useLayoutEffect, useRef } from 'react';

const storageKey = 'our-little-adventure:reading-position';
const stopSelector = '[data-reading-stop]';

function readPosition() {
  try {
    const position = JSON.parse(window.localStorage.getItem(storageKey));
    if (position && Number.isFinite(position.y) && position.y >= 0) return position;
  } catch {
    // Storage can be blocked or contain invalid data.
  }
  return null;
}

export function useReadingPosition(ready) {
  const journal = useRef(null);
  const restore = useRef(null);

  useLayoutEffect(() => {
    const root = journal.current;
    const saved = window.location.hash ? null : readPosition();
    let timer;
    let moved = false;

    if (saved) {
      window.history.scrollRestoration = 'manual';
      restore.current = () => {
        restore.current = null;
        if (window.location.hash) return;
        const stop = [...root.querySelectorAll(stopSelector)]
          .find((element) => element.dataset.readingStop === saved.stop);
        const bounds = stop?.getBoundingClientRect();
        const progress = saved.progress;
        const top = bounds && Number.isFinite(progress) && progress >= 0 && progress <= 1
          ? window.scrollY + bounds.top + bounds.height * progress
          : saved.y;
        window.scrollTo({ top, behavior: 'instant' });
      };
    }

    function save() {
      window.clearTimeout(timer);
      timer = undefined;
      if (!moved) return;
      moved = false;
      const y = Math.max(0, window.scrollY);
      const stop = [...root.querySelectorAll(stopSelector)]
        .findLast((element) => element.getBoundingClientRect().top <= 1);
      const bounds = stop?.getBoundingClientRect();
      const position = bounds && bounds.height > 0 && bounds.bottom >= 0
        ? { y, stop: stop.dataset.readingStop, progress: Math.max(0, -bounds.top / bounds.height) }
        : { y };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(position));
      } catch {
        // The story still works when storage is unavailable.
      }
    }

    function onScroll() {
      restore.current = null;
      moved = true;
      if (timer === undefined) timer = window.setTimeout(save, 160);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') save();
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useLayoutEffect(() => {
    if (ready) restore.current?.();
  }, [ready]);

  return journal;
}
