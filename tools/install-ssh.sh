#!/bin/sh
# Installs dist/*.ipk on a rooted LG TV (Homebrew Channel + root SSH), the same way tvunlock does:
# copy over SCP, then luna://com.webos.appInstallService/dev/install. Doesn't change anything else.
# Afterwards it asks the app's service for a demo sync (fake data) to check it runs on the TV.
# Usage: TV_HOST=… TV_SSH_KEY=… [TV_USER=root] [TV_KNOWN_HOSTS=…] [TV_LAUNCH=1] ./tools/install-ssh.sh
set -eu

: "${TV_HOST:?Ustaw TV_HOST (adres telewizora)}"
: "${TV_SSH_KEY:?Ustaw TV_SSH_KEY (klucz SSH roota)}"
TV_USER="${TV_USER:-root}"

# Like tvunlock: no prompts, short timeout, and optionally a private known_hosts with a verified key.
set -- -o BatchMode=yes -o ConnectTimeout=8 -i "$TV_SSH_KEY"
if [ -n "${TV_KNOWN_HOSTS:-}" ]; then
  set -- "$@" -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$TV_KNOWN_HOSTS"
fi

cd "$(dirname "$0")/.."
IPK=$(ls dist/pl.prywatny.dziennik_*_all.ipk 2>/dev/null | tail -n 1)
[ -n "$IPK" ] || { echo "Brak paczki. Najpierw: npm run build" >&2; exit 1; }
NAME=$(basename "$IPK")

# webOS Dropbear has legacy SCP but no SFTP subsystem, hence -O.
scp -O "$@" "$IPK" "$TV_USER@$TV_HOST:/tmp/$NAME"
ssh "$@" "$TV_USER@$TV_HOST" "
  luna-send -w 60000 -i 'luna://com.webos.appInstallService/dev/install' \
    '{\"id\":\"com.ares.defaultName\",\"ipkUrl\":\"/tmp/$NAME\",\"subscribe\":true}' \
    | grep -m 1 -E '\"state\" *: *\"(installed|failed)\"|errorText'
  rm -f /tmp/$NAME
  echo 'Test usługi (dane demonstracyjne):'
  luna-send -n 1 -w 20000 'luna://pl.prywatny.dziennik.service/ping' '{}'
  luna-send -n 1 -w 30000 'luna://pl.prywatny.dziennik.service/sync' '{\"account\":{\"login\":\"demo\",\"password\":\"demo\"}}' \
    | grep -o -m 1 -E '\"returnValue\": *(true|false)|\"errorText\": *\"[^\"]*\"'
  if [ '${TV_LAUNCH:-}' = 1 ]; then
    luna-send -n 1 'luna://com.webos.applicationManager/launch' '{\"id\":\"pl.prywatny.dziennik\"}' >/dev/null
  fi
"
echo "Gotowe. Uruchom „Dziennik” z listy aplikacji telewizora i wybierz „Wypróbuj na danych demonstracyjnych”."
