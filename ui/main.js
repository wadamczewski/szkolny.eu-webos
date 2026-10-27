// App shell: menu, sections, layers (dialogs), login, refreshing data.

import { h, f, icon, clear } from './dom.js';
import { initNav, focus, focusFirst, focusables, restore, KEY } from './nav.js';
import { call, onTV } from './bridge.js';
import * as store from './store.js';
import * as fmt from './format.js';
import { VIEWS } from './views.js';
import { loginPanel } from './login.js';

const SECTIONS = [
  ['home', 'Start', 'home'],
  ['timetable', 'Plan lekcji', 'calendar'],
  ['grades', 'Oceny', 'grade'],
  ['agenda', 'Terminarz', 'agenda'],
  ['attendance', 'Frekwencja', 'check'],
  ['messages', 'Wiadomości', 'mail'],
  ['notices', 'Uwagi', 'flag'],
  ['announcements', 'Ogłoszenia', 'megaphone'],
  ['account', 'Konto', 'user'],
];
const STALE_MS = 10 * 60 * 1000;
const AUTO_REFRESH_MS = 30 * 60 * 1000;

const root = document.getElementById('app');
const layers = [];

export const app = {
  account: null,
  data: null,
  weeks: {},
  weekStart: fmt.defaultWeek(),
  messages: {},
  section: 'home',
  syncing: false,
  error: null,
  ui: {},

  go(section, intoContent) {
    if (!VIEWS[section]) return;
    const changed = section !== app.section;
    app.section = section;
    for (const item of root.querySelectorAll('.nav-item')) item.classList.toggle('active', item.dataset.section === section);
    if (changed || !content().firstChild) renderSection(false);
    if (intoContent) {
      // Land on the list, not on the header buttons (semester, folder…).
      const main = Array.from(content().querySelectorAll('[data-zone]')).find((z) => z.dataset.zone !== 'actions' && focusables(z).length);
      focusFirst(main || content());
    }
  },

  /** Re-render the current section, keeping focus on the same element if possible. */
  render() {
    renderSection(true);
    renderStatus();
  },

  /** Calls the service for the current account and stores the renewed session. */
  async api(method, params) {
    const account = app.account;
    const result = await call(method, Object.assign({ account: credentials(account) }, params));
    if (result.session) {
      store.updateSession(account.login, result.session);
      account.session = result.session;
    }
    return result;
  },

  async refresh(manual) {
    if (app.syncing || !app.account) return;
    app.syncing = true;
    app.error = null;
    renderStatus();
    try {
      const { data } = await app.api('sync', { weekStart: fmt.defaultWeek() });
      app.data = data;
      app.weeks = { [data.timetable.weekStart]: data.timetable.days };
      store.saveData(app.account.login, data);
      if (manual) toast('Dane zaktualizowane.');
      if (data.warnings && data.warnings.length) toast(`Część danych nie wczytała się (${data.warnings.length}). Szczegóły w zakładce Konto.`, 'warn');
    } catch (e) {
      app.error = e.message;
      toast(e.code === 'invalidLogin' ? 'Librus nie przyjął hasła. Zaloguj się ponownie w zakładce Konto.' : e.message, 'error');
    } finally {
      app.syncing = false;
      app.render();
    }
  },

  async loadWeek(start) {
    if (app.weeks[start]) return app.weeks[start];
    const { timetable } = await app.api('timetable', { weekStart: start });
    app.weeks[timetable.weekStart] = timetable.days;
    return timetable.days;
  },

  async loadMessages(folder, force) {
    const cached = app.messages[folder];
    if (!force && cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) return cached.list;
    const { messages } = await app.api('messages', { folder });
    app.messages[folder] = { list: messages, fetchedAt: Date.now() };
    store.saveMessages(app.account.login, app.messages);
    return messages;
  },

  openLayer: openLayer,
  closeLayer: closeLayer,
  toast: toast,

  switchAccount(login) {
    store.setCurrent(login);
    load();
  },

  addAccount() {
    openLayer((close) => loginPanel({ cancellable: true, onDone: () => { close(); load(); }, onCancel: close }), { mandatory: false });
  },

  removeAccount(login) {
    store.removeAccount(login);
    load();
  },
};

