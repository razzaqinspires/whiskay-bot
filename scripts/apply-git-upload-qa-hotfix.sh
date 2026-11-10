#!/usr/bin/env bash
# Apply the v2.35.22 repository cleanup without touching unrelated files or runtime data.
set -Eeuo pipefail
export GIT_PAGER=cat PAGER=cat GH_PAGER=cat GIT_TERMINAL_PROMPT=0
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo 'ERROR: jalankan dari Git repository.' >&2; exit 2; }
branch="$(git branch --show-current)"
[[ "$branch" == upload/* ]] || { printf 'ERROR: jalankan helper hanya dari branch upload/* (sekarang: %s).\n' "${branch:-DETACHED}" >&2; exit 2; }
remove_exact_blob() {
  local file="$1" expected="$2" index_sha="" work_sha=""
  index_sha="$(git rev-parse --verify ":$file" 2>/dev/null || true)"
  if [[ "$index_sha" != "$expected" ]]; then
    if [[ -z "$index_sha" && ! -e "$file" ]]; then printf 'ALREADY_CLEAN | %s\n' "$file"; return 0; fi
    printf 'REVIEW_REQUIRED | index blob tidak cocok: %s\n' "$file" >&2; return 1
  fi
  if [[ -L "$file" ]]; then printf 'REVIEW_REQUIRED | path adalah symlink: %s\n' "$file" >&2; return 1; fi
  if [[ -e "$file" ]]; then
    work_sha="$(git hash-object -- "$file")"
    if [[ "$work_sha" == "$expected" ]]; then git rm --quiet -- "$file"; printf 'REMOVED_EXACT_DUPLICATE | %s\n' "$file";
    else git rm --cached --quiet -- "$file"; printf 'PRESERVED_MODIFIED_LOCAL_COPY | %s (index-only removal; manual source cleanup needed)\n' "$file" >&2; return 1; fi
  else git rm --cached --quiet -- "$file"; printf 'UNTRACKED_MISSING_WORKTREE_FILE | %s\n' "$file"; fi
}
result=0
remove_exact_blob 'ecosystem.config.cjs' '53630b8812dd9e785e9d4f46a30cf7e1aec73477' || result=1
remove_exact_blob 'env.example' 'a0c8c78e9060ff92899e32956aedbe00c0afedf3' || result=1
remove_exact_blob 'src/core/Bot.js.pre-pairing' '101b684259856231b8fb184b30835cc2d21da02b' || result=1
remove_exact_blob 'src/core/Bot.js.pre-src' 'a6355d39f144b84a540ff4db89560fe3f39f2af6' || result=1
remove_exact_blob 'src/core/Bot.js.pre-wire' '4a2cc66346726e687665c1e099105d6fa1eb1309' || result=1
remove_exact_blob 'src/plugins/owner/hrlog.js.pre-v2' 'ce164d47c25a122b668f8a73bad14ebe6639ae05' || result=1
chmod 755 scripts/git-upload.sh
git update-index --chmod=+x scripts/git-upload.sh
if git diff --quiet --cached -- scripts/git-upload.sh; then echo 'WARNING: launcher mode did not produce index change.' >&2; result=1; fi
if (( result == 0 )); then echo 'HOTFIX_CLEANUP_RESULT=PASS'; else echo 'HOTFIX_CLEANUP_RESULT=REVIEW_REQUIRED' >&2; exit 3; fi
