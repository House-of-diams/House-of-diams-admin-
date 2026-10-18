# Admin UAT host setup proposal — 2026-10-19

For DevOps. This is a proposed concrete EC2/systemd/Nginx deployment, not a claim
these service names/ports were already configured or organizationally approved.
No commands in this handoff were executed against the server. Keep storefront
services/ports, existing IAM/bucket policies and video publishing unchanged.

Deploy commit `d6d1cb27b7bd293523fa3b4dd8e2cafd589bb67a` from
https://github.com/House-of-diams/House-of-diams-admin-.git.

## 1. Runtime choice and port check

- One Next.js admin application, including its API routes; no separate API project.
- Proposed service: `hod-admin-uat.service`, dedicated non-root user `hod-admin`.
- Proposed working directory: `/var/www/html/admin-hod` (the reported checkout).
- Node.js 24 (the locally tested major), pnpm 10.28.0; production build, not next dev.
- Bind only `127.0.0.1:3101`. First check `ss -ltnp` and existing PM2/systemd
  inventories. Do not stop another service to free this port. If occupied, select
  another free loopback port and update both the service and proxy consistently.
- Confirm whether an admin supervisor already exists. Retire/reconfigure only
  that admin process during the approved deployment; do not run duplicate copies
  under both PM2 and systemd or touch `hod-storefront`.

This proposal requires systemd LoadCredential support and Node --env-file support.
Confirm the installed versions; report a mismatch rather than silently changing
deployment architecture. Resolve the actual absolute Node binary path with
`command -v node`; systemd must use the intended installed runtime, not assume an
interactive NVM shell. Replace /usr/bin/node below if necessary.

## 2. Persist private inputs outside Git

Use a dedicated root-owned directory and private dotenv file. systemd's
LoadCredential copies that file into the service's credential directory; Node
loads it directly with --env-file. Do not put secrets in unit Environment=
lines, command arguments, Git, the nonsecret manifest, CI logs or chat.

Initial filesystem preparation (do not truncate an existing secret file):

```bash
sudo install -d -o root -g root -m 0700 /etc/hod-admin-uat
sudo test -e /etc/hod-admin-uat/runtime.env || sudo install -o root -g root -m 0600 /dev/null /etc/hod-admin-uat/runtime.env
sudoedit /etc/hod-admin-uat/runtime.env
```

File contents, filled through the team's agreed private transfer channel:

```dotenv
ADMIN_DATABASE_URL="postgresql://hod_admin_login_uat:URL_ENCODED_PASSWORD@database-1.cqngaqgio3hj.us-east-1.rds.amazonaws.com:5432/hod_staging"
ADMIN_DB_TLS_CA_FILE=/etc/hod-admin-uat-ca/rds-global-bundle.pem
ADMIN_DB_TLS_EXPECTED_HOST=database-1.cqngaqgio3hj.us-east-1.rds.amazonaws.com
ADMIN_OIDC_CLIENT_SECRET="EXISTING_HOD_ADMIN_CLIENT_SECRET"
UPSTASH_REDIS_REST_URL="https://EXISTING_ENDPOINT.upstash.io"
UPSTASH_REDIS_REST_TOKEN="EXISTING_REST_TOKEN"
ADMIN_SESSION_ENCRYPTION_KEY="GENERATE_ONCE_AS_DESCRIBED_BELOW"
```

These are placeholders, not working credentials. Quote/escape values according to
dotenv syntax. URL-encode only the password component of the connection URL. Do
not use master credentials, localhost:15432, an IP address, a Windows CA path,
sslmode/query parameters or a rediss:// connection string for the REST adapter.

The existing isolated DB password, Keycloak client secret and Redis REST inputs
are held in the owner's local private configuration. The owner must transfer
only the required values through a mutually agreed secure channel. This handoff
does not authorize an automatic upload or designate an unagreed channel as approved.
No existing password needs regeneration solely for deployment.

Generate the hosted session encryption key once using Node's
`crypto.randomBytes(32).toString('base64')`, or an equivalent cryptographic
generator. Write the result directly to the protected file without logging it.
It must decode to 32 bytes and re-encode to exactly the same standard base64
string, with no spaces or extra quotes inside the value. Keep the manifest's
separate hosted namespace `hod-admin:uat-hosted`. Keep the same key across restarts
and replicas; do not regenerate it on each build or copy the local session namespace.

Preserve order-email configuration separately in the same protected file:
EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM and the intended
STOREFRONT_URL. The UAT storefront is https://uat.houseofdiams.com; confirm that is
the desired email-link target. Do not put passwords in NEXT_PUBLIC variables.

## 3. Install the public RDS CA bundle

The CA is public, so it can be readable by the service while private inputs stay
root-only. Use the official AWS trust store, not an exported server leaf certificate:

```bash
sudo install -d -o root -g root -m 0755 /etc/hod-admin-uat-ca
curl --fail --silent --show-error --location \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
  -o /tmp/hod-admin-rds-global-bundle.pem
sudo install -o root -g root -m 0644 /tmp/hod-admin-rds-global-bundle.pem /etc/hod-admin-uat-ca/rds-global-bundle.pem
```

