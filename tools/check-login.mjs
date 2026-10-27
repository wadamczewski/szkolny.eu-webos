// Checks your own Synergia login from the Mac with the same code the TV runs, without a TV.
// Prints only counts (no grades, names or messages). The password is read without echo and is
// not stored anywhere.  Usage: npm run check-login

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const require = createRequire(import.meta.url);
const core = join(dirname(fileURLToPath(import.meta.url)), '..', 'core');
const client = require(join(core, 'client.js'));
const C = require(join(core, 'constants.js'));
const { SynergiaSession } = require(join(core, 'session.js'));
const { isLoggedOut } = require(join(core, 'synergia.js'));

/** Structure of the messages page only (status, path, title, markers): no names or contents. */
async function diagnoseMessages(account) {
  const session = new SynergiaSession(account);
  await session.ensureLoggedIn(false);
  const variants = [
    ['POST', { method: 'POST', form: [['numer_strony105', '0'], ['porcjowanie_pojemnik105', '105']] }],
    ['GET', {}],
  ];
  for (const [label, options] of variants) {
    const r = await session.http.send(`${C.synergiaURL}/wiadomosci/1/5`, Object.assign({ userAgent: C.webUserAgent }, options));
    const html = r.text;
    const title = ((html.match(/<title>([^<]*)/i) || [])[1] || '').trim();
    console.log(`  ${label}: HTTP ${r.status}, adres: ${new URL(r.url).pathname}, tytuł: „${title}”, rozmiar: ${html.length}`);
    console.log(`    tabela wiadomości: ${/class="decorated stretch"/.test(html)}, wylogowany: ${isLoggedOut(html)}, ` +
      `nowy moduł (wiadomosci3): ${html.includes('wiadomosci3')}, przerwa techniczna: ${html.includes('Przerwa techniczna')}`);
  }
}

function ask(question, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const login = await ask('Login Synergii: ');
const password = await ask('Hasło: ', true);
const account = { login, password };

try {
  const step = (name) => process.stdout.write(`${name}… `);
  step('Logowanie');
  const { session } = await client.login({ account });
  console.log('ok');
  Object.assign(account, session);

  step('Synchronizacja');
  const { data } = await client.sync({ account });
  console.log('ok');
  console.log(`  przedmioty: ${data.subjects.length}, oceny: ${data.grades.length}, wydarzenia: ${data.events.length}`);
  console.log(`  frekwencja: ${data.attendance.stats.all.total} wpisów, uwagi: ${data.notices.length}, ogłoszenia: ${data.announcements.length}`);
  console.log(`  plan lekcji (${data.timetable.weekStart}): ${data.timetable.days.reduce((n, d) => n + d.lessons.length, 0)} lekcji`);
  console.log(`  szczęśliwy numerek: ${data.luckyNumber ? 'jest' : 'brak'}`);
  if (data.warnings.length) console.log(`  nie wczytało się: ${data.warnings.join('; ')}`);

  step('Wiadomości');
  try {
    const { messages } = await client.messages({ account, folder: 'inbox' });
    console.log(`ok (${messages.length})`);
  } catch (e) {
    console.log(`błąd [${e.code || 'error'}]: ${e.message}`);
    console.log('Diagnostyka strony wiadomości:');
    await diagnoseMessages(account);
    process.exitCode = 1;
  }
} catch (e) {
  console.log(`\nBłąd [${e.code || 'error'}]: ${e.message}`);
  process.exitCode = 1;
}
