# Admin UAT CI/CD

## Failure diagnosis

The previous deploy.yml contained duplicate root name/on/jobs mappings and a
second workflow appended inside the first. GitHub could not schedule it. Earlier
valid workflows built on EC2, where Linux killed the build under memory pressure.
Increasing EC2 memory does not correct invalid YAML.

## Pipeline

1. Push main (or manually dispatch). Serialize UAT deployments without cancelling
   an activation in progress.
2. GitHub Ubuntu 24.04 x86_64 runner uses Node 24.22.0 and pnpm 10.28.0 with the
   frozen pnpm lockfile. TypeScript and focused auth/image regressions must pass.
3. Build once on GitHub with the versioned nonsecret UAT manifest. No RDS,
   Keycloak, Redis or SMTP secrets are supplied to CI. The ordinary build uses
   real fonts; no offline font mocks are packaged.
4. Package .next, public assets, locked node_modules, runtime sources/preflight
   scripts and configuration. Dependencies include TypeScript intentionally:
   the current runtime preflight loads actual TypeScript source. A slim
   standalone artifact can be a later optimization, not a prerequisite.
5. Transfer archive and checksum over strict SSH. The Ed25519 host key in
   config/admin-uat-ssh-hostkey.pub was read through authenticated SSM, not
   accepted blindly from ssh-keyscan. A changed host key stops deployment.
6. EC2 verifies architecture, checksum, release commit and public build/runtime
   compatibility. Preserve the active nonsecret runtime manifest and existing
   /etc/hod-admin-uat/runtime.env. A transient systemd preflight uses the same
   private credential file and service user. No install/build occurs on EC2.
7. Switch only hod-admin-uat.service. Verify local health, active release process
   directory and public HTTPS health. A failed activation restores the previous
   release.conf and restarts the previous admin release. Storefront, IAM,
   database grants, DNS and bucket policies are untouched.

## Existing GitHub secrets

- ADMIN_UAT_HOST: existing EC2 SSH hostname/IP (no protocol or port).
- ADMIN_UAT_USER: existing deployment account, currently requires root operations
  for systemd and runuser. This pipeline does not grant new access.
- ADMIN_UAT_SSH_KEY: existing private SSH key. Never put it in source or output.

No additional cloud permission or secret rotation is required for this change.
EC2 requires the existing Node /opt/node-v24/bin/node, Linux x86_64/glibc, systemd
LoadCredential, curl, tar, sha256sum and flock. Keep admin on 127.0.0.1:3101.

## Acceptance and operations

Deployment health is not authenticated functional acceptance. After the first
green rollout, verify /api/auth/session in the logged-in browser, product choices,
an approved image upload, a unique UAT coupon save and token refresh/logout.
Keep video publishing false pending its separate acceptance.

Coordinate changes to this workflow with DevOps; do not paste another workflow
into this file. Preserve the one top-level name/on/jobs structure.

The artifact includes production runtime dependencies and TypeScript for the
source-based preflight; dev/test dependencies are pruned after build. Cleanup
runs before capacity checks and after success/failure. It retains the running
release and the rollback path recorded after a healthy activation (initially the
known-good 111f8c5 release). Strict managed names and real-path checks exclude
unrelated files and symlinked release directories. Releases still used by another
process are protected rather than deleted. Failed uploads and inactive failed
release directories are removed. A missing/invalid rollback path aborts cleanup.
Disk bytes and inode capacity are checked before transfer.
Manual rollback restores the last known-good release.conf and restarts only
hod-admin-uat.service. Never delete an active release to make disk space.