function credentials(account) {
  const session = account.session || {};
  return { login: account.login, password: account.password, cookies: session.cookies || null, sessionAt: session.sessionAt || 0 };
}

function content() {
  return root.querySelector('.content');
}

function renderSection(keepFocus) {
  const el = content();
  if (!el) return;
  const active = document.activeElement;
  const inContent = keepFocus && el.contains(active);
  const key = inContent ? active.dataset.key : null;
  const scrolls = keepFocus ? Array.from(el.querySelectorAll('.scroll')).map((s) => s.scrollTop) : [];
  clear(el);
  el.scrollTop = 0;
  VIEWS[app.section](el, app);
  if (keepFocus) el.querySelectorAll('.scroll').forEach((s, i) => { if (scrolls[i]) s.scrollTop = scrolls[i]; });
  if (inContent) restore(key, el, el);
}

function renderStatus() {
  const status = root.querySelector('.sync-status');
  if (!status) return;
  clear(status);
  if (app.syncing) status.append(h('span', { class: 'spinner' }), 'Aktualizowanie…');
  else if (app.error) status.append(h('span', { class: 'dot error' }), 'Błąd odświeżania');
  else status.append(h('span', { class: 'dot' }), `Dane: ${fmt.sinceLabel(app.data && app.data.fetchedAt)}`);
}

function renderShell() {
  clear(root);
  let focusTimer = null;
  const nav = h(
    'nav',
    { class: 'nav', 'data-zone': 'menu' },
    SECTIONS.map(([id, label, iconName]) =>
      f(
        'div',
        {
          class: `nav-item ${id === app.section ? 'active' : ''}`,
          key: `nav-${id}`,
          'data-section': id,
          onclick: () => app.go(id, true),
          onfocus: (e) => {
            // Browsing the menu previews the section; OK or → goes into it.
            const item = e.currentTarget;
            clearTimeout(focusTimer);
            focusTimer = setTimeout(() => {
              if (document.activeElement === item) app.go(id, false);
            }, 140);
          },
        },
        icon(iconName),
        h('span', null, label)
      )
    )
  );
  const student = app.data && app.data.studentName ? app.data.studentName : app.account.studentName;
  const accounts = store.accounts();
  const sidebar = h(
    'aside',
    { class: 'sidebar' },
    h('div', { class: 'brand' }, h('img', { src: 'icon.png', alt: '' }), h('div', null, h('strong', null, 'Dziennik'), h('span', { class: 'clock' }, fmt.time()))),
    h(
      'div',
      { 'data-zone': 'menu' },
      f(
        'div',
        { class: 'student', key: 'student', onclick: () => (accounts.length > 1 ? chooseStudent() : app.go('account', true)) },
        h('span', { class: 'avatar' }, initials(student)),
        h('span', { class: 'student-name' }, h('strong', null, student), h('small', null, accounts.length > 1 ? 'Zmień ucznia' : app.account.login))
      )
    ),
    nav,
    h('div', { class: 'sync-status' })
  );
  const hints = h(
    'footer',
    { class: 'hints' },
    h('span', null, h('kbd', null, 'OK'), ' wybierz'),
    h('span', null, h('kbd', null, '↩'), ' wstecz'),
    h('span', null, h('i', { class: 'key red' }), ' odśwież'),
    accounts.length > 1 ? h('span', null, h('i', { class: 'key green' }), ' zmień ucznia') : null,
    h('span', null, h('i', { class: 'key yellow' }), ' plan lekcji'),
    h('span', null, h('i', { class: 'key blue' }), ' oceny')
  );
  root.append(sidebar, h('main', { class: 'content', 'data-zone': 'content' }), hints);
  renderStatus();
}

function initials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function chooseStudent() {
  openLayer((close) =>
    h(
      'div',
      { class: 'dialog' },
      h('h2', null, 'Wybierz ucznia'),
      store.accounts().map((a) =>
        f(
          'div',
          { class: `row ${a.login === app.account.login ? 'selected' : ''}`, key: `pick-${a.login}`, onclick: () => { close(); app.switchAccount(a.login); } },
          h('span', { class: 'avatar small' }, initials(a.studentName)),
          h('div', { class: 'row-main' }, h('strong', null, a.studentName), h('small', null, a.login)),
          a.login === app.account.login ? h('span', { class: 'badge' }, 'aktywny') : null
        )
      )
    )
  );
}

