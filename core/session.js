'use strict';

// Synergia login + password session and the API 2.0 gateway. Port of CredentialSynergiaSession
// and LibrusAPI.gateway from the iOS app: api.librus.pl/OAuth/Token no longer accepts the
// password grant (`unsupported_grant_type`), so we log in through the Synergia website form
// (client_id 46, as in librus-apix) and call synergia.librus.pl/gateway/api/2.0 with cookies.

const C = require('./constants');
const { HttpClient } = require('./http');
const { LibrusError } = require('./errors');
const { str, arr } = require('./json');

class SynergiaSession {
  /**
   * @param {{login: string, password: string, cookies?: object, sessionAt?: number}} credentials
   */
  constructor(credentials) {
    if (!credentials || !credentials.login || !credentials.password) {
      throw new LibrusError('notLoggedIn');
    }
    this.login = credentials.login;
    this.password = credentials.password;
    this.http = new HttpClient(credentials.cookies);
    this.sessionAt = credentials.cookies ? Number(credentials.sessionAt) || 0 : 0;
    this.loginTask = null;
  }

  /** State handed back to the app so the next call can reuse the session. */
  state() {
    return { cookies: this.http.serializeCookies(), sessionAt: this.sessionAt };
  }

  async ensureLoggedIn(force) {
    if (!force && Date.now() - this.sessionAt < C.sessionLifetimeMs - 60000) return;
    if (!this.loginTask) {
      this.loginTask = this.performLogin().then(
        () => { this.loginTask = null; },
        (e) => { this.loginTask = null; throw e; }
      );
    }
    return this.loginTask;
  }

  /** Short-lived `oauth_token` cookie needed by the gateway API. */
  async refreshGatewayToken() {
    const response = await this.http.send(`${C.synergiaURL}/refreshToken`, { userAgent: C.webUserAgent });
    return response.status === 200;
  }

  async performLogin() {
    this.http.clearCookies();
    this.sessionAt = 0;
    const ua = C.webUserAgent;
    const start = await this.http.send(`${C.synergiaURL}/loguj/portalRodzina?v=${Math.floor(Date.now() / 1000)}`, { userAgent: ua });
    if (start.status === 503 || start.text.includes('Przerwa techniczna')) throw new LibrusError('maintenance');

    const response = await this.http.send(`${C.apiOAuthURL}/Authorization?client_id=${C.synergiaWebClientID}`, {
      method: 'POST',
      form: [['action', 'login'], ['login', this.login], ['pass', this.password]],
      userAgent: ua,
    });
    if (response.status === 503) throw new LibrusError('maintenance');
    const json = response.json();
    if (str(json.status) === 'error') {
      const first = arr(json.errors)[0];
      const message = (first && str(first.message)) || 'nieznany błąd';
      if (message.toLowerCase().includes('nieprawidłowy login')) throw new LibrusError('invalidLogin');
      throw new LibrusError('synergiaSession', message);
    }

    const finish = await this.http.send(`${C.apiOAuthURL}/Authorization/2FA?client_id=${C.synergiaWebClientID}`, { userAgent: ua });
    if (finish.url.includes('error=')) {
      throw new LibrusError('synergiaSession', `Librus odrzucił logowanie (${finish.url.includes('access_denied') ? 'brak dostępu' : 'błąd'})`);
    }
    if (!(await this.refreshGatewayToken())) {
      throw new LibrusError('synergiaSession', 'nie udało się uzyskać tokenu API');
    }
    this.sessionAt = Date.now();
  }

  // MARK: API 2.0 through the gateway (port of LibrusAPI.get incl. error mapping)

  async get(endpoint, method) {
    try {
      return await this.request(endpoint, method || 'GET', false);
    } catch (e) {
      if (e.code !== 'tokenExpired') throw e;
      return this.request(endpoint, method || 'GET', true);
    }
  }

  async request(endpoint, method, forceRefresh) {
    if (forceRefresh) {
      if (!(await this.refreshGatewayToken())) await this.ensureLoggedIn(true);
    } else {
      await this.ensureLoggedIn(false);
    }
    const response = await this.http.send(`${C.gatewayAPIURL}/${endpoint}`, { method });
    if (response.status === 503) throw new LibrusError('maintenance');
    let json = null;
    try {
      json = JSON.parse(response.text);
    } catch (e) {
      json = null;
    }
    if (response.status === 200) {
      if (json) return json;
      // A dead session may be redirected to an HTML login page instead of getting 401.
      if (!forceRefresh) throw new LibrusError('tokenExpired');
      throw new LibrusError('invalidResponse', `${endpoint}: odpowiedź nie jest w formacie JSON`);
    }
    // Expired token/session: retry once with fresh authentication.
    if (response.status === 401 && !forceRefresh) throw new LibrusError('tokenExpired');
    throwError(json || {}, response.status);
    return json;
  }
}

function throwError(json, status) {
  const code = str(json.Code) || str(json.Message) || str(json.Status) || `HTTP ${status}`;
  const message = str(json.Message);
  switch (code) {
    case 'TokenIsExpired': throw new LibrusError('tokenExpired');
    case 'Maintenance': throw new LibrusError('maintenance');
    case 'AccessDeny':
      if (message === 'Student timetable is not public') throw new LibrusError('timetableNotPublic');
      throw new LibrusError('accessDenied', message || code);
    case 'Request is denied':
    case 'Insufficient scopes':
      throw new LibrusError('accessDenied', code);
    case 'LuckyNumberIsNotActive': throw new LibrusError('featureNotActive', 'szczęśliwy numerek');
    case 'NotesIsNotActive': throw new LibrusError('featureNotActive', 'uwagi');
    default:
      if (status === 401) throw new LibrusError('tokenExpired');
      throw new LibrusError('api', message ? `${code}: ${message}` : code);
  }
}

module.exports = { SynergiaSession, throwError };
