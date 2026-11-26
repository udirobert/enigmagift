#!/usr/bin/env python3
"""Rebuild notes/KANECLI-EVIDENCE.md from local Kane evidence packs.

The public artifact is the Test Manager sharable_link inside each pack; the
packs themselves remain local/gitignored. Usage:
  python3 scripts/kane-evidence-index.py --since 2026-11-26T17:30:00Z
"""
from __future__ import annotations
import argparse, re, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / '.testmuai' / 'evidence'
OUT = ROOT / 'notes' / 'KANECLI-EVIDENCE.md'

def field(text: str, name: str):
    m = re.search(rf'^{re.escape(name)}:\s*(.+)$', text, re.M)
    return m.group(1).strip().strip("'") if m else ''

def nested(text: str, name: str):
    m = re.search(rf'^\s+{re.escape(name)}:\s*(.+)$', text, re.M)
    return m.group(1).strip().strip("'") if m else ''

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', required=True, help='ISO timestamp; only runs started at/after this are indexed')
    args = ap.parse_args()
    rows = []
    skipped = []
    for zpath in sorted(EVIDENCE.glob('*.evidence')):
        if not zpath.is_file():
            continue
        try:
            with zipfile.ZipFile(zpath) as z:
                run = z.read('run.yaml').decode('utf-8', 'replace')
                started = field(run, 'started')
                if started < args.since:
                    continue
                results = [n for n in z.namelist() if re.match(r'^tests/[^/]+/result.yaml$', n)]
                for name in results:
                    text = z.read(name).decode('utf-8', 'replace')
                    test = field(text, 'test')
                    test_md = name.rsplit('/', 1)[0] + '/test.md'
                    if test_md in z.namelist():
                        md = z.read(test_md).decode('utf-8', 'replace')
                        hm = re.search(r'^#\s+(.+)$', md, re.M)
                        if hm:
                            test = hm.group(1).strip()
                    status = field(text, 'status')
                    duration = field(text, 'duration_ms')
                    share = nested(text, 'sharable_link')
                    assurance = field(text, 'assurance_id')
                    rows.append({
                        'test': test,
                        'status': status,
                        'duration_s': round((int(duration) if duration.isdigit() else 0) / 1000),
                        'share': share,
                        'pack': zpath.name,
                        'started': started,
                        'assurance': assurance,
                    })
        except Exception as e:
            skipped.append((zpath.name, str(e)))
    rows.sort(key=lambda r: (r['test'], r['started']))
    passed = sum(1 for r in rows if r['status'] == 'passed')
    lines = [
        '# KaneCLI evidence index',
        '',
        f'Fresh run window: **26 Nov 2026, from {args.since}**. Evidence packs themselves are local zip files (`.testmuai/evidence/`, gitignored); the public judge evidence is the Test Manager share link in each row.',
        '',
        f'**Run shape:** {passed}/{len(rows)} indexed tests passed. This index is generated from the evidence packs, not from terminal output.',
        '',
        '| Test | Fresh status | Duration | Evidence | Local pack |',
        '| --- | --- | --- | --- | --- |',
    ]
    for r in rows:
        link = f'[open]({r["share"]})' if r['share'] else 'not uploaded'
        lines.append(f'| `{r["test"]}` | {r["status"]} | {r["duration_s"]}s | {link} | `{r["pack"]}` |')
    lines += [
        '',
        '## Interpretation',
        '',
        '- A green row is public evidence that Kane replayed that browser test against the freshly built local room bundle on 26 Nov 2026.',
        '- A red row is not hidden: it is evidence of Kane catching requirement/product/test drift. Triage is recorded in `notes/KANECLI-HACKATHON.md` and the submission narrative.',
        '- Superseded tests remain in `.testmuai/tests/superseded/` for audit; they are not release-blocking suite members.',
        '- The local gate additionally validates the Kane NDJSON stream and refuses deployment when any selected member fails, breaks, is interrupted, is missing a final result, or emits unresolved-variable warnings.',
        '- Explicit coverage debt: replacement creator-side tests for multi-format input normalization, blocked persistent storage and saved-recipient preview still need to be redesigned/authored after the deadline-day drift triage.',
    ]
    if skipped:
        lines += ['', '## Unreadable evidence artifacts', '']
        lines += [f'- `{n}` — {e}' for n, e in skipped]
    OUT.write_text('\n'.join(lines) + '\n')
    print(f'wrote {OUT} with {len(rows)} rows ({passed} passed)')

if __name__ == '__main__':
    main()
