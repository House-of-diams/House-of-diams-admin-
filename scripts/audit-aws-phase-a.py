"""Read-only source inventory; writes reports only, never loads environment values."""
import csv, hashlib, json, re, subprocess, os
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / 'docs/aws-phase-a'
out.mkdir(exist_ok=True)
files = []
for folder, dirs, names in os.walk(root):
 dirs[:] = [d for d in dirs if d not in ('node_modules', '.next', '.git', 'aws-phase-a')]
 files.extend(p for name in names if (p := Path(folder)/name).suffix in ('.ts', '.tsx', '.js', '.mjs', '.sql', '.json', '.yaml', '.yml') and 'lock' not in name)
files.sort()
patterns = {
 'table_or_bucket': r'\.from\s*\(\s*([^\)]+)',
 'rpc': r'\.rpc\s*\(\s*([^,\)]+)',
 'auth': r'\.auth\.[\w.]+',
 'storage': r'\.storage\.[\w.]+',
 'realtime': r'\.(?:channel|removeChannel)\s*\(',
 'legacy_transport': r'/rest/v1|/auth/v1|/storage/v1|PGRST\d+',
 'sql_security': r'auth\.uid|auth\.users|security\s+definer|\bgrant\b|p_actor_id',
 'provider': r'@supabase|supabase|cloudflare|\bR2\b|uploadMediaToS3',
}
rows, env, routes, hashes, media = [], [], [], [], []
for p in files:
 rel = p.relative_to(root).as_posix()
 source = p.read_text(encoding='utf-8-sig', errors='replace')
 lines = source.splitlines()
 side = 'SQL' if p.suffix == '.sql' else ('browser' if re.search(r'^[\s]*[\"\']use client[\"\']', source) else 'server' if rel.startswith('app/') or 'server-only' in source else 'shared/review-imports')
 hashes.append((rel, hashlib.sha256(p.read_bytes()).hexdigest()))
 for n, line in enumerate(lines, 1):
  for kind, pattern in patterns.items():
   for match in re.finditer(pattern, line, re.I):
    target = match.group(1).strip() if match.lastindex else match.group(0)
    replacement = 'Keycloak/session' if kind == 'auth' else 'S3/CloudFront' if kind == 'storage' else 'RDS repository/atomic function' if kind in ('table_or_bucket','rpc','legacy_transport') else 'manual review'
    rows.append((rel,n,side,kind,target,'review' if kind in ('provider','sql_security') else 'rewrite',replacement,'verify live grants; not inferred','preserve enclosing source contract; review required',line.strip()))
  for match in re.finditer(r'process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[[\"\']([A-Z][A-Z0-9_]*)',line):
   name = match.group(1) or match.group(2)
   env.append((name,rel,n,'public' if name.startswith('NEXT_PUBLIC_') else 'server','legacy-retain' if 'SUPABASE' in name or 'CLOUDFLARE' in name else 'keep/review','required/optional: inspect source condition'))
  if re.search(r'storage|bucket|prefix|buildPath|getPublicUrl|cloudfront|MEDIA_CDN|uploadMediaToS3|image_path|video_url',line,re.I):
   media.append((rel,n,side,line.strip()))
 if rel.startswith('app/api/') and p.name == 'route.ts':
  methods = re.findall(r'export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)',source)
  routes.append((rel,','.join(methods),'assertAdmin' if 'assertAdmin' in source else 'REVIEW: no direct assertAdmin marker',','.join(sorted(set(re.findall(r'\.rpc\s*\(\s*[\"\']([^\"\']+)',source)))),','.join(sorted(set(re.findall(r'\.from\s*\(\s*[\"\']([^\"\']+)',source)))),'preserve route source status/JSON/no-store behavior'))
def write(name, header, data):
 with (out/name).open('w',newline='',encoding='utf-8') as f:
  w=csv.writer(f);w.writerow(header);w.writerows(data)
write('dependencies.csv',['path','line','execution_side','operation','target_expression','disposition','replacement','privilege','contract','source'],rows)
write('environment.csv',['name','path','line','visibility','disposition','requirement_review'],sorted(set(env)))
write('api-routes.csv',['path','methods','auth_marker','rpc_names','table_bucket_names','contract'],routes)
write('source-baseline.csv',['path','sha256'],hashes)
write('media-source.csv',['path','line','execution_side','source'],media)
summary={'files_scanned':len(files),'dependency_matches':len(rows),'dependency_files':len(set(r[0] for r in rows)),'api_routes':len(routes),'environment_names':len(set(r[0] for r in env)),'rpc_names':sorted(set(r[4].strip('\"\'') for r in rows if r[3]=='rpc')),'browser_dependency_files':len(set(r[0] for r in rows if r[2]=='browser'))}
(out/'counts.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
