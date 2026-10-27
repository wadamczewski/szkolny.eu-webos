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
# The install itself runs on the TV in Node (tools/tv-install.cjs), like tvunlock's remote.cjs.
STATUS=0
ssh "$@" "$TV_USER@$TV_HOST" "/usr/bin/node - /tmp/$NAME ${TV_LAUNCH:-0}; rc=\$?; rm -f /tmp/$NAME; exit \$rc" < tools/tv-install.cjs || STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  echo "Instalacja nie powiodła się (kod $STATUS). Jeśli telewizor dopiero się włączył, spróbuj za minutę." >&2
  exit "$STATUS"
fi
echo "Gotowe. Uruchom „Dziennik” z listy aplikacji telewizora."