function nextStudent() {
  const list = store.accounts();
  if (list.length < 2) return;
  const i = list.findIndex((a) => a.login === app.account.login);
  const next = list[(i + 1) % list.length];
  app.switchAccount(next.login);
  toast(`Uczeń: ${next.studentName}`);
}

// MARK: layers

function openLayer(build, options) {
  const opts = Object.assign({ mandatory: false }, options);
  const previous = document.activeElement;
  const layer = h('div', { class: 'layer' });
  const close = () => closeLayer(layer);
  layer._opts = opts;
  layer._previous = previous;
  layer.append(build(close));
  document.body.append(layer);
  layers.push(layer);
  focusFirst(layer);
  return close;
}

function closeLayer(layer) {
  const target = layer || layers[layers.length - 1];
  if (!target) return;
  layers.splice(layers.indexOf(target), 1);
  target.remove();
  if (target._previous && document.body.contains(target._previous)) focus(target._previous);
  else focusFirst(content() || document);
}

let toastTimer = null;
function toast(message, kind) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div', { class: 'toast' });
    document.body.append(el);
  }
  el.className = `toast show ${kind || ''}`;
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), kind === 'error' ? 7000 : 3500);
}

// MARK: keys

function onBack() {
  const top = layers[layers.length - 1];
  if (top) {
    if (!top._opts.mandatory) closeLayer(top);
    else if (onTV) window.close();
    return;
  }
  const active = document.activeElement;
  if (content() && content().contains(active)) {
    focus(root.querySelector(`.nav-item[data-section="${app.section}"]`));
    return;
  }
  if (app.section !== 'home') {
    app.go('home', false);
    focus(root.querySelector('.nav-item[data-section="home"]'));
    return;
  }
  if (onTV) window.close();
}

function onKey(code) {
  if (layers.length) return false;
  const active = document.activeElement;
  if (code === KEY.RIGHT && active && active.classList.contains('nav-item') && active.dataset.section !== app.section) {
    // → pressed before the menu preview kicked in.
    app.go(active.dataset.section, true);
    return true;
  }
  switch (code) {
    case KEY.RED: app.refresh(true); return true;
    case KEY.GREEN: nextStudent(); return true;
    case KEY.YELLOW: app.go('timetable', true); return true;
    case KEY.BLUE: app.go('grades', true); return true;
    case KEY.CH_UP:
    case KEY.CH_DOWN:
      if (app.section !== 'timetable') return false;
      app.weekStart = fmt.addDays(app.weekStart, code === KEY.CH_UP ? -7 : 7);
      app.render();
      return true;
    default:
      return false;
  }
}

// MARK: start

function load() {
  while (layers.length) closeLayer(layers[0]);
  app.account = store.currentAccount();
  if (!app.account) {
    clear(root);
    openLayer((close) => loginPanel({ cancellable: false, onDone: () => { close(); load(); } }), { mandatory: true });
    return;
  }
  app.data = store.data(app.account.login);
  app.weeks = app.data ? { [app.data.timetable.weekStart]: app.data.timetable.days } : {};
  app.weekStart = fmt.defaultWeek();
  app.messages = store.messages(app.account.login);
  app.error = null;
  app.ui = {};
  app.section = 'home';
  renderShell();
  app.go('home', false);
  focus(root.querySelector('.nav-item[data-section="home"]'));
  if (!app.data || Date.now() - app.data.fetchedAt > STALE_MS) app.refresh(false);
}

initNav({ back: onBack, key: onKey });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && app.data && Date.now() - app.data.fetchedAt > STALE_MS) app.refresh(false);
});
setInterval(() => {
  const clock = root.querySelector('.clock');
  if (clock) clock.textContent = fmt.time();
  renderStatus();
}, 30 * 1000);
setInterval(() => {
  if (!document.hidden && app.account) app.refresh(false);
}, AUTO_REFRESH_MS);
load();
