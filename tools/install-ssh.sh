#!/bin/sh
# Installs dist/*.ipk on a rooted LG TV (Homebrew Channel + root SSH), the same way tvunlock does:
# copy over SCP, then luna://com.webos.appInstallService/dev/install. Doesn't change anything else.
# Usage: TV_HOST=… TV_SSH_KEY=… [TV_USER=root] ./tools/install-ssh.sh
set -eu

: "${TV_HOST:?Ustaw TV_HOST (adres telewizora)}"
: "${TV_SSH_KEY:?Ustaw TV_SSH_KEY (klucz SSH roota)}"
TV_USER="${TV_USER:-root}"

cd "$(dirname "$0")/.."
IPK=$(ls dist/pl.prywatny.dziennik_*_all.ipk 2>/dev/null | tail -n 1)
[ -n "$IPK" ] || { echo "Brak paczki. Najpierw: npm run build" >&2; exit 1; }
NAME=$(basename "$IPK")

# webOS Dropbear has legacy SCP but no SFTP subsystem, hence -O.
scp -O -i "$TV_SSH_KEY" "$IPK" "$TV_USER@$TV_HOST:/tmp/$NAME"
ssh -i "$TV_SSH_KEY" "$TV_USER@$TV_HOST" "
  luna-send -w 60000 -i 'luna://com.webos.appInstallService/dev/install' \
    '{\"id\":\"com.ares.defaultName\",\"ipkUrl\":\"/tmp/$NAME\",\"subscribe\":true}' \
    | grep -m 1 -E '\"state\" *: *\"(installed|failed)\"|errorText'
  rm -f /tmp/$NAME
"
echo "Gotowe. Uruchom „Dziennik” z listy aplikacji telewizora."
