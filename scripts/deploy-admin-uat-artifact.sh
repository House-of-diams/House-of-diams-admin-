#!/usr/bin/env bash
# Runs on EC2 as the existing deployment account; never installs or builds there.
set -euo pipefail
sha=${1:?commit required}
run=${2:?run identity required}
[[ "$sha" =~ ^[0-9a-f]{40}$ && "$run" =~ ^[0-9]+-[0-9]+$ ]] || exit 2
service=hod-admin-uat.service
base=/opt/hod-admin/releases
release="$base/$sha-$run"
archive="/tmp/admin-release-$sha-$run.tar.gz"
dropin=/etc/systemd/system/hod-admin-uat.service.d/release.conf
node=/opt/node-v24/bin/node
[[ $(id -u) = 0 && $(uname -m) = x86_64 ]] || { echo 'Requires existing root deploy account and x86_64 host'; exit 1; }
exec 9>/run/lock/hod-admin-uat-deploy.lock
flock -n 9 || { echo 'Another admin deployment is active'; exit 1; }
previous=$(systemctl show "$service" -p WorkingDirectory --value)
[[ "$previous" = "$base/"* ]] || { echo "Configured release $previous is not under $base"; exit 1; }
[[ -f "$previous/config/admin-uat-aws.env" ]] || { echo "Active release has no config/admin-uat-aws.env: $previous"; exit 1; }
[[ ! -e "$release" ]] || { echo "Release folder already exists: $release"; exit 1; }
[[ -x "$node" ]] || { echo "Missing Node runtime: $node"; exit 1; }
[[ -f "$archive" && -f "$archive.sha256" ]] || { echo "Uploaded archive is missing: $archive"; exit 1; }
[[ $("$node" -p 'process.versions.node.split(".")[0]') = 24 ]] || exit 1
cd /tmp
sha256sum --check "$(basename "$archive").sha256"
install -d -o root -g root -m 755 "$release"
tar --extract --gzip --file "$archive" --directory "$release" --no-same-owner
[[ $(cat "$release/RELEASE_COMMIT") = "$sha" && -f "$release/.next/BUILD_ID" ]] || exit 1
cp "$previous/config/admin-uat-aws.env" "$release/config/admin-uat-aws.env"
# Browser values are compiled in CI. Refuse activation if the server differs.
"$node" --input-type=module - "$release" <<'JS'
import fs from 'node:fs'; import {parseEnv} from 'node:util';
const root=process.argv[2], built=JSON.parse(fs.readFileSync(root+'/BUILD_PUBLIC_ENV.json','utf8'));
const runtime=parseEnv(fs.readFileSync(root+'/config/admin-uat-aws.env','utf8'));
for(const [key,value] of Object.entries(built)) {
 const actual=runtime[key] ?? (key==='NEXT_PUBLIC_HOD_DEPLOYMENT'?'uat':undefined);
 if(actual!==value)throw Error('Build/runtime public configuration mismatch: '+key);
}
if(!['false','true'].includes(runtime.ADMIN_VIDEO_IMMUTABILITY_VERIFIED))throw Error('ADMIN_VIDEO_IMMUTABILITY_VERIFIED must be exactly true or false');
if(runtime.ADMIN_VIDEO_IMMUTABILITY_VERIFIED==='true'&&(runtime.ADMIN_VIDEO_ADMISSION_PROVIDER!=='rds'||runtime.ADMIN_VIDEO_ROUTING_VERIFIED!=='true'||!runtime.ADMIN_VIDEO_ADMISSION_POLICY))throw Error('Video publication needs RDS admission, verified video routing and a named policy');
JS
chown -R hod-admin:hod-admin "$release"
# The private file remains on EC2. Never copy it into a release or CI artifact.
systemd-run --quiet --wait --pipe --collect --unit="hod-admin-preflight-$run" \
  --property=User=hod-admin --property=Group=hod-admin \
  --property="WorkingDirectory=$release" \
  --property=LoadCredential=runtime.env:/etc/hod-admin-uat/runtime.env \
  --setenv=NODE_ENV=production --setenv=AWS_REGION=us-east-1 \
  /bin/sh -c 'exec /opt/node-v24/bin/node --env-file=config/admin-uat-aws.env --env-file="$CREDENTIALS_DIRECTORY/runtime.env" --conditions=react-server scripts/check-admin-uat-data-config.mjs --hosted-shape'
install -d -m 755 "$(dirname "$dropin")"
backup="$release/previous-release.conf"
had_dropin=false
if [[ -f "$dropin" ]]; then cp "$dropin" "$backup"; had_dropin=true; fi
activated=false
rollback() {
  status=$?
  if [[ "$activated" = true && "$status" != 0 ]]; then
    echo 'Activation failed; restoring the previous admin release'
    if [[ "$had_dropin" = true ]]; then
      install -m 644 "$backup" "$dropin"
    else
      rm -f -- "$dropin"
    fi
    systemctl daemon-reload
    systemctl restart "$service" || echo 'ERROR: previous admin release restart failed'
  fi
  exit "$status"
}
trap rollback EXIT
printf '[Service]\nWorkingDirectory=%s\n' "$release" > "$dropin.tmp"
chmod 644 "$dropin.tmp"
mv "$dropin.tmp" "$dropin"
activated=true
systemctl daemon-reload
systemctl restart "$service"
healthy=false
for attempt in $(seq 1 12); do
  if systemctl is-active --quiet "$service" && \
    curl --fail --silent --max-time 5 http://127.0.0.1:3101/api/health | grep -q '"ok":true'; then
    healthy=true; break
  fi
  sleep 5
done
[[ "$healthy" = true ]] || {
  echo 'Admin health check failed; recent service log follows'
  systemctl status "$service" --no-pager --lines=0 || true
  journalctl -u "$service" -n 60 --no-pager || true
  exit 1
}
pid=$(systemctl show "$service" -p MainPID --value)
[[ $(readlink "/proc/$pid/cwd") = "$release" ]] || { echo "Service is running from $(readlink "/proc/$pid/cwd"), not the new release $release (another unit setting overrides the release drop-in)"; exit 1; }
curl --fail --silent --max-time 20 https://manage.houseofdiams.com/api/health | grep -q '"ok":true' || { echo 'Public health check failed: https://manage.houseofdiams.com/api/health'; exit 1; }
printf '%s\n' "$previous" > /opt/hod-admin/rollback-release.tmp
mv /opt/hod-admin/rollback-release.tmp /opt/hod-admin/rollback-release
echo "Admin UAT deployed: $sha ($run). Authenticated save/upload acceptance is still required."
rm -f -- "$archive" "$archive.sha256"
