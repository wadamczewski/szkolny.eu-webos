// Checks your own Synergia login from the Mac with the same code the TV runs, without a TV.
// Prints only counts (no grades, names or messages). The password is read without echo and is
// not stored anywhere.  Usage: npm run check-login

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const require = createRequire(import.meta.url);
const client = require(join(dirname(fileURLToPath(import.meta.url)), '..', 'core', 'client.js'));

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
  const { messages } = await client.messages({ account, folder: 'inbox' });
  console.log(`ok (${messages.length})`);
} catch (e) {
  console.log(`\nBłąd: ${e.message}`);
  process.exitCode = 1;
}
