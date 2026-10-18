"""Compare already saved Phase A live catalog evidence; no database connection."""
import csv
import json
import re
from collections import Counter
from pathlib import Path

out = Path(__file__).resolve().parents[1] / 'docs/aws-phase-a'
live = json.loads((out / 'rds-targeted-live-2026-10-14.json').read_text(encoding='utf-8-sig'))
original = json.loads((out / 'rds-admin-definition-metadata.json').read_text(encoding='utf-8-sig'))
security = json.loads((out / 'rds-admin-security-metadata.json').read_text(encoding='utf-8-sig'))
definitions = {(f['name'], f['arguments']): f for f in original['functions']}
routine_security = {(f['name'], f['arguments']): f for f in security['functions']}
relations = {t['name']: t for t in original['tables']}
policies = {(p['tablename'], p['policyname']): p for p in original['policies']}
definition_drift, routine_drift, relation_drift, policy_drift = [], [], [], []
for routine in live['reviewed_routines']:
    key = (routine['name'], routine['arguments'])
    if key not in definitions or routine['definition'] != definitions[key]['definition']:
        definition_drift.append(routine['name'])
    if key not in routine_security or any(routine.get(field) != routine_security[key].get(field)
        for field in ['returns', 'owner', 'security_definer', 'settings', 'acl']):
        routine_drift.append(routine['name'])
for relation in live['relevant_relations']:
    if relation['name'] not in relations or any(relation.get(field) != relations[relation['name']].get(field)
        for field in ['owner', 'rls', 'force_rls', 'acl']):
        relation_drift.append(relation['name'])
for policy in live['relevant_policies']:
    assert isinstance(policy['roles'], list), 'Reader must cast pg_policies.roles to text[]'
    key = (policy['tablename'], policy['policyname'])
    if policy != policies.get(key):
        policy_drift.append(key)
legacy = [policy for policy in live['relevant_policies'] if 'public' in policy['roles']
          and re.search(r'auth\.|is_admin\s*\(', (policy.get('qual') or '') + ' ' + (policy.get('with_check') or ''), re.I)]
roles = sorted({row['rolname'] for row in live['actor_execution']})
summary = {
    'checked_at': live['checked_at'], 'routine_definition_drift': definition_drift,
    'routine_security_drift': routine_drift, 'relation_security_drift': relation_drift,
    'policy_drift': policy_drift, 'reviewed_routine_count': len(live['reviewed_routines']),
    'live_relevant_relation_count': len(live['relevant_relations']),
    'live_relevant_policy_count': len(live['relevant_policies']), 'schema_access': live['schema_access'],
    'public_legacy_policies': legacy,
    'effective_actor_execute_by_role': {role: {
        'true': sum(row['rolname'] == role and row['can_execute'] for row in live['actor_execution']),
        'false': sum(row['rolname'] == role and not row['can_execute'] for row in live['actor_execution'])}
        for role in roles},
    'admin_runtime_present': any(row['rolname'] == 'hod_admin_app' for row in live['roles']),
    'sequence_dependency_types': dict(Counter(row['dependency_type'] for row in live['sequences'])),
}
(out / 'rds-targeted-live-review.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
with (out / 'rds-sequence-review.csv').open('w', newline='', encoding='utf-8') as handle:
    writer = csv.DictWriter(handle, fieldnames=['relation', 'column_name', 'sequence_name', 'dependency_type', 'owner', 'acl'])
    writer.writeheader()
    writer.writerows(live['sequences'])
print(json.dumps({key: value for key, value in summary.items() if key != 'public_legacy_policies'}, indent=2))
