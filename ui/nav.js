// Remote-control navigation: arrows move focus to the nearest `.focusable` in that direction,
// OK clicks, Back closes the top layer. Zones (`data-zone`) remember their last focused element,
// so going back from the content to the menu and in again lands where you were.

export const KEY = {
  LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
  BACK: 461, ESC: 27, BACKSPACE: 8,
  RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
  CH_UP: 33, CH_DOWN: 34,
};

const DIRS = { [KEY.LEFT]: 'left', [KEY.UP]: 'up', [KEY.RIGHT]: 'right', [KEY.DOWN]: 'down' };
const zoneMemory = {};
let handlers = { back: () => false, key: () => false };

/** The top-most open layer (overlay) or the whole document. */
function scope() {
  const layers = document.querySelectorAll('.layer');
  return layers.length ? layers[layers.length - 1] : document;
}

function visible(el) {
  if (el.disabled || el.closest('[hidden]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function focusables(root) {
  return Array.from((root || scope()).querySelectorAll('.focusable')).filter(visible);
}

function zoneOf(el) {
  const z = el && el.closest('[data-zone]');
  return z ? z.dataset.zone : null;
}

/** Scrolls the nearest scrollable parent so `el` has some breathing room around it. */
function reveal(el) {
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);
    if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) break;
    parent = parent.parentElement;
  }
  if (!parent || parent === document.body) return;
  const margin = 96;
  const p = parent.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.top < p.top + margin) parent.scrollTop -= p.top + margin - r.top;
  else if (r.bottom > p.bottom - margin) parent.scrollTop += r.bottom - (p.bottom - margin);
}

export function focus(el) {
  if (!el) return false;
  el.focus({ preventScroll: true });
  reveal(el);
  const zone = zoneOf(el);
  if (zone) zoneMemory[zone] = el.dataset.key || null;
  return true;
}

function remembered(zone, root) {
  const key = zoneMemory[zone];
  if (!key) return null;
  const el = root.querySelector(`[data-zone="${zone}"] .focusable[data-key="${CSS.escape(key)}"]`);
  return el && visible(el) ? el : null;
}

/** Focus inside `root`: the remembered element of its zone, else the first one. */
export function focusFirst(root) {
  const container = root || scope();
  const zone = container.dataset && container.dataset.zone;
  const target = (zone && remembered(zone, document)) || focusables(container)[0];
  return focus(target);
}

/** After a re-render: focus the element with the same key, or fall back to `fallback`. */
export function restore(key, container, fallback) {
  if (key) {
    const el = container.querySelector(`.focusable[data-key="${CSS.escape(key)}"]`);
    if (el && visible(el)) return focus(el);
  }
  return fallback ? focusFirst(fallback) : false;
}

function current() {
  const el = document.activeElement;
  return el && el.classList && el.classList.contains('focusable') && scope().contains(el) ? el : null;
}

function best(from, dir, candidates) {
  const a = from.getBoundingClientRect();
  const ax = (a.left + a.right) / 2;
  const ay = (a.top + a.bottom) / 2;
  let winner = null;
  let winnerScore = Infinity;
  for (const el of candidates) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const bx = (b.left + b.right) / 2;
    const by = (b.top + b.bottom) / 2;
    let primary;
    let gap;
    if (dir === 'right') { if (bx <= ax + 1 || b.left < a.right - a.width / 2) continue; primary = Math.max(0, b.left - a.right); gap = Math.max(0, a.top - b.bottom, b.top - a.bottom); }
    if (dir === 'left') { if (bx >= ax - 1 || b.right > a.left + a.width / 2) continue; primary = Math.max(0, a.left - b.right); gap = Math.max(0, a.top - b.bottom, b.top - a.bottom); }
    if (dir === 'down') { if (by <= ay + 1 || b.top < a.bottom - a.height / 2) continue; primary = Math.max(0, b.top - a.bottom); gap = Math.max(0, a.left - b.right, b.left - a.right); }
    if (dir === 'up') { if (by >= ay - 1 || b.bottom > a.top + a.height / 2) continue; primary = Math.max(0, a.top - b.bottom); gap = Math.max(0, a.left - b.right, b.left - a.right); }
    // Prefer elements in line with the current one, then the closest.
    const offset = dir === 'left' || dir === 'right' ? Math.abs(by - ay) : Math.abs(bx - ax);
    const score = primary + gap * 4 + offset * 0.3;
    if (score < winnerScore) {
      winnerScore = score;
      winner = el;
    }
  }
  return winner;
}

export function move(dir) {
  const from = current();
  const candidates = focusables();
  if (!from) return focus(candidates[0]);
  let target = best(from, dir, candidates);
  if (!target) return false;
  const fromZone = zoneOf(from);
  const toZone = zoneOf(target);
  if (toZone && toZone !== fromZone) target = remembered(toZone, scope()) || target;
  return focus(target);
}

function scrollRegion(el, dir) {
  if (!el || !el.classList.contains('scroll-region')) return false;
  const step = Math.round(el.clientHeight * 0.6);
  if (dir === 'down' && el.scrollTop + el.clientHeight < el.scrollHeight - 2) {
    el.scrollTop += step;
    return true;
  }
  if (dir === 'up' && el.scrollTop > 0) {
    el.scrollTop -= step;
    return true;
  }
  return false;
}

function isTextInput(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

function onKeyDown(e) {
  const code = e.keyCode;
  const active = document.activeElement;
  if (code === KEY.BACK || code === KEY.ESC || (code === KEY.BACKSPACE && !isTextInput(active))) {
    e.preventDefault();
    handlers.back();
    return;
  }
  if (handlers.key(code, e)) {
    e.preventDefault();
    return;
  }
  const dir = DIRS[code];
  if (dir) {
    if (isTextInput(active) && (dir === 'left' || dir === 'right')) {
      const atStart = active.selectionStart === 0 && active.selectionEnd === 0;
      const atEnd = active.selectionStart === active.value.length;
      if ((dir === 'left' && !atStart) || (dir === 'right' && !atEnd)) return;
    }
    e.preventDefault();
    if (!scrollRegion(current(), dir)) move(dir);
    return;
  }
  if (code === KEY.ENTER) {
    const el = current();
    if (!el) return;
    e.preventDefault();
    if (isTextInput(el)) move('down');
    else el.click();
  }
}

export function initNav(options) {
  handlers = Object.assign(handlers, options);
  document.addEventListener('keydown', onKeyDown, true);
  // Magic Remote pointer: hovering focuses, like moving with arrows.
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('.focusable');
    if (el && el !== document.activeElement && scope().contains(el)) focus(el);
  });
}
