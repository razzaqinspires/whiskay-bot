#!/usr/bin/env bash
# Stage 53: guarded QA + branch-only GitHub publishing. Never writes to main.
set -Eeuo pipefail
export GIT_PAGER=cat PAGER=cat GH_PAGER=cat GIT_TERMINAL_PROMPT=0
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
MODE="${1:---analyze}"
EXPECTED=""
MESSAGE="${GIT_COMMIT_MESSAGE:-}"
LOG_DIR="${WHISKAY_UPLOAD_LOG_DIR:-data/test-reports/git-upload-current}"
SKIP_INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --expected-fingerprint=*) EXPECTED="${arg#*=}" ;;
    --message=*) MESSAGE="${arg#*=}" ;;
    --log-dir=*) LOG_DIR="${arg#*=}" ;;
    --skip-install) SKIP_INSTALL=1 ;;
  esac
done

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
require_repo() { git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail 'Folder ini bukan Git repository.'; }
require_repo
BRANCH="$(git branch --show-current)"
REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
REPO_SLUG="${WHISKAY_GITHUB_REPO:-}"
if [[ -z "$REPO_SLUG" && "$REMOTE_URL" =~ github\.com[:/]([^/]+/[^/.]+)(\.git)?$ ]]; then REPO_SLUG="${BASH_REMATCH[1]}"; fi
REPO_SLUG="${REPO_SLUG:-razzaqinspires/whiskay-bot}"
BASE_BRANCH="${WHISKAY_GITHUB_BASE_BRANCH:-main}"

fingerprint() {
  {
    git rev-parse HEAD
    git status --porcelain=v1 -uall
    git diff --binary HEAD 2>/dev/null || true
    while IFS= read -r -d '' file; do
      printf '\n--UNTRACKED:%s--\n' "$file"
      if [[ -f "$file" ]]; then sha256sum -- "$file"; fi
    done < <(git ls-files --others --exclude-standard -z | sort -z)
  } | sha256sum | awk '{print $1}'
}

is_private_path() {
  local file="${1//\\//}"
  local part part_lower
  IFS='/' read -r -a parts <<< "$file"
  for part in "${parts[@]}"; do
    part_lower="${part,,}"
    case "$part_lower" in
      data|sessions|session|auth_info_baileys|baileys_auth_info|.whatsapp-session|whatsapp-session|whatsapp-sessions|.wwebjs_auth|.wwebjs_cache|node_modules|.runtime|.test-runtime|.cache|coverage|.next|.turbo|logs|tmp|temp|downloads|cache|dist|build|test-reports) return 0 ;;
    esac
  done
  local index part_index
  for index in "${!parts[@]}"; do
    if [[ "${parts[$index]}" == test && "${parts[$((index + 1))]:-}" == reports ]]; then return 0; fi
  done
  if [[ "$file" == docs/archive/patches/*.patch || "$file" == */docs/archive/patches/*.patch ]]; then return 0; fi
  local base="${file##*/}"
  local base_lower="${base,,}"
  [[ "$base_lower" == '.env' || ( "$base_lower" == .env.* && ( "$base_lower" != '.env.example' || "$file" != '.env.example' ) ) || "$base_lower" == '.npmrc' || "$base_lower" == '.netrc' || "$base_lower" =~ ^(id_rsa|id_ed25519)$ || "$base_lower" =~ ^(credentials|secrets|token)\.json$ || "$base_lower" =~ ^service-account.*\.json$ || "$base_lower" =~ \.(db|db-wal|db-shm|db-journal|sqlite|sqlite3|sqlite-wal|sqlite-shm|sqlite-journal|realm|rdb|ldb|sst|mdb|mdf|ldf|ibd|frm|myd|myi|dump|bak|backup|pem|key|p12|pfx|jks|keystore|p8|der|crt|cer|asc|secret|secrets|session|cookie|log|tap)$ || "$base_lower" =~ \.log\..+$ ]] && return 0
  return 1
}

secret_pattern='gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----|AIza[0-9A-Za-z_-]{30,}'

