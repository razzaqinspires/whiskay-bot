#!/usr/bin/env bash
set -uo pipefail

TARGET="${1:-.}"
CUSTOM_MSG="${2:-}"
cd "$TARGET" || { echo "cannot cd $TARGET"; exit 1; }

AUTO_MSG="${CUSTOM_MSG:-chore(auto): $(date +'%Y-%m-%d %H:%M:%S %Z')}"

echo "════ 1/3: CEK FIX CI ════"
git fetch origin >/dev/null 2>&1 || { echo "  fetch gagal"; exit 1; }

OK_M=0; OK_H=0
git show origin/main:.github/workflows/github-metrics.yml 2>/dev/null | grep -q 'HEAD:automation' && OK_M=1
git show origin/main:.github/workflows/repo-update-history.yml 2>/dev/null | grep -q 'HEAD:automation' && OK_H=1

if [ $OK_M = 0 ] || [ $OK_H = 0 ]; then
  echo "  BROKEN — menerapkan fix..."
  STASHED=0
  if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    git stash push -u -m "auto-fix-$(date +%s)" >/dev/null
    STASHED=1
  fi
  git reset --hard origin/main >/dev/null
  perl -i -pe 's{git push origin "HEAD:\$\{GITHUB_REF_NAME\}"}{git push origin "HEAD:automation" --force}g' .github/workflows/github-metrics.yml .github/workflows/repo-update-history.yml
  perl -i -pe 's{group: github-metrics-\$\{\{ github\.ref \}\}}{group: whiskay-automation-branch}g' .github/workflows/github-metrics.yml
  perl -i -pe 's{group: repo-update-history-\$\{\{ github\.ref \}\}}{group: whiskay-automation-branch}g' .github/workflows/repo-update-history.yml
  git add .github/workflows/github-metrics.yml .github/workflows/repo-update-history.yml
  git commit -m "fix(ci): redirect metrics and history pushes from main to automation" >/dev/null
  if ! git push origin main; then
    echo "  Push fix DITOLAK."
    [ $STASHED = 1 ] && echo "  Perubahanmu tersimpan di stash: $(git stash list | head -1)"
    echo ""
    echo "  Lakukan:"
    echo "  1. Buka https://github.com/razzaqinspires/whiskay-bot/actions"
    echo "  2. Disable workflow 'GitHub repository metrics and README refresh'"
    echo "  3. Disable workflow 'Repository update history'"
    echo "  4. Jalankan ulang:  ./auto-push.sh"
    exit 2
  fi
  echo "  OK — fix terkirim."
  if [ $STASHED = 1 ]; then
    git stash pop >/dev/null || { echo "  Stash pop konflik, selesaikan manual."; exit 3; }
    echo "  Perubahanmu sudah direstore."
  fi
else
  echo "  OK — skip patch."
fi

echo ""
echo "════ 2/3: STAGE & COMMIT ════"
git add -A
if git diff --cached --quiet; then
  echo "  Tidak ada perubahan untuk diupload."
  exit 0
fi
git commit -m "$AUTO_MSG" >/dev/null
echo "  $(git log --oneline -1)"

echo ""
echo "════ 3/3: PUSH ════"
if ! git push origin main 2>/dev/null; then
  echo "  Push ditolak, coba rebase..."
  if git pull --rebase origin main >/dev/null 2>&1 && git push origin main >/dev/null 2>&1; then
    echo "  OK setelah rebase."
  else
    echo "  GAGAL. Periksa: git log --oneline origin/main -3"
    exit 4
  fi
fi

echo ""
echo "════ SELESAI ════"
git log --oneline -3
