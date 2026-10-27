'use strict';

// Minimal HTTP client with a cookie jar, the Node counterpart of HTTP.swift. A packaged webOS
// web app can't do this itself: no Set-Cookie access, no redirect control, CORS. So this runs in
// the app's JS service. Cookies are shared across *.librus.pl and can be serialized, so the
// service stays stateless between calls.

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { URL } = require('url');
const tough = require('tough-cookie');
const iconv = require('iconv-lite');
const C = require('./constants');
const { LibrusError } = require('./errors');

const REDIRECTS = [301, 302, 303, 307, 308];
const TIMEOUT_MS = 30000;

class Response {
  constructor(status, headers, url, data) {
    this.status = status;
    this.headers = headers;
    /** Final URL after redirects. */
    this.url = url;
    this.data = data;
  }

  get location() {
    return this.headers.location || null;
  }

  get text() {
    if (this._text === undefined) {
      const contentType = String(this.headers['content-type'] || '').toLowerCase();
      if (contentType.includes('iso-8859-2')) this._text = iconv.decode(this.data, 'iso-8859-2');
      else if (contentType.includes('windows-1250')) this._text = iconv.decode(this.data, 'windows-1250');
      else this._text = this.data.toString('utf8');
    }
    return this._text;
  }

  json() {
    try {
      return JSON.parse(this.text);
    } catch (e) {
      throw new LibrusError('invalidResponse', `HTTP ${this.status}, ${this.text.slice(0, 200)}`);
    }
  }
}

class HttpClient {
  constructor(serializedCookies) {
    this.jar = null;
    if (serializedCookies) {
      try {
        this.jar = tough.CookieJar.deserializeSync(serializedCookies);
      } catch (e) {
        this.jar = null;
      }
    }
    if (!this.jar) this.jar = new tough.CookieJar();
  }

  serializeCookies() {
    return this.jar.serializeSync();
  }

  clearCookies() {
    this.jar.removeAllCookiesSync();
  }

  cookie(name, url) {
    const found = this.jar.getCookiesSync(url).find((c) => c.key === name);
    return found ? found.value : null;
  }

  /**
   * @param {string} url
   * @param {{method?: string, headers?: object, form?: Array<[string, string]>, body?: string,
   *          userAgent?: string, followRedirects?: boolean}} options
   */
  async send(url, options) {
    const opts = options || {};
    let method = opts.method || 'GET';
    const headers = Object.assign({}, opts.headers);
    let body = opts.body;
    if (opts.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      body = formEncode(opts.form);
    }
    const userAgent = opts.userAgent || C.userAgent;
    const follow = opts.followRedirects !== false;
    let current = new URL(url);
    for (let hop = 0; hop < 10; hop++) {
      const response = await this.once(current, method, headers, body, userAgent);
      if (!follow || !REDIRECTS.includes(response.status) || !response.location) return response;
      current = new URL(response.location, current);
      // Like browsers and URLSession: 303, and 301/302 after POST, continue as GET without a body.
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
        delete headers['Content-Type'];
      }
    }
    throw new LibrusError('network', 'zbyt wiele przekierowań');
  }

  once(url, method, headers, body, userAgent) {
    return new Promise((resolve, reject) => {
      const requestHeaders = Object.assign(
        {
          'User-Agent': userAgent,
          Accept: '*/*',
          'Accept-Language': 'pl-PL,pl;q=0.9',
          'Accept-Encoding': 'gzip, deflate',
        },
        headers
      );
      const cookies = this.jar.getCookieStringSync(url.href);
      if (cookies) requestHeaders.Cookie = cookies;
      const payload = body !== undefined && body !== null ? Buffer.from(body, 'utf8') : null;
      if (payload) requestHeaders['Content-Length'] = payload.length;

      // Plain http is only used by the local tests.
      const transport = url.protocol === 'http:' ? http : https;
      const req = transport.request(url, { method, headers: requestHeaders }, (res) => {
        const setCookie = res.headers['set-cookie'] || [];
        for (const c of setCookie) {
          try {
            this.jar.setCookieSync(c, url.href, { ignoreError: true });
          } catch (e) {
            // Malformed cookie: ignore like a browser would.
          }
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('error', (e) => reject(new LibrusError('network', e.message)));
        res.on('end', () => {
          let data = Buffer.concat(chunks);
          try {
            const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
            if (encoding === 'gzip') data = zlib.gunzipSync(data);
            else if (encoding === 'deflate') data = zlib.inflateSync(data);
          } catch (e) {
            reject(new LibrusError('network', `nie udało się rozpakować odpowiedzi (${e.message})`));
            return;
          }
          resolve(new Response(res.statusCode, res.headers, url.href, data));
        });
      });
      req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('przekroczono czas oczekiwania')));
      req.on('error', (e) => reject(e instanceof LibrusError ? e : new LibrusError('network', e.message)));
      if (payload) req.write(payload);
      req.end();
    });
  }
}

/**
 * application/x-www-form-urlencoded with UTF-8 percent-encoding, identical to
 * HTTPClient.formEncode in Swift: only [A-Za-z0-9-._*] stay as they are, space becomes "+".
 */
function formEncode(pairs) {
  const encode = (s) =>
    String(s)
      .split(' ')
      .map((part) => encodeURIComponent(part).replace(/[!'()~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()))
      .join('+');
  return pairs.map((pair) => `${encode(pair[0])}=${encode(pair[1])}`).join('&');
}

module.exports = { HttpClient, Response, formEncode };
