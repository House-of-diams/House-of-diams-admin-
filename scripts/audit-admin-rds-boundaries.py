"""Phase A: saved metadata review only; never connects or applies SQL."""
import csv
import hashlib
import json
import re
from pathlib import Path

out = Path(__file__).resolve().parents[1] / 'docs/aws-phase-a'
definitions = json.loads((out / 'rds-admin-definition-metadata.json').read_text(encoding='utf-8-sig'))
security = json.loads((out / 'rds-admin-security-metadata.json').read_text(encoding='utf-8-sig'))
metadata = {f['name']: f for f in security['functions']}
relations = {t['name']: t for t in definitions['tables'] if t['kind'] != 'S'}
rows, calls = [], []
for routine in definitions['functions']:
    name, body = routine['name'], routine['definition']
    info = metadata[name]
    refs = set(re.findall(r'\bpublic\.([a-z_][a-z_0-9]*)', body, re.I))
    tables = refs & set(relations)
    dynamic = bool(re.search(r'\bexecute\s+(?:format\s*\(|[a-z_])', body, re.I))
    dynamic_tables = set()
    if name == 'bespoke_form_save_v1':
        dynamic_tables = set(re.findall(r"when\s+'[^']+'\s+then\s+'(bespoke_form_[a-z_]+)'", body, re.I))
        assert dynamic_tables == {'bespoke_form_guarantees', 'bespoke_form_piece_types',
                                 'bespoke_form_stone_options', 'bespoke_form_carat_options',
                                 'bespoke_form_metal_options'}
        assert dynamic_tables <= set(relations)
        tables |= dynamic_tables
    for table in sorted(tables):
        verbs = [verb for verb, pattern in [('INSERT', r'insert\s+into'), ('UPDATE', r'update'), ('DELETE', r'delete\s+from')]
                 if re.search(pattern + r'\s+public\.' + re.escape(table) + r'\b', body, re.I)]
        if table in dynamic_tables:
            verbs = ['INSERT', 'UPDATE', 'DELETE']
        # Upsert evidence is conservative per routine, not an executable grant list.
        upsert = 'INSERT' in verbs and bool(re.search(r'on\s+conflict[\s\S]*?do\s+update', body, re.I))
        relation = relations[table]
        policies = [p for p in definitions['policies'] if p['tablename'] == table]
        legacy = [p['policyname'] for p in policies if re.search(r'auth\.|is_admin\s*\(',
                  (p.get('qual') or '') + ' ' + (p.get('with_check') or ''), re.I)]
        rows.append([name, 'definer' if info['security_definer'] else 'invoker', table,
                     ';'.join(verbs), upsert, table in dynamic_tables, relation['owner'],
                     relation['rls'], relation['force_rls'], ';'.join(legacy),
                     'runtime EXECUTE; owner handles base rights' if info['security_definer']
                     else 'review SELECT/column rights, writes, upserts, RLS and sequences',
                     'lexical evidence; trigger/default/helper checks remain'])
    calls.append({'function': name, 'arguments': info['arguments'], 'returns': info['returns'],
                  'security_definer': info['security_definer'],
                  'nested_exported_routines': sorted((refs & set(metadata)) - {name}),
                  'dynamic_sql': dynamic, 'reviewed_dynamic_tables': sorted(dynamic_tables),
                  'definition_sha256': hashlib.sha256(body.encode()).hexdigest()})
with (out / 'database-boundary-matrix.csv').open('w', newline='', encoding='utf-8') as handle:
    writer = csv.writer(handle)
    writer.writerow(['function', 'execution', 'relation', 'explicit_write_verbs', 'upsert_review',
                     'reviewed_dynamic_target', 'relation_owner', 'rls', 'force_rls',
                     'legacy_policy_names', 'proposed_boundary', 'review_status'])
    writer.writerows(rows)
summary = {'routines_reviewed': len(calls), 'definer_routines': sum(c['security_definer'] for c in calls),
           'invoker_routines': sum(not c['security_definer'] for c in calls),
           'function_relation_rows': len(rows), 'relations_referenced': len({r[2] for r in rows}),
           'invoker_relations': len({r[2] for r in rows if r[1] == 'invoker'}),
           'dynamic_routines': [c['function'] for c in calls if c['dynamic_sql']],
           'limitation': 'Saved 2026-10-11 metadata; lexical matrix plus reviewed bespoke allowlist. '
                         'No live permission test; defaults/triggers/helpers and exact column grants pending.'}
(out / 'database-boundary-review.json').write_text(json.dumps({'summary': summary, 'routines': calls}, indent=2) + '\n')
print(json.dumps(summary, indent=2))
