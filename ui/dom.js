// Tiny DOM helpers. All data from Librus goes in as text nodes, never as HTML.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const key of Object.keys(props)) {
      const v = props[key];
      if (v === null || v === undefined || v === false) continue;
      if (key === 'class') el.className = v;
      else if (key === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (key.startsWith('on') && typeof v === 'function') el.addEventListener(key.slice(2).toLowerCase(), v);
      else el.setAttribute(key, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Element reachable with the remote. `key` lets focus survive a re-render. */
export function f(tag, props, ...children) {
  const p = Object.assign({}, props);
  p.class = `focusable ${p.class || ''}`.trim();
  p.tabindex = '-1';
  if (p.key !== undefined) {
    p['data-key'] = p.key;
    delete p.key;
  }
  return h(tag, p, ...children);
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

const ICONS = {
  home: 'M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z',
  calendar: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h3v3H8z',
  grade: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
  agenda: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  check: 'M4 12.5 9 17.5 20 6.5',
  mail: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm-1 1 9 6 9-6',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  megaphone: 'M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1zM17 9a4 4 0 0 1 0 6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  clip: 'M8 12.5l6.4-6.4a3 3 0 0 1 4.2 4.2l-8 8a5 5 0 0 1-7-7L11 4',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  play: 'M8 5v14l11-7z',
};

export function icon(name, cls) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon ${cls || ''}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name] || '');
  svg.appendChild(path);
  return svg;
}
