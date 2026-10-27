// Accounts and cached data in the app's localStorage (only on this TV). The Synergia password is
// kept because a Synergia session can't be renewed without it — the same trade-off as on iOS.

const ACCOUNTS = 'dziennik.accounts';
const CURRENT = 'dziennik.current';
const DATA = 'dziennik.data.';
const MESSAGES = 'dziennik.messages.';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Storage full or unavailable: the app still works, only without the offline cache.
  }
}

export function accounts() {
  return read(ACCOUNTS, []);
}

export function currentAccount() {
  const list = accounts();
  const login = read(CURRENT, null);
  return list.find((a) => a.login === login) || list[0] || null;
}

export function setCurrent(login) {
  write(CURRENT, login);
}

/** Adds or replaces an account (same login) and makes it current. */
export function saveAccount(account) {
  const list = accounts().filter((a) => a.login !== account.login);
  list.push(account);
  write(ACCOUNTS, list);
  setCurrent(account.login);
}

export function updateSession(login, session) {
  if (!session || !session.cookies) return;
  const list = accounts();
  const account = list.find((a) => a.login === login);
  if (!account) return;
  account.session = session;
  write(ACCOUNTS, list);
}

export function removeAccount(login) {
  write(ACCOUNTS, accounts().filter((a) => a.login !== login));
  write(DATA + login, null);
  write(MESSAGES + login, null);
  const next = accounts()[0];
  write(CURRENT, next ? next.login : null);
}

export function data(login) {
  return read(DATA + login, null);
}

export function saveData(login, value) {
  write(DATA + login, value);
}

export function messages(login) {
  return read(MESSAGES + login, {});
}

export function saveMessages(login, value) {
  write(MESSAGES + login, value);
}
