#!/usr/bin/env bash
# Stage 53: autonomous, data-safe upload. Validates the exact upload branch and never pushes main.
set -Eeuo pipefail
export GIT_PAGER=cat PAGER=cat TZ=Asia/Jakarta
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
SKIP_INSTALL=0
MESSAGE=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    --message=*) MESSAGE="${arg#*=}" ;;
    *) printf 'Opsi tidak dikenal: %s\n' "$arg" >&2; exit 64 ;;
  esac
done

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
command -v git >/dev/null 2>&1 || fail 'git tidak tersedia.'
command -v node >/dev/null 2>&1 || fail 'Node.js tidak tersedia.'
command -v npm >/dev/null 2>&1 || fail 'npm tidak tersedia.'
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail 'Jalankan perintah dari dalam repository Whiskay Bot.'
[[ -f package.json && -f package-lock.json ]] || fail 'package.json/package-lock.json tidak lengkap.'

SOURCE_BRANCH="$(git branch --show-current)"
BASE_BRANCH="${WHISKAY_GITHUB_BASE_BRANCH:-main}"
[[ -n "$SOURCE_BRANCH" ]] || fail "HEAD detached. Checkout $BASE_BRANCH atau branch upload/* terlebih dahulu."
CREATED_UPLOAD_BRANCH=0
if [[ "$SOURCE_BRANCH" == "$BASE_BRANCH" ]]; then
  RUN_ID="$(date '+%Y%m%d-%H%M%S')-$((RANDOM % 9000 + 1000))"
  UPLOAD_BRANCH="upload/$RUN_ID"
