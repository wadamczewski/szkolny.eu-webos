'use strict';

// Synergia website messages (read-only on TV). Port of SynergiaWeb.swift / SynergiaParser:
// pages are scraped like `LibrusSynergiaGetMessages` and the librus-apix project.

const { parse } = require('node-html-parser');
const C = require('./constants');
const { LibrusError } = require('./errors');

const FOLDERS = { inbox: '5', sent: '6' };

function clean(s) {
  return String(s || '').replace(/ /g, ' ').trim();
}

function isLoggedOut(html) {
  const doc = parse(html);
  const h2 = doc.querySelector('h2.inside');
  if (h2 && h2.text.includes('Brak dostępu')) return true;
  return html.includes('stop.png') || (html.includes('loguj/portalRodzina') && !html.includes('jesteś zalogowany'));
}

function messageList(html, folder) {
  const doc = parse(html);
  const table = doc.querySelector('table.decorated.stretch');
  if (!table) throw new LibrusError('parse', 'lista wiadomości');
  const result = [];
  for (const row of table.querySelectorAll('tbody > tr')) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 6) continue;
    const link = row.querySelector('a[href*="/wiadomosci/"]');
    const parts = (link ? link.getAttribute('href') || '' : '').split('/').filter(Boolean);
    // /wiadomosci/1/5/12345/f0
    const idx = parts.indexOf('wiadomosci');
    if (idx < 0 || parts.length <= idx + 3) continue;
    const title = cells[3];
    let unread;
    if (folder === 'inbox') {
      const style = (title.getAttribute('style') || '') + (cells[2].getAttribute('style') || '');
      unread = style.replace(/ /g, '').includes('font-weight:bold');
    } else {
      const readFlag = cells.length >= 7 ? cells[5].text : '';
      unread = readFlag.trim() === 'NIE';
    }
    result.push({
      id: parts[idx + 3],
      folder,
      correspondent: clean(cells[2].text),
      subject: clean(title.text),
      date: clean(cells[4].text),
      unread,
      hasAttachments: cells[1].querySelectorAll('img').length > 0,
    });
  }
  return result;
}

/** HTML fragment → readable text with line breaks (the TV shows plain text only). */
function htmlToText(html) {
  const withBreaks = String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n');
  return parse(withBreaks)
    .text.replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function messageDetail(html, id) {
  const doc = parse(html);
  const content = doc.querySelector('div.container-message-content');
  if (!content) throw new LibrusError('parse', 'treść wiadomości');
  // Header table: rows "Nadawca", "Temat", "Wysłano" with values in td.left.
  const tables = doc.querySelectorAll('table.stretch');
  const table = tables.find((t) => (t.getAttribute('class') || '').trim() === 'stretch') || tables[0];
  const header = [];
  if (table) {
    for (const row of table.querySelectorAll('tr').slice(0, 3)) {
      const cell = row.querySelector('td.left');
      header.push(clean(cell ? cell.text : ''));
    }
  }
  const attachments = [];
  for (const img of doc.querySelectorAll('img[onclick*="pobierz_zalacznik"]')) {
    const onclick = (img.getAttribute('onclick') || '').replace(/\\\//g, '/');
    const match = onclick.match(/pobierz_zalacznik\/(\d+)\/(\d+)/);
    if (!match) continue;
    let row = img.parentNode;
    while (row && row.tagName !== 'TR') row = row.parentNode;
    const firstCell = row ? row.querySelector('td') : null;
    attachments.push({ id: match[2], messageId: match[1], filename: clean(firstCell ? firstCell.text : 'załącznik') });
  }
  return {
    id,
    sender: header[0] || '',
    subject: header[1] || '',
    date: header[2] || '',
    text: htmlToText(content.innerHTML),
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