Final value: ADMIN_DB_TLS_CA_FILE=/etc/hod-admin-uat-ca/rds-global-bundle.pem.
Keep TLS certificate/hostname verification enabled. Confirm existing private
EC2-to-RDS TCP 5432 connectivity; do not expose RDS publicly or modify grants/master
roles merely to bypass a connection failure.

## 4. Build and load both configuration layers

In the exact checked-out commit, install dependencies with
`pnpm install --frozen-lockfile --prod=false`. Build and the current source-based
preflight require TypeScript from devDependencies; do not prune it before running
the service's ExecStartPre. Apply the versioned
`config/admin-uat-aws.env` to the build environment, including its public CDN setting.
For this source the CLI form is:

```bash
node --env-file=config/admin-uat-aws.env node_modules/next/dist/bin/next build --webpack
```

Do not copy the developer's .env.local into the checkout. If a build step needs
private inputs in the actual deployment workflow, use the same protected credential
loading context; never print/export values into a CI log. Required runtime shape
validation is separate from a successful compilation.

Use the same nonsecret manifest at runtime and load the private inputs last.
Ensure the service can read build files and write only its needed Next cache
directory. Do not give it ownership of private /etc inputs or root privileges.

Example unit for review; adapt the absolute Node path and port after inventory:

```ini
[Unit]
Description=House of Diams Admin UAT
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=hod-admin
Group=hod-admin
WorkingDirectory=/var/www/html/admin-hod
Environment=NODE_ENV=production
Environment=AWS_REGION=us-east-1
Environment=NEXT_TELEMETRY_DISABLED=1
LoadCredential=runtime.env:/etc/hod-admin-uat/runtime.env
ExecStartPre=/usr/bin/node --env-file=config/admin-uat-aws.env --env-file=${CREDENTIALS_DIRECTORY}/runtime.env --conditions=react-server scripts/check-admin-uat-data-config.mjs --hosted-shape
ExecStart=/usr/bin/node --env-file=config/admin-uat-aws.env --env-file=${CREDENTIALS_DIRECTORY}/runtime.env node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3101
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Install/enable/start this service only through the approved hosted deployment.
This document does not start any local service or authorize changing the storefront.
Do not log the credential file, process environment or tokens when diagnosing it.

## 5. DNS / proxy / TLS

- Public origin remains https://manage-uat.houseofdiams.com; callback remains
  https://manage-uat.houseofdiams.com/api/auth/callback.
- Keep the established UAT DNS/proxy architecture. Route the admin hostname to
  the intended UAT ingress; do not repoint storefront/Keycloak/CDN names.
- Add a dedicated Nginx site with server_name manage-uat.houseofdiams.com and
  upstream http://127.0.0.1:3101 (or the agreed free port).
- The browser-facing certificate must cover manage-uat.houseofdiams.com and have
  a trusted chain. A certificate covering only origin-uat.houseofdiams.com does
  not satisfy that browser hostname. If a CDN/proxy terminates TLS, verify both
  its viewer certificate and its origin TLS/SNI configuration; do not weaken TLS
  verification to hide the mismatch.
- Preserve Host / X-Forwarded-Host and the original HTTPS scheme through trusted
  proxies so Next.js sees the configured public origin. Sanitize forwarded
  headers at the trusted ingress rather than trusting arbitrary client values.
- Permit the app's multipart envelope (101 MiB maximum); configure Nginx and any
  outer proxy consistently. Video activation is still separately disabled.
- Do not cache private admin HTML, auth/API responses or cookies at a CDN/proxy.
  Use the application's cache directives; preserve public static asset delivery.
- Validate Nginx configuration before reloading and retain existing vhosts/certs.
  Do not expose the Next port publicly or remove the current storefront site.

## 6. Acceptance outputs to return

Return only nonsecret results: deployed commit, service name, loopback port,
preflight JSON, service health, matching certificate/hostname result, and private
RDS connectivity/readiness result. Run preflight with the same service user,
manifest, credential file and CA access as runtime; a root shell with different
variables is not equivalent.

UAT_CONFIGURATION_NOT_READY is a generic shape-check failure. The preflight
constructs configs but does not contact Keycloak/Redis/RDS; the certificate issue
on the admin URL is a separate blocker. Never bypass the preflight or hard-code
verification flags to hide missing inputs.

After shape and service connectivity checks, engineering/tester verifies login,
refresh/logout, reads/saves, images and SMTP at the public UAT URL. Hosted AWS
video protections and RDS/application activation remain separate.
Keep ADMIN_VIDEO_IMMUTABILITY_VERIFIED=false and the database media policy disabled.

## Primary references

- https://www.freedesktop.org/software/systemd/man/257/systemd.exec.html — LoadCredential and process credential-directory handling.
- https://nextjs.org/docs/app/api-reference/cli/next — production Next start and explicit host/port.
- https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL-certificate-rotation.html — official RDS CA bundle.
- https://nginx.org/en/docs/http/ngx_http_proxy_module.html — proxy header handling.