elif [[ "$SOURCE_BRANCH" == upload/* ]]; then
  # Stage 57: resume the exact interrupted upload branch without duplicating it.
  UPLOAD_BRANCH="$SOURCE_BRANCH"
  RUN_ID="${SOURCE_BRANCH#upload/}"
  RUN_ID="${RUN_ID//\//-}"
else
  fail "git upload hanya menerima source branch $BASE_BRANCH atau melanjutkan upload/* yang sudah ada (sekarang: $SOURCE_BRANCH). Checkout $BASE_BRANCH untuk memulai upload baru."
fi
RUN_ID="${RUN_ID:-$(date '+%Y%m%d-%H%M%S')-$((RANDOM % 9000 + 1000))}"
LOG_DIR="data/test-reports/git-upload-$RUN_ID-$(date '+%H%M%S')"
mkdir -p "$LOG_DIR"

printf '\n╔════════════════════════════════════════════════════════════╗\n'
printf '║              WHISKAY AUTONOMOUS GIT UPLOAD                ║\n'
printf '╚════════════════════════════════════════════════════════════╝\n'
printf 'Repository   : %s\n' "$(git rev-parse --show-toplevel)"
printf 'Source branch: %s\n' "$SOURCE_BRANCH"
printf 'Resume mode  : %s\n' "$([[ "$SOURCE_BRANCH" == upload/* ]] && echo YES || echo NO)"
printf 'Target branch: %s (Pull Request only)\n' "$BASE_BRANCH"
printf 'Upload branch: %s\n' "$UPLOAD_BRANCH"
printf 'Date / time  : %s\n' "$(date '+%A, %d %B %Y %H:%M:%S WIB')"
printf 'Run ID       : %s\n' "$RUN_ID"
printf 'Logs         : %s\n' "$LOG_DIR"

printf '\n════ 0/6 · FETCH / DETECT ════\n'
FETCH_RESULT=PASS
if git fetch --prune origin >"$LOG_DIR/fetch.log" 2>&1; then
  cat "$LOG_DIR/fetch.log"
  printf 'Fetch origin: PASS\n'
else
  FETCH_RESULT=WARNING
  cat "$LOG_DIR/fetch.log"
  printf 'WARNING: fetch gagal; validasi lokal tetap berjalan dan publish akan mencoba fallback autentikasi.\n'
fi

audit() {
  local target="$1" output="$2" status
  set +e
  bash scripts/auto-push.sh --analyze >"$output" 2>&1
  status=$?
  set -e
  cat "$output"
  return "$status"
}

write_local_blocked_report() {
  local reason="$1"
  printf '%s\n' "$reason" >"$LOG_DIR/blocked-reason.log"
  node scripts/git-upload-report.mjs \
    "--run-id=$RUN_ID" \
    "--log-dir=$LOG_DIR" \
    --qa-status=BLOCKED \
    "--source-branch=$SOURCE_BRANCH" \
    "--upload-branch=$UPLOAD_BRANCH" \
    "--base-branch=$BASE_BRANCH" \
    | tee "$LOG_DIR/local-blocked-report.log" || true
  printf 'SECURITY_BLOCK=TRUE\n' >>"$LOG_DIR/blocked-reason.log"
  printf 'Local-only diagnostic ZIP: data/test-reports/git-upload-%s.zip\n' "$RUN_ID"
  printf 'Local-only report: data/test-reports/git-upload-%s.md\n' "$RUN_ID"
}

printf '\n════ 1/6 · PRE-FLIGHT / PRIVATE DATA GUARD ════\n'
if ! audit preflight "$LOG_DIR/preflight.log"; then
  printf 'UPLOAD BLOCKED: audit awal gagal. Database, sesi, credential dan secret tidak akan dipaksa masuk GitHub.\n' >&2
  write_local_blocked_report 'Hard-block pada preflight: file privat, secret, atau aturan ignore gagal.'
  exit 8
fi

printf '\n════ 2/6 · CREATE BRANCH / SYNC BASE ════\n'
if [[ "$SOURCE_BRANCH" == "$BASE_BRANCH" ]]; then
  if git show-ref --verify --quiet "refs/heads/$UPLOAD_BRANCH"; then fail "Branch upload sudah ada: $UPLOAD_BRANCH"; fi
  git switch -c "$UPLOAD_BRANCH"
  CREATED_UPLOAD_BRANCH=1
else
  printf 'Melanjutkan branch upload yang sudah ada: %s\n' "$UPLOAD_BRANCH"
  git show-ref --verify --quiet "refs/heads/$UPLOAD_BRANCH" || fail "Branch resume tidak ditemukan: $UPLOAD_BRANCH"
fi
printf '\n════ 2A/6 · GIT HISTORY / MOVE INTELLIGENCE ════\n'
if ! node scripts/git-upload-intelligence.mjs --analyze >"$LOG_DIR/git-intelligence.log" 2>&1; then
  cat "$LOG_DIR/git-intelligence.log"
  write_local_blocked_report 'GIT_INTELLIGENCE_REVIEW_REQUIRED: pasangan file mirip ditemukan tetapi tidak cukup identik untuk dihapus otomatis.'
  git switch "$SOURCE_BRANCH" >/dev/null 2>&1 || true
  exit 10
fi
cat "$LOG_DIR/git-intelligence.log"
printf '\n════ 2A.1/6 · COMMIT LINEAGE / RECOVERY AUDIT ════\n'
if ! node scripts/git-upload-recovery.mjs --analyze >"$LOG_DIR/recovery-before-snapshot.log" 2>&1; then
  cat "$LOG_DIR/recovery-before-snapshot.log"
  write_local_blocked_report 'RECOVERY_AUDIT_BLOCKED: branch lineage tidak aman atau bukan branch upload yang valid.'
  if ((CREATED_UPLOAD_BRANCH)); then git switch "$SOURCE_BRANCH" >/dev/null 2>&1 || true; fi
  exit 11
fi
cat "$LOG_DIR/recovery-before-snapshot.log"
printf '\n════ 2B/6 · SECURE LOCAL SNAPSHOT ════\n'
if ! bash scripts/auto-push.sh --snapshot >"$LOG_DIR/snapshot.log" 2>&1; then
  cat "$LOG_DIR/snapshot.log"
  write_local_blocked_report 'SNAPSHOT_BLOCKED: perubahan lokal tidak dapat diamankan karena pemeriksaan keamanan/whitespace gagal.'
  if ((CREATED_UPLOAD_BRANCH)); then git switch "$SOURCE_BRANCH" >/dev/null 2>&1 || true; fi
  exit 8
fi
cat "$LOG_DIR/snapshot.log"
SYNC_RESULT=LOCAL_ONLY
if git show-ref --verify --quiet "refs/remotes/origin/$BASE_BRANCH"; then
  if git merge-base --is-ancestor "origin/$BASE_BRANCH" HEAD; then
    SYNC_RESULT=UP_TO_DATE
    printf 'Base origin/%s sudah menjadi ancestor branch upload.\n' "$BASE_BRANCH"
  else
    printf 'Merge origin/%s ke upload branch sebelum QA agar tes memeriksa source terkini.\n' "$BASE_BRANCH"
    if git merge --no-edit "origin/$BASE_BRANCH"; then
      SYNC_RESULT=MERGED
      printf 'SYNC_RESULT=MERGED\n'
    else
      git merge --abort >/dev/null 2>&1 || true
      SYNC_RESULT=CONFLICT
      printf 'SYNC_RESULT=CONFLICT\nMerge dibatalkan; perubahan lokal tetap utuh.\n'
      printf 'UPLOAD HALTED: konflik dengan origin/%s harus diselesaikan sebelum QA/publish.\n' "$BASE_BRANCH" >&2
      write_local_blocked_report "SYNC_CONFLICT: origin/$BASE_BRANCH tidak dapat digabung tanpa konflik. Perubahan lokal dipertahankan."
      if ((CREATED_UPLOAD_BRANCH)); then git switch "$SOURCE_BRANCH" >/dev/null 2>&1 || true; fi
      exit 9
    fi
  fi
else
  printf 'WARNING: origin/%s tidak tersedia pada cache lokal; lanjut dengan HEAD lokal.\n' "$BASE_BRANCH"
fi

printf '\n════ 2C/6 · POST-SYNC LINEAGE RECHECK ════\n'
node scripts/git-upload-recovery.mjs --analyze | tee "$LOG_DIR/recovery-after-sync.log"
if ! node scripts/git-upload-recovery.mjs --check-publish >"$LOG_DIR/recovery-publish-gate.log" 2>&1; then
  cat "$LOG_DIR/recovery-publish-gate.log"
  write_local_blocked_report 'NO_UNIQUE_COMMITS: semua commit branch sudah terwakili di base atau tidak ada commit baru. Branch dipertahankan; tidak membuat PR kosong.'
  exit 13
fi
cat "$LOG_DIR/recovery-publish-gate.log"
printf '\n════ 3/6 · POST-SYNC SECURITY AUDIT ════\n'
if ! audit analysis "$LOG_DIR/analysis.log"; then
  printf 'UPLOAD BLOCKED: audit setelah sinkronisasi gagal; branch lokal dipertahankan untuk pemeriksaan.\n' >&2
  write_local_blocked_report 'Hard-block setelah sinkronisasi: file privat, secret, atau aturan ignore gagal.'
  exit 8
fi

printf '\n════ 4/6 · CLEAN DEPENDENCY INSTALL + FULL QA ════\n'
QA_ARGS=(--qa "--log-dir=$LOG_DIR")
((SKIP_INSTALL)) && QA_ARGS+=(--skip-install)
set +e
bash scripts/auto-push.sh "${QA_ARGS[@]}" >"$LOG_DIR/qa-output.log" 2>&1
QA_EXIT=$?
set -e
cat "$LOG_DIR/qa-output.log"
QA_STATUS=FAIL
[[ "$QA_EXIT" -eq 0 ]] && QA_STATUS=PASS
printf '\nLocal QA result: %s\n' "$QA_STATUS"
if [[ "$QA_STATUS" == FAIL ]]; then
  printf 'QA gagal/tidak lengkap. Upload branch tetap dapat diteruskan untuk review; hard-block secret/data tetap berlaku.\n'
fi

printf '\n════ 5/6 · REPORT / DIAGNOSTICS ════\n'
REPORT_ARGS=(
  "--run-id=$RUN_ID"
  "--log-dir=$LOG_DIR"
  "--qa-status=$QA_STATUS"
  "--source-branch=$SOURCE_BRANCH"
  "--upload-branch=$UPLOAD_BRANCH"
  "--base-branch=$BASE_BRANCH"
)
((DRY_RUN)) || REPORT_ARGS+=(--tracked=true)
node scripts/git-upload-report.mjs "${REPORT_ARGS[@]}" | tee "$LOG_DIR/report-generator.log"

if ((DRY_RUN)); then
  printf '\n════ DRY RUN · CLEANUP ════\n'
  printf 'Branch upload dipertahankan agar snapshot/commit tidak hilang: %s\n' "$UPLOAD_BRANCH"
  printf 'DRY_RUN=PASS\nQA_RESULT=%s\n' "$QA_STATUS"
  printf 'Tidak ada branch remote atau push yang dibuat. Jalankan ulang dari branch ini untuk melanjutkan.\n'
  printf 'ZIP diagnostik lokal: data/test-reports/git-upload-%s.zip\n' "$RUN_ID"
  [[ "$QA_STATUS" == PASS ]] && exit 0 || exit 3
fi

printf '\n════ 6/6 · TIMESTAMPED COMMIT + UPLOAD BRANCH ════\n'
FINGERPRINT="$(bash scripts/auto-push.sh --fingerprint)"
PUBLISH_ARGS=(--publish "--expected-fingerprint=$FINGERPRINT")
[[ -n "$MESSAGE" ]] && PUBLISH_ARGS+=("--message=$MESSAGE")
bash scripts/auto-push.sh "${PUBLISH_ARGS[@]}"

printf '\n╔════════════════════════════════════════════════════════════╗\n'
printf '║                 UPLOAD BRANCH SUBMITTED                   ║\n'
printf '╚════════════════════════════════════════════════════════════╝\n'
printf 'UPLOAD_RESULT=SUBMITTED_FOR_REVIEW\nUPLOAD_BRANCH=%s\nBASE_BRANCH=%s\nQA_RESULT=%s\nSYNC_RESULT=%s\nFETCH_RESULT=%s\n' "$UPLOAD_BRANCH" "$BASE_BRANCH" "$QA_STATUS" "$SYNC_RESULT" "$FETCH_RESULT"
printf 'GitHub Actions akan membuka PR ke %s, menjalankan CI, mengarsipkan log, dan membuat issue otomatis bila ada kegagalan.\n' "$BASE_BRANCH"
printf 'Report: docs/reports/git-upload/%s.md\n' "$RUN_ID"
printf 'Local ZIP: data/test-reports/git-upload-%s.zip\n' "$RUN_ID"
# A failed QA result is still uploaded for diagnosis; only secret/data safety failures block it.
exit 0
