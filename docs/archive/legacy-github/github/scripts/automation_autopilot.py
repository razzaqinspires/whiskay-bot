#!/usr/bin/env python3
"""Guarded repository auditor. Writes state only under automation/."""
import argparse, json, os, subprocess, sys, urllib.error, urllib.parse, urllib.request
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path

p = argparse.ArgumentParser(); p.add_argument('--source', default='.'); p.add_argument('--safe-mode', action='store_true'); args = p.parse_args()
root = Path(args.source).resolve(); auto = root / 'automation'
now = datetime.now(timezone.utc); day = now.strftime('%Y-%m-%d'); stamp = now.isoformat(timespec='seconds')
repo = os.getenv('GITHUB_REPOSITORY','')

def load(path, fallback):
    try: return json.loads(path.read_text(encoding='utf-8'))
    except Exception: return fallback

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True); path.write_text(json.dumps(data, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')

def git(*cmd):
    return subprocess.check_output(['git','-C',str(root),*cmd], text=True, stderr=subprocess.DEVNULL, timeout=12).strip()

def api(path, token, optional=False):
    req=urllib.request.Request('https://api.github.com'+path, headers={'Accept':'application/vnd.github+json','User-Agent':'Whiskay-Autopilot','Authorization':f'Bearer {token}' if token else ''})
    try:
        with urllib.request.urlopen(req, timeout=10) as r: return json.loads(r.read().decode())
    except Exception as e:
        if optional: return {'unavailable':str(e)}
        raise

# Guardrail: generated state and self-rules must remain in the automation namespace.
config_path=auto/'config.json'; config=load(config_path, {'audit_interval_hours':6,'traffic_drop_threshold_pct':30,'watch_paths':['src','plugins','lib','.github/workflows'],'verbosity':'normal','deep_audit':False})
if args.safe_mode:
    config['verbosity']='minimal'; config['deep_audit']=False

auto.mkdir(parents=True, exist_ok=True)
try:
    head=git('rev-parse','HEAD'); branch=git('branch','--show-current')
    if branch not in ('main','automation'):
        raise RuntimeError('Source checkout is not an allowed read-only branch: '+branch)
    status=git('status','--porcelain')
    if status:
        # Checkout source is expected clean; do not run on a dirty source tree.
        raise RuntimeError('Source checkout unexpectedly dirty; refusing to continue.')
    log=git('log','-n','100','--date=iso-strict','--pretty=format:%H%x09%an%x09%ad%x09%s','--name-only').splitlines()
    authors=Counter(); changed=Counter(); hours=Counter(); current_author=None
    for line in log:
        if '\t' in line and len(line.split('\t'))>=4:
            parts=line.split('\t',3); current_author=parts[1]; authors[current_author]+=1
            try: hours[int(parts[2][11:13])]+=1
            except Exception: pass
        elif line and not line.startswith(('commit ',)) and '/' in line:
            changed[line]+=1
    insights={'updated_at':stamp,'sampled_commits':sum(authors.values()),'active_authors':authors.most_common(10),'frequently_changed_files':changed.most_common(20),'busy_utc_hours':hours.most_common(5)}
    write_json(auto/'insights.json', insights)
    (auto/'rules').mkdir(exist_ok=True)
    rule=auto/'rules'/f'{day}-baseline.yml'
    if not rule.exists(): rule.write_text('version: 1\nname: baseline-source-audit\nchecks:\n  - clean-source-checkout\n  - automation-only-write-scope\n  - workflow-main-write-ban\n  - inspect-watch-paths\nappend_only: true\n',encoding='utf-8')
    report={'timestamp':stamp,'repository':repo,'source_branch':'main','source_sha':head,'mode':'safe' if args.safe_mode else ('deep-audit' if config.get('deep_audit') else 'normal'),'checks':[],'findings':[],'changes':['automation/config.json','automation/insights.json','automation/rules/'+rule.name],'errors':0,'traffic':None}
    workflows=list((root/'.github/workflows').glob('*.yml'))+list((root/'.github/workflows').glob('*.yaml'))
    forbidden=[]
    for wf in workflows:
        text=wf.read_text(encoding='utf-8',errors='replace')
        # Strong conservative detection: direct push to main / bot write token in workflow.
        if ('git push origin main' in text or 'HEAD:main' in text or 'git push origin \"main\"' in text or ('git-auto-commit-action' in text and 'branch: main' in text)): forbidden.append(str(wf.relative_to(root)))
    report['checks'].append({'name':'workflow-main-write-ban','passed':not forbidden,'files':forbidden})
    if forbidden: report['findings'].append({'severity':'critical','message':'Potential workflow write to protected human-owned main detected','files':forbidden})
    report['checks'].append({'name':'source-checkout-clean','passed':not bool(status)})
    if not args.safe_mode:
        token=os.getenv('GITHUB_TOKEN','')
        if repo and token:
            details=api('/repos/'+urllib.parse.quote(repo,safe='/'),token)
            traffic_token=os.getenv('GH_TRAFFIC_TOKEN','')
            traffic={'available':False}
            if traffic_token:
                enc=urllib.parse.quote(repo,safe='/'); v=api('/repos/'+enc+'/traffic/views',traffic_token,True); c=api('/repos/'+enc+'/traffic/clones',traffic_token,True)
                if 'unavailable' not in v and 'unavailable' not in c:
                    traffic={'available':True,'views14d':v.get('count',0),'uniqueVisitors14d':v.get('uniques',0),'clones14d':c.get('count',0),'uniqueCloners14d':c.get('uniques',0)}
            report['traffic']={'stars':details.get('stargazers_count',0),'forks':details.get('forks_count',0),**traffic}
            previous=load(auto/'reports'/f'{(now-timedelta(days=1)).strftime("%Y-%m-%d")}.json',{})
            prev_t=(previous.get('traffic') or {})
            if traffic.get('available') and prev_t.get('available') and prev_t.get('views14d',0)>0:
                drop=(prev_t['views14d']-traffic['views14d'])/prev_t['views14d']*100
                if drop>float(config.get('traffic_drop_threshold_pct',30)):
                    report['findings'].append({'severity':'warning','message':f'Traffic views dropped {drop:.1f}% vs previous report','hypothesis':'Normal traffic variance, API window changes, or referrer changes; validate next run.'})
                    config['verbosity']='verbose'
                    (auto/'self-review.md').write_text(f'# Self-review required\n\nUpdated: {stamp}\n\n- Anomaly: traffic views dropped {drop:.1f}% against prior report.\n- Hypothesis: traffic variance, rolling-window changes, or API measurement differences.\n- Next action: compare another successful sample before changing behavior.\n',encoding='utf-8')
        else: report['findings'].append({'severity':'info','message':'GitHub API token unavailable; metrics limited.'})
    # Score: completeness, accuracy (guardrail checks), uptime proxy (success streak). Not a claim of service uptime.
    old=load(auto/'self-score.json',{'success_streak':0,'consecutive_score_drops':0})
    complete=100 if report['checks'] and all('passed' in x for x in report['checks']) else 70
    accuracy=100 if not forbidden else 0
    uptime=min(100, int(old.get('success_streak',0)*10+90))
    score=round((complete+accuracy+uptime)/3)
    prior=old.get('score',score); drops=old.get('consecutive_score_drops',0)+1 if score < prior-5 else 0
    config['deep_audit']=drops>=2
    write_json(config_path,config)
    write_json(auto/'self-score.json',{'updated_at':stamp,'score':score,'completeness':complete,'accuracy':accuracy,'uptime_proxy':uptime,'success_streak':old.get('success_streak',0)+1,'consecutive_score_drops':drops,'mode':'deep-audit' if config['deep_audit'] else config['verbosity']})
    report_path=auto/'reports'/f'{day}.json'; report_path.parent.mkdir(parents=True,exist_ok=True)
    existing=load(report_path,{'date':day,'runs':[]}); existing.setdefault('runs',[]).append(report); existing['runs']=existing['runs'][-12:]; write_json(report_path,existing)
    if forbidden:
        incident=auto/'incidents'/f'{day}.log'; incident.parent.mkdir(parents=True,exist_ok=True); incident.write_text(f'SEVERITY: critical\n{stamp} Guardrail detected possible main-write workflow: {forbidden}\n',encoding='utf-8')
    readme=f'''# Whiskay Automation Status\n\n- Last run (UTC): {stamp}\n- Source: `main` @ `{head[:12]}` (read-only)\n- Schedule: every 6 hours; daily health audit at 03:00 UTC\n- Mode: {report['mode']}\n- Self-score: {score}/100 (completeness {complete}, accuracy {accuracy}, uptime proxy {uptime})\n- Latest findings: {len(report['findings'])}\n- Guardrail: bot commits are restricted to `automation/` on branch `automation`; main/develop/release branches are human-owned.\n\nSee `reports/{day}.json`, `insights.json`, `self-score.json`, `self-review.md`, and `incidents/` for details.\n'''
    (auto/'README.md').write_text(readme,encoding='utf-8')
    (auto/'digest').mkdir(exist_ok=True); (auto/'digest'/f'{day}.md').write_text(f'# Automation digest — {day}\n\n- Run: {stamp}\n- Source SHA: `{head}`\n- Mode: {report["mode"]}\n- Score: {score}/100\n- Findings: {json.dumps(report["findings"],ensure_ascii=False)}\n',encoding='utf-8')
    print(json.dumps({'source_sha':head,'branch':branch,'score':score,'findings':report['findings'],'forbidden_workflows':forbidden},ensure_ascii=False))
    if forbidden: sys.exit(2)
except Exception as exc:
    incident=auto/'incidents'/f'{day}.log'; incident.parent.mkdir(parents=True,exist_ok=True)
    with incident.open('a',encoding='utf-8') as f: f.write(f'SEVERITY: error\n{stamp} {type(exc).__name__}: {exc}\n')
    print(f'Automation audit error: {type(exc).__name__}: {exc}',file=sys.stderr)
    sys.exit(1)
