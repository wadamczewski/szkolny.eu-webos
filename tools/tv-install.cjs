'use strict';
// Runs on the TV as root (`node - <ipk> [launch]`, sent by install-ssh.sh over SSH): installs the
// copied .ipk through appInstallService and asks the app's service for a demo sync (fake data).
// luna-send is spawned from Node with a stdin pipe, like tvunlock's remote.cjs: started directly
// from a non-interactive SSH shell it returns nothing on webOS 25.

const cp = require('child_process');
const [ipk, launch] = process.argv.slice(2);

function luna(uri, params, isDone) {
  return new Promise((resolve, reject) => {
    const args = isDone ? ['-i', uri, JSON.stringify(params)] : ['-n', '1', uri, JSON.stringify(params)];
    const proc = cp.spawn('/usr/bin/luna-send', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '';
    let failure = '';
    let result = null;
    const timer = setTimeout(() => {
      failure = `brak odpowiedzi: ${uri}`;
      proc.kill('SIGTERM');
    }, 120000);
    proc.stdout.on('data', (data) => {
      buffer += data;
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line || result) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch (e) {
          continue;
        }
        const details = message.details || {};
        if (isDone && (message.returnValue === false || details.state === 'failed' || details.errorCode)) {
          failure = JSON.stringify(message);
          proc.kill('SIGTERM');
        } else if (!isDone || isDone(message)) {
          result = message;
          proc.stdin.end();
          proc.kill('SIGTERM');
        }
      }
    });
    proc.stderr.on('data', (data) => {
      failure += data;
    });
    proc.on('close', () => {
      clearTimeout(timer);
      if (result) resolve(result);
      else reject(new Error(failure || `brak odpowiedzi: ${uri}`));
    });
  });
}

(async () => {
  if (process.getuid() !== 0) throw new Error('Wymagany root (Homebrew Channel).');
  const installed = await luna(
    'luna://com.webos.appInstallService/dev/install',
    { id: 'com.ares.defaultName', ipkUrl: ipk, subscribe: true },
    (m) => (m.details || {}).state === 'installed'
  );
  console.log(`Zainstalowano: ${(installed.details || {}).packageId || 'pl.prywatny.dziennik'}`);
  const ping = await luna('luna://pl.prywatny.dziennik.service/ping', {});
  console.log(`Usługa: ${ping.returnValue ? `działa (Node.js ${ping.node})` : ping.errorText}`);
  const sync = await luna('luna://pl.prywatny.dziennik.service/sync', { account: { login: 'demo', password: 'demo' } });
  console.log(`Synchronizacja demo: ${sync.returnValue ? `ok (${sync.data.grades.length} ocen, ${sync.data.timetable.days.length} dni planu)` : sync.errorText}`);
  if (launch === '1') {
    await luna('luna://com.webos.applicationManager/launch', { id: 'pl.prywatny.dziennik' });
    console.log('Uruchomiono aplikację.');
  }
})().catch((e) => {
  console.error(`Błąd: ${e.message}`);
  process.exitCode = 1;
});
