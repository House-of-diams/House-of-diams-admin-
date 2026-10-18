# Keycloak/RDS configuration selected for hosted UAT

2026-10-18. The human confirmed that login will be tested only at **https://manage-uat.houseofdiams.com** after deployment. No localhost callback was added. This is the UAT target, not production cutover acceptance.

## What changed

The ignored active local configuration now explicitly selects Keycloak, RDS for products/catalog/CMS/operations, and AWS image/video routing. The earlier Supabase/default checkpoint is superseded. Normal provider dispatch now chooses those migrated implementations when the application runs with this configuration. This is a configuration selection, not proof of a completed browser login or a change to an already hosted application.

Before saving, the utility validated the coherent provider combination, reviewed auth-policy inputs, encrypted session configuration, image/video source mappings and verified RDS TLS configuration shape. Actual READ ONLY checks confirmed the enrolled identity mapping, all four representative data reads and the media singleton policy still disabled. No SQL installation or business-row write occurred. The first attempt correctly stopped because its identity check requested row locks in READ ONLY mode; it was corrected to use the application's actual read-only identity lookup repository and then passed. No role/grant change was made for that correction.

Evidence: `ADMIN-UAT-data-selection-result.json`. A private ignored backup of the previous local profile was saved. No secrets were logged, server/listener started, cloud permission changed, commit/push or deployment performed.

## What remains deliberately disabled

Video admission is selected as RDS, but ADMIN_VIDEO_IMMUTABILITY_VERIFIED remains false and SQL14's database policy remains disabled. Video upload/selection or changes requiring new video admission will be unavailable until that separate acceptance. Existing unchanged video references are handled by the existing compatibility logic; broader library/duplication/save acceptance remains pending. AWS image uploads are selected and their transport/routing probes passed; complete UI/save acceptance is still separate. There is no fallback to Supabase for a failed migrated request.

The client-scopes Evaluate preview establishes the expected issuer/audience/role configuration. It does not prove signed browser login, refresh, idle/max expiry, logout, account self-service or MFA behavior. Those will be tested at the agreed UAT hostname after deployment, keeping validation strict.

## Important: GitHub does not carry ignored local configuration

`config/admin-uat-aws.env` is the **versionable nonsecret hosted configuration manifest**. It is not automatically loaded by Next.js. The deployment must apply its settings to the hosted environment; NEXT_PUBLIC_MEDIA_CDN_BASE_URL must also be supplied during the frontend build. Pushing source code alone does not update hosting variables. Neither the local profile nor its backup should be committed.

Inject these private/deployment-specific inputs separately:

- ADMIN_DATABASE_URL: isolated hod_admin_login_uat connection to hod_staging over the hosted private RDS network. **Do not copy localhost:15432 from the development tunnel.**
- ADMIN_DB_TLS_CA_FILE: the mounted CA bundle path in the deployed runtime; ADMIN_DB_TLS_EXPECTED_HOST: the verified RDS certificate hostname.
- ADMIN_OIDC_CLIENT_SECRET: the saved confidential-client secret through the hosting secret store.
- UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN: the existing session-store inputs.
- ADMIN_SESSION_ENCRYPTION_KEY: canonical base64 of a 32-byte key, shared consistently across replicas and held privately. The manifest uses a separate hosted session namespace.
- The actual hosted AWS identity and its reviewed scoped permissions; local hod-local-dev-ssm proof does not establish the hosted role's access. Do not place access credentials in browser variables.
- Preserve the existing order-email settings through the hosting secret store: EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS and EMAIL_FROM. Set the intended storefront URL with STOREFRONT_URL (or the existing supported URL variable); otherwise email links default to localhost. SMTP delivery is a hosted acceptance check, separate from the RDS order update.

With deployed runtime settings and CA mount available, the configuration-only preflight is:

```powershell
node --conditions=react-server scripts/check-admin-uat-data-config.mjs --hosted-shape
```

It rejects a Supabase/default provider selection or a localhost database target. It does not connect to services or start the app. Real service preflight and hosted UAT still follow. Local configuration shape can be checked with `--local-shape`, which permits the existing SSM tunnel.

The callback remains **https://manage-uat.houseofdiams.com/api/auth/callback**. DNS/HTTPS, matching Keycloak redirect acceptance, runtime networking/secrets and the hosted identity must be in place. The hosting platform/pipeline has not been selected or changed by this task. The final runtime configuration must be checked again there; this document is not an instruction to deploy now.

## Validation

Read-only RDS preselection passed. Configuration shape and scoped lint results are recorded alongside the active-profile build. The previous full suite passed 651 existing plus four new lazy-client tests; the subsequent badge added six focused passing tests. Those are bounded offline evidence, not hosted acceptance. The selected-profile guarded build is recorded separately in `ADMIN-UAT-selected-build-result.json` when complete.

The selected-profile configuration preflight passed, and deliberately injected legacy product/image selections were rejected. Hosted mode resolves production environment precedence and rejects a development tunnel target. Scoped lint passed for the preflight and build wrapper. The first selected-profile build compiled but its TypeScript process exhausted the wrapper's 1024 MiB heap limit. The retry uses 1536 MiB, retaining the same compiler, type checking and network/listener guard; no application validation is bypassed.

The selected-profile retry completed successfully with exit 0: compilation, TypeScript validation, all 124 generated pages, optimization and trace collection passed. Evidence: `ADMIN-UAT-selected-build-result.json` and `ADMIN-UAT-selected-build.log`. No server was started and no hosted request/login was exercised by this build.

Supabase retirement, final data/media reconciliation, committed feature/concurrency checks, reservation lifecycle and rollback acceptance remain release gates. No Supabase project/data or rollback dependency was removed.