print_ignore_audit() {
  printf '\n--- .gitignore protection audit ---\n'
  local path
  for path in .env .env.production sessions/auth.json session/auth.json data/leveling.json data/jadibot/sessions/auth.json .wwebjs_auth/Default/Local\ Storage/leveldb/000001.log cache.db-wal credentials.json service-account-prod.json; do
    if git check-ignore --no-index -q -- "$path"; then printf 'OK ignored: %s\n' "$path"; else printf 'BLOCK not ignored: %s\n' "$path"; return 1; fi
  done
  if git check-ignore --no-index -q -- .env.example; then printf 'BLOCK .env.example must remain shareable.\n'; return 1; fi
  printf 'OK allowed template: .env.example\n'
  return 0
}

print_project_audit() {
  printf '\n--- Project / release metadata ---\n'
  if [[ -f package.json ]]; then
    node -e "const p=require('./package.json'); console.log('Package    : '+p.name+'@'+p.version); console.log('Node engine: '+(p.engines?.node||'not declared')); console.log('Start      : '+(p.scripts?.start||'not configured')); console.log('Test       : '+(p.scripts?.test||'not configured'))" 2>/dev/null || printf 'Metadata package.json tidak dapat dibaca.\n'
  else printf 'package.json tidak ditemukan.\n'; fi
  printf 'Node       : '; node --version 2>/dev/null || printf 'not found\n'
  printf 'npm        : '; npm --version 2>/dev/null || printf 'not found\n'
  local search_dirs=()
  for candidate in src scripts test config automation .github/scripts; do
    [[ -d "$candidate" ]] && search_dirs+=("$candidate")
  done
  local source_count=0
  if (( ${#search_dirs[@]} )); then
    source_count="$(find "${search_dirs[@]}" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -print | wc -l | tr -d ' ')"
  fi
  printf 'Source JS  : %s\n' "$source_count"
  for file in README.md docs/project/CHANGELOG.md .env.example assets/dungeon/floors.json; do
    [[ -f "$file" ]] && printf '  ✓ %s\n' "$file" || printf '  ⚠ %s missing\n' "$file"
  done
}

print_workflow_audit() {
  printf '\n--- GitHub Actions branch ownership audit ---\n'
  if [[ ! -d .github/workflows ]]; then printf 'BLOCK: .github/workflows tidak ditemukan.\n'; return 1; fi
  if grep -RniE 'git push .*(:| )main([[:space:]]|$)' .github/workflows >/dev/null 2>&1; then
    printf 'BLOCK: ditemukan workflow yang berpotensi push ke main:\n'
    grep -RniE 'git push .*(:| )main([[:space:]]|$)' .github/workflows || true
    return 1
  fi
  printf 'OK: tidak ditemukan perintah push langsung ke main pada workflow.\n'
  printf 'Autopilot branch automation tetap terpisah dari main dan upload/* memakai Pull Request.\n'
}

protect_runtime_index() {
  if [[ -f scripts/protect-runtime-data.mjs ]]; then
    node scripts/protect-runtime-data.mjs
  else
    printf 'WARNING: scripts/protect-runtime-data.mjs tidak ada; runtime path audit tetap wajib lulus.\n'
  fi
}

repair_upload_whitespace() {
  local check_output=""
  if [[ -f scripts/git-upload-repair.mjs ]]; then
    WHISKAY_UPLOAD_RUN_ID="${WHISKAY_UPLOAD_RUN_ID:-$(date '+%Y%m%d-%H%M%S')}" node scripts/git-upload-repair.mjs --staged || return 1
  fi
  if check_output="$(git diff --cached --check -- '*.js' '*.mjs' '*.cjs' '*.json' '*.yml' '*.yaml' '*.sh' '*.py' 2>&1)"; then
    printf 'WHITESPACE_REPAIR_RESULT=PASS\n'
    return 0
  fi
  printf '%s\n' "$check_output"
  if [[ -f scripts/nexora-git-repair.mjs ]]; then
    printf 'NEXORA_REPAIR_FALLBACK=START (agent reads local .env and checks explicit opt-in)\n'
    node scripts/nexora-git-repair.mjs --staged "$check_output" || return 1
    git diff --cached --check -- '*.js' '*.mjs' '*.cjs' '*.json' '*.yml' '*.yaml' '*.sh' '*.py'
    return $?
  fi
  printf 'NEXORA_REPAIR_FALLBACK=UNAVAILABLE\n'
  return 1
}

scan_unstaged_secrets() {
  local diff_text=""
  diff_text="$(git diff --cached --diff-filter=ACMR --binary 2>/dev/null || true)$(git diff --diff-filter=ACMR --binary 2>/dev/null || true)"
  if printf '%s' "$diff_text" | grep -Eiq "$secret_pattern"; then
    printf 'BLOCK: pola token/private key ditemukan pada perubahan staged/unstaged.\n'
    return 1
  fi
  while IFS= read -r -d '' file; do
    if [[ -f "$file" ]] && ! is_private_path "$file" && grep -IqE "$secret_pattern" -- "$file"; then
      printf 'BLOCK: pola token/private key ditemukan pada file baru: %s\n' "$file"
      return 1
    fi
  done < <(git ls-files --others --exclude-standard -z)
  return 0
}

case "$MODE" in
  --analyze|analyze)
    protect_runtime_index
    print_ignore_audit || exit 8
    print_workflow_audit || exit 8
    print_project_audit
    printf '\n--- Tracked private path audit ---\n'
    private_tracked=0
    while IFS= read -r -d '' file; do
      if is_private_path "$file"; then printf 'BLOCK still tracked: %s\n' "$file"; private_tracked=1; fi
    done < <(git ls-files -z)
    [[ "$private_tracked" -eq 0 ]] || exit 8
    printf 'OK: tidak ada database/data/session/credential path yang masih tracked.\n'
    scan_unstaged_secrets || exit 8
    printf '\n--- Git status / divergence ---\n'
    git status --short || true
    printf 'Branch: %s | Base: %s | HEAD: %s\n' "${BRANCH:-detached}" "$BASE_BRANCH" "$(git rev-parse --short HEAD)"
    if git show-ref --verify --quiet "refs/remotes/origin/$BASE_BRANCH"; then
      git rev-list --left-right --count "origin/$BASE_BRANCH...HEAD" | awk '{printf "Behind base: %s\nAhead of base : %s\n", $1, $2}'
    else
      printf 'origin/%s belum tersedia di local cache.\n' "$BASE_BRANCH"
    fi
    printf '\nAPPROVAL_FINGERPRINT=%s\n' "$(fingerprint)"
    ;;

  --qa|qa)
    mkdir -p "$LOG_DIR"
    LOG_DIR_ABS="$(cd "$LOG_DIR" && pwd)"
    NPM_CI_RESULT="SKIPPED"
    SYNTAX_RESULT="FAIL"
    NPM_TEST_RESULT="FAIL"
    NPM_AUDIT_RESULT="NOT_RUN"
    CI_EXIT=0
    if [[ "$SKIP_INSTALL" -eq 0 ]]; then
      printf '=== DEPENDENCY INSTALL: npm ci ===\n'
      if npm ci --no-audit --no-fund --fetch-retries=2 --fetch-timeout=30000 >"$LOG_DIR_ABS/npm-ci.log" 2>&1; then
        NPM_CI_RESULT="PASS"
      else
        install_exit=$?
        # Retry once with npm cache preference to survive transient registry/DNS errors.
        if grep -Eqi 'EAI_AGAIN|ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED' "$LOG_DIR_ABS/npm-ci.log"; then
          printf 'npm ci mengalami gangguan jaringan; mencoba fallback --prefer-offline.\n' >>"$LOG_DIR_ABS/npm-ci.log"
          if npm ci --no-audit --no-fund --prefer-offline --fetch-retries=2 --fetch-timeout=30000 >>"$LOG_DIR_ABS/npm-ci.log" 2>&1; then
            NPM_CI_RESULT="PASS_RETRY"
          else
            install_exit=$?
          fi
        fi
        if [[ "$NPM_CI_RESULT" == "SKIPPED" ]]; then
          NPM_CI_RESULT="FAIL"
          CI_EXIT=1
          node scripts/archive-test-log.mjs "$LOG_DIR/npm-ci.log" npm-ci "$install_exit" >/dev/null 2>&1 || true
        fi
      fi
      cat "$LOG_DIR_ABS/npm-ci.log"
      printf 'NPM_CI_RESULT=%s\n' "$NPM_CI_RESULT"
    else
      printf 'NPM_CI_RESULT=SKIPPED_BY_OPERATOR\n'
    fi

    printf '\n=== STATIC SYNTAX VALIDATION ===\n'
    syntax_dirs=()
    for candidate in src scripts test config automation .github/scripts; do
      [[ -d "$candidate" ]] && syntax_dirs+=("$candidate")
    done
    if (( ${#syntax_dirs[@]} )) && find "${syntax_dirs[@]}" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -print0 | while IFS= read -r -d '' file; do node --check "$file" || exit 1; done >"$LOG_DIR_ABS/syntax.log" 2>&1; then
      SYNTAX_RESULT="PASS"
    else
      SYNTAX_RESULT="FAIL"; CI_EXIT=1
    fi
    cat "$LOG_DIR_ABS/syntax.log"
    printf 'SYNTAX_RESULT=%s\n' "$SYNTAX_RESULT"

    printf '\n=== FULL REGRESSION: npm test ===\n'
    if npm test >"$LOG_DIR_ABS/npm-test.log" 2>&1; then
      NPM_TEST_RESULT="PASS"
    else
      NPM_TEST_RESULT="FAIL"; CI_EXIT=1
    fi
    cat "$LOG_DIR_ABS/npm-test.log"
    printf 'NPM_TEST_RESULT=%s\n' "$NPM_TEST_RESULT"

    printf '\n=== DEPENDENCY SECURITY AUDIT: npm audit ===\n'
    if npm audit --json >"$LOG_DIR_ABS/npm-audit.json" 2>"$LOG_DIR_ABS/npm-audit-stderr.log"; then
      audit_exit=0
    else
      audit_exit=$?
    fi
    if NPM_AUDIT_EXIT="$audit_exit" node --input-type=module - "$LOG_DIR_ABS/npm-audit.json" <<'NODE'
import fs from 'node:fs';
const file = process.argv[2];
const npmExit = Number(process.env.NPM_AUDIT_EXIT || 0);
try {
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (report.error) {
    console.log(`NPM_AUDIT_RESULT=UNAVAILABLE code=${report.error.code || 'UNKNOWN'} summary=${report.error.summary || report.error.message || 'registry error'}`);
    process.exitCode = 2;
  } else {
    const v = report.metadata?.vulnerabilities || {};
    console.log(`NPM_AUDIT_COUNTS critical=${v.critical || 0} high=${v.high || 0} moderate=${v.moderate || 0} low=${v.low || 0} info=${v.info || 0}`);
    for (const [name, item] of Object.entries(report.vulnerabilities || {})) {
      console.log(`NPM_AUDIT_ITEM ${item.severity || 'unknown'} ${name} direct=${Boolean(item.isDirect)} range=${item.range || 'unknown'} fix=${JSON.stringify(item.fixAvailable ?? false)}`);
    }
    if ((v.critical || 0) > 0 || (v.high || 0) > 0) {
      console.log('NPM_AUDIT_RESULT=FAIL_HIGH_OR_CRITICAL');
      process.exitCode = 1;
    } else {
      const total = (v.high || 0) + (v.moderate || 0) + (v.low || 0) + (v.info || 0);
      if (total > 0 || npmExit !== 0) { console.log('NPM_AUDIT_RESULT=WARN_ADVISORIES'); process.exitCode = 3; }
      else console.log('NPM_AUDIT_RESULT=PASS');
    }
  }
} catch (error) {
  console.log(`NPM_AUDIT_RESULT=UNAVAILABLE parse_error=${error.message}`);
  process.exitCode = 2;
}
NODE
    then
      audit_parse_exit=0
    else
      audit_parse_exit=$?
    fi
    cat "$LOG_DIR_ABS/npm-audit-stderr.log"
    if [[ "$audit_parse_exit" -eq 0 ]]; then NPM_AUDIT_RESULT=PASS
    elif [[ "$audit_parse_exit" -eq 1 ]]; then NPM_AUDIT_RESULT=FAIL; CI_EXIT=1
    elif [[ "$audit_parse_exit" -eq 3 ]]; then NPM_AUDIT_RESULT=WARN_ADVISORIES
    else NPM_AUDIT_RESULT=UNAVAILABLE; CI_EXIT=1; fi
    printf 'NPM_AUDIT_RESULT=%s (npm_exit=%s)\n' "$NPM_AUDIT_RESULT" "$audit_exit"

    if [[ "$CI_EXIT" -eq 0 ]]; then printf 'QA_RESULT=PASS\n'; else printf 'QA_RESULT=FAIL\n'; fi
    printf 'QA_LOG_DIR=%s\n' "$LOG_DIR"
    exit "$CI_EXIT"
    ;;

  --snapshot)
    # Stage 56: reconcile moved/duplicate scripts before the secure snapshot.
    [[ "$BRANCH" == upload/* ]] || fail "Snapshot hanya boleh dibuat pada branch upload/* (sekarang: ${BRANCH:-detached})."
    node scripts/git-upload-intelligence.mjs --reconcile
    git add -A
    repair_upload_whitespace || fail 'Whitespace repair tidak berhasil. File asli dipertahankan; aktifkan NEXORA_GIT_REPAIR_ENABLED=true untuk fallback AI yang dibatasi.'
    node scripts/git-upload-intelligence.mjs --verify
    staged_private=0
    while IFS= read -r -d '' file; do
      if is_private_path "$file"; then
        printf 'BLOCK: file private masuk staging: %s\n' "$file"
        staged_private=1
      fi
    done < <(git diff --cached --name-only --diff-filter=ACMRT -z)
    [[ "$staged_private" -eq 0 ]] || fail 'Database/session/credential file tidak boleh masuk snapshot.'
    if git diff --cached --binary | grep -Eiq "$secret_pattern"; then
      fail 'Pola token/private key terdeteksi pada snapshot. Secret scan memblokir commit.'
    fi
    if ! git diff --cached --check -- '*.js' '*.mjs' '*.cjs' '*.json' '*.yml' '*.yaml' '*.sh' '*.py'; then
      fail 'Whitespace/conflict-marker check gagal setelah repair.'
    fi
    if git diff --cached --binary | grep -Eiq '^\+(<<<<<<< |=======|>>>>>>> )'; then
      fail 'Conflict marker terdeteksi pada baris baru.'
    fi
    if ! git diff --cached --quiet; then
      git config user.name >/dev/null 2>&1 || git config user.name 'Whiskay Upload Bot'
      git config user.email >/dev/null 2>&1 || git config user.email 'whiskay-upload@users.noreply.github.com'
      export TZ=Asia/Jakarta
      timestamp_text="$(date '+%A %Y-%m-%d %H:%M:%S WIB')"
      timestamp_iso="$(date '+%Y-%m-%dT%H:%M:%S%z')"
      MESSAGE="${MESSAGE:-chore(whiskay): snapshot local changes ${timestamp_text}}"
      GIT_AUTHOR_DATE="$timestamp_iso" GIT_COMMITTER_DATE="$timestamp_iso" git commit -m "$MESSAGE"
      printf 'SNAPSHOT_RESULT=COMMITTED\n'
    else
      printf 'SNAPSHOT_RESULT=NO_CHANGES\n'
    fi
    ;;

  --publish|--push|publish|push)
    [[ "$BRANCH" == upload/* ]] || fail "Publish hanya boleh dari branch upload/* (branch saat ini: ${BRANCH:-detached}). Main tidak pernah menjadi target upload."
    [[ -n "$REMOTE_URL" ]] || fail 'Remote origin belum dikonfigurasi.'
    [[ -n "$EXPECTED" ]] || fail 'Fingerprint persetujuan tidak diberikan.'
    CURRENT="$(fingerprint)"
    [[ "$CURRENT" == "$EXPECTED" ]] || fail 'Repository berubah setelah validasi/laporan. Jalankan ulang analyze sebelum publish.'
    node scripts/git-upload-intelligence.mjs --reconcile
    git add -A
    repair_upload_whitespace || fail 'Whitespace repair tidak berhasil. File asli dipertahankan; aktifkan NEXORA_GIT_REPAIR_ENABLED=true untuk fallback AI yang dibatasi.'
    node scripts/git-upload-intelligence.mjs --verify

    staged_private=0
    while IFS= read -r -d '' file; do
      if is_private_path "$file"; then
        printf 'BLOCK: file private masuk staging: %s\n' "$file"
        staged_private=1
      fi
    done < <(git diff --cached --name-only --diff-filter=ACMRT -z)
    [[ "$staged_private" -eq 0 ]] || fail 'Database/session/credential file tidak boleh di-upload. Periksa .gitignore.'

    if git diff --cached --diff-filter=ACMRT --binary | grep -Eiq "$secret_pattern"; then
      fail 'Pola token/private key terdeteksi pada staged diff. Secret scan memblokir upload.'
    fi
    # Stage 55: whitespace gate applies to executable/config source, not historical prose/vendor fixtures.
    # Existing documentation whitespace must not block unrelated code uploads.
    if ! git diff --cached --check -- '*.js' '*.mjs' '*.cjs' '*.json' '*.yml' '*.yaml' '*.sh' '*.py'; then
      fail 'Whitespace/conflict-marker check gagal pada source/config yang berubah. Lihat git diff --check.'
    fi
    if git diff --cached --binary | grep -Eiq '^\+(<<<<<<< |=======|>>>>>>> )'; then
      fail 'Conflict marker terdeteksi pada baris baru.'
    fi

    if ! git diff --cached --quiet; then
      git config user.name >/dev/null 2>&1 || git config user.name 'Whiskay Upload Bot'
      git config user.email >/dev/null 2>&1 || git config user.email 'whiskay-upload@users.noreply.github.com'
      export TZ=Asia/Jakarta
      timestamp_text="$(date '+%A %Y-%m-%d %H:%M:%S WIB')"
      timestamp_iso="$(date '+%Y-%m-%dT%H:%M:%S%z')"
      MESSAGE="${MESSAGE:-chore(whiskay): automated upload ${timestamp_text}}"
      GIT_AUTHOR_DATE="$timestamp_iso" GIT_COMMITTER_DATE="$timestamp_iso" git commit -m "$MESSAGE"
    else
      printf 'Tidak ada perubahan baru untuk commit.\n'
    fi

    if git show-ref --verify --quiet "refs/remotes/origin/$BASE_BRANCH"; then
      ahead="$(git rev-list --count "origin/$BASE_BRANCH..HEAD")"
    else
      # A missing tracking ref can happen after a temporary DNS/auth outage.
      # The publish branch remains isolated; push is still attempted using the
      # configured origin or the explicit GitHub token/CLI fallback below.
      ahead=1
      printf 'WARNING: refs/remotes/origin/%s tidak tersedia; ancestry divergensi tidak dapat dihitung.
' "$BASE_BRANCH" >&2
    fi
    if [[ "${ahead:-0}" -eq 0 ]]; then fail 'Tidak ada commit upload yang perlu dikirim.'; fi

    printf 'Upload branch : %s\nBase branch   : %s\nRepository    : %s\n' "$BRANCH" "$BASE_BRANCH" "$REPO_SLUG"
    PUSH_OK=0
    for push_attempt in 1 2 3; do
      if git push -u origin "$BRANCH"; then PUSH_OK=1; break; fi
      if (( push_attempt < 3 )); then
        delay=$((push_attempt * 2))
        printf 'Push origin gagal (attempt %s/3); retry aman dalam %ss tanpa force-push.\n' "$push_attempt" "$delay" >&2
        sleep "$delay"
      fi
    done
    if [[ "$PUSH_OK" -ne 1 ]]; then
      printf 'Push origin gagal setelah retry; menjalankan fallback autentikasi GitHub CLI/token tanpa menampilkan token.\n' >&2
      token="${GH_TOKEN:-${GITHUB_TOKEN:-${WHISKAY_GITHUB_TOKEN:-${WHISKAY_GITHUB_SYNC_TOKEN:-}}}}"
      if [[ -z "$token" ]] && command -v gh >/dev/null 2>&1 && gh auth status --hostname github.com >/dev/null 2>&1; then
        token="$(gh auth token --hostname github.com 2>/dev/null || true)"
      fi
      [[ -n "$token" ]] || fail 'Push branch gagal; konfigurasi GH_TOKEN/GITHUB_TOKEN/WHISKAY_GITHUB_TOKEN/WHISKAY_GITHUB_SYNC_TOKEN atau GitHub CLI login.'
      basic="$(printf 'x-access-token:%s' "$token" | base64 | tr -d '\n')"
      git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $basic" push -u "https://github.com/${REPO_SLUG}.git" "HEAD:refs/heads/${BRANCH}"
      unset token basic
    fi
    printf '\nPUSH_RESULT=SUCCESS\nUPLOAD_BRANCH=%s\nBASE_BRANCH=%s\n' "$BRANCH" "$BASE_BRANCH"
    printf 'Pull Request akan dibuat oleh .github/workflows/upload-branch-pr.yml.\n'
    printf 'Workflow URL: https://github.com/%s/actions/workflows/upload-branch-pr.yml\n' "$REPO_SLUG"
    git --no-pager log --oneline -3
    ;;

  --fingerprint|fingerprint)
    printf '%s\n' "$(fingerprint)"
    ;;
  *)
    printf 'Usage: bash scripts/auto-push.sh --analyze | --snapshot | --qa [--log-dir=PATH] | --publish --expected-fingerprint=HASH\n' >&2
    exit 64
    ;;
esac
