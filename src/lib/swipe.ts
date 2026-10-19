/** Horizontal swipe to page (months / days). Returns props to spread on the swipe area.
 *  Swiping left (finger moves left) goes forward (+1), like turning a page. */
export function useSwipe(onPage: (dir: 1 | -1) => void, min = 60) {
  let x = 0;
  let y = 0;
  let t = 0;
  let active = false;
  return {
    onpointerdown(e: PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      active = true;
      x = e.clientX;
      y = e.clientY;
      t = performance.now();
    },
    onpointerup(e: PointerEvent) {
      if (!active) return;
      active = false;
      const dx = e.clientX - x;
      const dy = e.clientY - y;
      const fast = Math.abs(dx) / Math.max(1, performance.now() - t) > 0.5;
      if (Math.abs(dx) > Math.abs(dy) * 1.5 && (Math.abs(dx) > min || (fast && Math.abs(dx) > 30))) {
        // swallow the click that would otherwise open a day / create a task
        const stop = (ev: Event) => (ev.stopPropagation(), ev.preventDefault());
        addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => removeEventListener('click', stop, { capture: true }), 0);
        onPage(dx < 0 ? 1 : -1);
      }
    },
    onpointercancel() {
      active = false;
    },
  };
}
