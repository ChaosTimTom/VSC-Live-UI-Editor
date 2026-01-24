const isScrollable = (el: HTMLElement) => {
  const cs = window.getComputedStyle(el);
  const oy = cs.overflowY;
  const ox = cs.overflowX;

  const scrollY = (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1;
  const scrollX = (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1;

  return scrollY || scrollX;
};

export function getScrollParents(el: HTMLElement, stopAt?: HTMLElement | null): HTMLElement[] {
  const parents: HTMLElement[] = [];
  let cur: HTMLElement | null = el.parentElement;

  while (cur) {
    if (stopAt && cur === stopAt) break;
    if (isScrollable(cur)) parents.push(cur);
    cur = cur.parentElement;
  }

  return parents;
}
