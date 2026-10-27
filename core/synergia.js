'use strict';

// Synergia website messages (read-only on TV). Port of SynergiaWeb.swift / SynergiaParser:
// pages are scraped like `LibrusSynergiaGetMessages` and the librus-apix project.
// Parsed with parse5 (through cheerio), an HTML5-compliant parser like SwiftSoup on iOS and Jsoup
// on Android: the real Synergia inbox isn't well-formed enough for lighter parsers.

const cheerio = require('cheerio');
const C = require('./constants');
const { LibrusError } = require('./errors');

const FOLDERS = { inbox: '5', sent: '6' };

/** Like SwiftSoup's text(): whitespace collapsed, nbsp as a space, trimmed. */
function clean(s) {
  return String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function load(html) {
  return cheerio.load(String(html || ''));
}

function isLoggedOut(html) {
  const $ = load(html);
  if ($('h2.inside').first().text().includes('Brak dostępu')) return true;
  // Checked on the serialized document like iOS (doc.outerHtml()), so entities are decoded.
  const out = $.html();
  return out.includes('stop.png') || (out.includes('loguj/portalRodzina') && !out.includes('jesteś zalogowany'));
}

function messageList(html, folder) {
  const $ = load(html);
  const table = $('table.decorated.stretch').first();
  if (!table.length) throw new LibrusError('parse', 'lista wiadomości');
  const result = [];
  table.find('tbody > tr').each((_, element) => {
    const row = $(element);
    const cells = row.find('td');
    if (cells.length < 6) return;
    const href = row.find('a[href*="/wiadomosci/"]').first().attr('href') || '';
    const parts = href.split('/').filter(Boolean);
    // /wiadomosci/1/5/12345/f0
    const idx = parts.indexOf('wiadomosci');
    if (idx < 0 || parts.length <= idx + 3) return;
    const title = cells.eq(3);
    let unread;
    if (folder === 'inbox') {
      const style = (title.attr('style') || '') + (cells.eq(2).attr('style') || '');
      unread = style.replace(/ /g, '').includes('font-weight:bold');
    } else {
      const readFlag = cells.length >= 7 ? cells.eq(5).text() : '';
      unread = readFlag.trim() === 'NIE';
    }
    result.push({
      id: parts[idx + 3],
      folder,
      correspondent: clean(cells.eq(2).text()),
      subject: clean(title.text()),
      date: clean(cells.eq(4).text()),
      unread,
      hasAttachments: cells.eq(1).find('img').length > 0,
    });
  });
  return result;
}

/** HTML fragment → readable text with line breaks (the TV shows plain text only). */
function htmlToText(html) {
  const withBreaks = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n');
  return cheerio
    .load(`<div id="t">${withBreaks}</div>`)('#t')
    .text()
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function messageDetail(html, id) {
  const $ = load(html);
  const content = $('div.container-message-content').first();
  if (!content.length) throw new LibrusError('parse', 'treść wiadomości');
  // Header table: rows "Nadawca", "Temat", "Wysłano" with values in td.left.
  const tables = $('table.stretch');
  const exact = tables.filter((_, t) => ($(t).attr('class') || '').trim() === 'stretch').first();
  const table = exact.length ? exact : tables.first();
  const header = [];
  table.find('tr').slice(0, 3).each((_, row) => {
    header.push(clean($(row).find('td.left').first().text()));
  });
  const attachments = [];
  $('img[onclick*="pobierz_zalacznik"]').each((_, element) => {
    const img = $(element);
    const onclick = (img.attr('onclick') || '').replace(/\\\//g, '/');
    const match = onclick.match(/pobierz_zalacznik\/(\d+)\/(\d+)/);
    if (!match) return;
    const firstCell = img.closest('tr').find('td').first();
    attachments.push({ id: match[2], messageId: match[1], filename: clean(firstCell.length ? firstCell.text() : 'załącznik') });
  });
  return {
    id,
    sender: header[0] || '',
    subject: header[1] || '',
    date: header[2] || '',
    text: htmlToText(content.html()),
    attachments,
  };
}

/** Messages through the same website session as the API gateway. */
class SynergiaWeb {
  constructor(session) {
    this.session = session;
  }

  async page(path, form) {
    await this.session.ensureLoggedIn(false);
    let html = await this.fetch(path, form);
    if (isLoggedOut(html)) {
      await this.session.ensureLoggedIn(true);
      html = await this.fetch(path, form);
      if (isLoggedOut(html)) throw new LibrusError('synergiaSession', 'sesja wygasła');
    }
    return html;
  }

  async fetch(path, form) {
    const response = await this.session.http.send(`${C.synergiaURL}/${path}`, {
      method: form ? 'POST' : 'GET',
      form,
      userAgent: C.webUserAgent,
    });
    if (response.text.includes('Przerwa techniczna')) throw new LibrusError('maintenance');
    return response.text;
  }

  async messages(folder, page) {
    const code = FOLDERS[folder];
    if (!code) throw new LibrusError('badRequest', `folder ${folder}`);
    const html = await this.page(`wiadomosci/1/${code}`, [
      ['numer_strony105', String(page || 0)],
      ['porcjowanie_pojemnik105', '105'],
    ]);
    return messageList(html, folder);
  }

  async message(id, folder) {
    const code = FOLDERS[folder];
    if (!code || !/^\d+$/.test(String(id))) throw new LibrusError('badRequest', 'wiadomość');
    return messageDetail(await this.page(`wiadomosci/1/${code}/${id}/f0`), String(id));
  }
}

module.exports = { SynergiaWeb, isLoggedOut, messageList, messageDetail, htmlToText };
