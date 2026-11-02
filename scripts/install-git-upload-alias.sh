#!/usr/bin/env bash
# Repair the repository-local `git upload` alias so it invokes the launcher via bash.
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  printf 'ERROR: jalankan skrip ini dari dalam working tree Git.\n' >&2
  exit 1
}
[[ -f "$ROOT/scripts/git-upload.sh" ]] || {
  printf 'ERROR: git-upload.sh tidak ditemukan.\n' >&2
  exit 1
}

chmod 755 "$ROOT/scripts/git-upload.sh"
git config --local alias.upload "!bash \"$ROOT/scripts/git-upload.sh\""
printf 'OK: scripts/git-upload.sh sekarang executable (0755).\n'
printf 'OK: alias repo-local `git upload` memanggil launcher melalui bash.\n'
printf 'Alias aktif: %s\n' "$(git config --local --get alias.upload)"
