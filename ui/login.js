// Login with a Synergia login and password (the method that works since Librus disabled the
// password grant; see the iOS app). Konto Librus (e-mail) needs a web page with reCAPTCHA,
// which isn't usable with a TV remote.

import { h, f } from './dom.js';
import { call } from './bridge.js';
import * as store from './store.js';

export function loginPanel({ cancellable, onDone, onCancel }) {
  const login = f('input', { class: 'input', type: 'text', placeholder: 'np. 1234567u', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', key: 'login' });
  const password = f('input', { class: 'input', type: 'password', placeholder: 'hasło do Synergii', autocomplete: 'off', key: 'password' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const submit = f('button', { class: 'button primary', key: 'submit', onclick: () => run(login.value.trim(), password.value) }, 'Zaloguj');
  const demo = f('button', { class: 'button', key: 'demo', onclick: () => run('demo', 'demo') }, 'Wypróbuj na danych demonstracyjnych');
  let busy = false;

  async function run(loginValue, passwordValue) {
    if (busy) return;
    if (!loginValue || !passwordValue) {
      error.textContent = 'Wpisz login i hasło.';
      return;
    }
    busy = true;
    error.textContent = '';
    submit.textContent = 'Logowanie…';
    submit.disabled = true;
    try {
      const account = { login: loginValue, password: passwordValue };
      const { profile, session } = await call('login', { account });
      store.saveAccount({
        login: profile.login,
        password: passwordValue,
        studentName: profile.studentName,
        isParent: profile.isParent,
        session,
      });
      onDone();
    } catch (e) {
      error.textContent = e.message;
    } finally {
      busy = false;
      submit.textContent = 'Zaloguj';
      submit.disabled = false;
    }
  }

  return h(
    'div',
    { class: 'login' },
    h('img', { class: 'login-icon', src: 'largeIcon.png', alt: '' }),
    h('h1', null, 'Dziennik'),
    h('p', { class: 'lead' }, 'Nieoficjalny klient Librus Synergia na telewizor'),
    h('label', null, 'Login Synergii', login),
    h('label', null, 'Hasło', password),
    error,
    h('div', { class: 'actions' }, submit, demo, cancellable ? f('button', { class: 'button', key: 'cancel', onclick: onCancel }, 'Anuluj') : null),
    h(
      'p',
      { class: 'note' },
      'Użyj loginu i hasła do synergia.librus.pl. Logowanie Kontem Librus (e-mail) nie działa na telewizorze. ',
      'Hasło zostaje zapisane tylko na tym telewizorze, bo bez niego nie da się odnowić sesji Synergii.'
    )
  );
}
