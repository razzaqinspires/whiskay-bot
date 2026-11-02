#!/usr/bin/env node
/** Stage 57: non-destructive Git commit lineage and interrupted-upload recovery audit. */
import { execFileSync, spawnSync } from 'node:child_process';

const cwd = process.cwd();
const base = process.env.WHISKAY_GITHUB_BASE_BRANCH || 'main';
const run = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryRun = args => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
};
const mode = process.argv[2] || '--analyze';
const branch = tryRun(['branch', '--show-current']);
if (!branch) {
  console.error('RECOVERY_STATUS=BLOCKED_DETACHED_HEAD');
  process.exit(10);
}
const upstream = `origin/${base}`;
const hasBase = Boolean(tryRun(['rev-parse', '--verify', upstream]));
const status = tryRun(['status', '--porcelain=v1', '-uall']);
console.log(`CURRENT_BRANCH=${branch}`);
console.log(`BASE_BRANCH=${upstream}`);
console.log(`WORKTREE=${status ? 'DIRTY' : 'CLEAN'}`);
if (!branch.startsWith('upload/')) {
  console.log(`RECOVERY_STATUS=${branch === base ? 'READY_TO_START' : 'NOT_AN_UPLOAD_BRANCH'}`);
  if (branch !== base) process.exitCode = 11;
} else if (!hasBase) {
  console.log('RECOVERY_STATUS=BASE_REF_UNAVAILABLE');
  console.log('RECOVERY_ACTION=FETCH_BASE_AND_RETRY');
} else {
  const mergeBase = tryRun(['merge-base', upstream, 'HEAD']);
  if (!mergeBase) {
    console.log('RECOVERY_STATUS=UNRELATED_HISTORY');
    process.exitCode = 12;
  } else {
    const ahead = Number(run(['rev-list', '--count', `${upstream}..HEAD`]) || 0);
    const behind = Number(run(['rev-list', '--count', `HEAD..${upstream}`]) || 0);
    const cherry = tryRun(['cherry', '-v', upstream, 'HEAD']);
    const equivalent = cherry.split('\n').filter(line => line.startsWith('- '));
    const unique = cherry.split('\n').filter(line => line.startsWith('+ '));
    const commits = tryRun(['log', '--format=%H%x09%h%x09%s', `${upstream}..HEAD`]);
    console.log(`MERGE_BASE=${mergeBase}`);
    console.log(`COMMITS_AHEAD=${ahead}`);
    console.log(`COMMITS_BEHIND=${behind}`);
    console.log(`PATCHES_ALREADY_IN_BASE=${equivalent.length}`);
    console.log(`UNIQUE_PATCHES_PENDING=${unique.length}`);
    console.log('--- Pending commit lineage ---');
    console.log(commits || 'No commits ahead of base.');
    if (equivalent.length) {
      console.log('--- Patch-equivalent commits (already represented in base) ---');
      console.log(equivalent.join('\n'));
    }
    if (ahead === 0) console.log('RECOVERY_STATUS=NOTHING_TO_PUSH');
    else if (unique.length === 0) console.log('RECOVERY_STATUS=PATCHES_ALREADY_IN_BASE');
    else if (behind > 0) console.log('RECOVERY_STATUS=RESUME_AFTER_BASE_SYNC');
    else console.log('RECOVERY_STATUS=READY_TO_PUBLISH');
    console.log('RECOVERY_MUTATION=NONE');
    if (mode === '--check-publish' && ahead > 0 && unique.length === 0) {
      console.error('PUBLISH_BLOCKED=ALL_PENDING_COMMITS_ALREADY_IN_BASE');
      process.exitCode = 13;
    } else if (mode === '--check-publish' && ahead === 0) {
      console.error('PUBLISH_BLOCKED=NO_COMMITS_AHEAD');
      process.exitCode = 13;
    }
  }
}
