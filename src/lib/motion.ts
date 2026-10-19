import { cubicInOut } from 'svelte/easing';

/** Out-transition that fades, shrinks and collapses the element's height so the list closes the gap smoothly. */
export function collapse(node: Element, { duration = 340 } = {}) {
  const style = getComputedStyle(node);
  const h = parseFloat(style.height);
  const mb = parseFloat(style.marginBottom);
  return {
    duration,
    easing: cubicInOut,
    css: (t: number) =>
      `overflow:hidden;opacity:${t};transform:scale(${0.92 + t * 0.08});height:${t * h}px;margin-bottom:${t * mb}px`,
  };
}

export const vibrate = (ms = 10) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};
