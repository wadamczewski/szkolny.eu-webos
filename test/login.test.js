'use strict';

// The Synergia login flow against a local fake server (no real Librus, no real accounts):
// cookies across redirects, POST → GET after 302, gzip, session reuse and renewal.

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const zlib = require('zlib');
const C = require('../core/constants');
const { SynergiaSession } = require('../core/session');
const client = require('../core/client');

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, v] = part.trim().split('=');
    if (k) out[k] = v;
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
  });
}

async function startFakeLibrus(state) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const c = cookies(req);
    const body = await readBody(req);
    state.log.push(`${req.method} ${url.pathname}`);
    const json = (status, obj, gzip) => {
      const data = Buffer.from(JSON.stringify(obj));
      const headers = { 'Content-Type': 'application/json' };
      if (gzip) headers['Content-Encoding'] = 'gzip';
      res.writeHead(status, headers);
      res.end(gzip ? zlib.gzipSync(data) : data);
    };
    switch (url.pathname) {
      case '/loguj/portalRodzina':
        res.writeHead(302, { Location: '/OAuth/Authorization?client_id=46', 'Set-Cookie': 'DZIENNIKSID=start; Path=/' });
        return res.end();
      case '/OAuth/Authorization':
        if (req.method === 'GET') return json(200, {});
        if (!body.includes('login=fikcyjny') || !body.includes('pass=haslo')) {
          return json(200, { status: 'error', errors: [{ message: 'Nieprawidłowy login i/lub hasło.' }] });
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'oauth_session=ok; Path=/' });
        return res.end(JSON.stringify({ status: 'ok', goTo: '/OAuth/Authorization/2FA?client_id=46' }));
      case '/OAuth/Authorization/2FA':
        if (c.oauth_session !== 'ok') {
          res.writeHead(302, { Location: '/landing?error=access_denied' });
          return res.end();
        }
        res.writeHead(302, { Location: '/uczen/index', 'Set-Cookie': 'DZIENNIKSID=logged; Path=/' });
        return res.end();
      case '/uczen/index':
        return json(200, {});
      case '/refreshToken':
        if (c.DZIENNIKSID !== 'logged') return json(401, {});
        state.tokens++;
        res.writeHead(200, { 'Set-Cookie': `oauth_token=t${state.tokens}; Path=/` });
        return res.end();
      case '/gateway/api/2.0/Me':
        if (!c.oauth_token || state.expired.has(c.oauth_token)) return json(401, { Code: 'TokenIsExpired' });
        return json(200, { Me: { Account: { GroupId: 5, FirstName: 'RODZIC', LastName: 'FIKCYJNY' }, User: { FirstName: 'UCZEŃ', LastName: 'FIKCYJNY' } } }, true);
      default:
        return json(404, { Code: 'NotFound' });
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}

test('login flow, session reuse and renewal against a fake server', async (t) => {
  const state = { log: [], tokens: 0, expired: new Set() };
  const { server, base } = await startFakeLibrus(state);
  const saved = Object.assign({}, C);
  t.after(() => {
    Object.assign(C, saved);
    server.close();
  });
  C.synergiaURL = base;
  C.apiOAuthURL = `${base}/OAuth`;
  C.gatewayAPIURL = `${base}/gateway/api/2.0`;

  const result = await client.login({ account: { login: 'fikcyjny', password: 'haslo' } });
  assert.deepStrictEqual(result.profile, { login: 'fikcyjny', studentName: 'Uczeń Fikcyjny', isParent: true });
  assert.deepStrictEqual(state.log.slice(0, 6), [
    'GET /loguj/portalRodzina',
    'GET /OAuth/Authorization',
    'POST /OAuth/Authorization',
    'GET /OAuth/Authorization/2FA',
    'GET /uczen/index',
    'GET /refreshToken',
  ]);

  // The next call reuses the serialized cookies without logging in again.
  state.log = [];
  const account = { login: 'fikcyjny', password: 'haslo', cookies: result.session.cookies, sessionAt: result.session.sessionAt };
  const session = new SynergiaSession(account);
  await session.get('Me');
  assert.deepStrictEqual(state.log, ['GET /gateway/api/2.0/Me']);

  // An expired API token is renewed through /refreshToken, not a full login.
  state.log = [];
  state.expired.add('t1');
  await session.get('Me');
  assert.deepStrictEqual(state.log, ['GET /gateway/api/2.0/Me', 'GET /refreshToken', 'GET /gateway/api/2.0/Me']);
});

test('wrong password is reported as invalid login', async (t) => {
  const state = { log: [], tokens: 0, expired: new Set() };
  const { server, base } = await startFakeLibrus(state);
  const saved = Object.assign({}, C);
  t.after(() => {
    Object.assign(C, saved);
    server.close();
  });
  C.synergiaURL = base;
  C.apiOAuthURL = `${base}/OAuth`;
  C.gatewayAPIURL = `${base}/gateway/api/2.0`;

  await assert.rejects(client.login({ account: { login: 'fikcyjny', password: 'zle' } }), { code: 'invalidLogin' });
});
