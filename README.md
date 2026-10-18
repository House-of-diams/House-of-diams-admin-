# House of Diams Admin — UAT source snapshot

Complete Next.js admin application, including its built-in server-side API routes.
This upload copy starts new Git history. The original working checkout and its
private settings remain separately in the original admin folder.

## Deployment

Use Node.js 22 or 24 and pnpm 10.28.0. Install with `pnpm install --frozen-lockfile`.
Apply `config/admin-uat-aws.env` to hosting and inject private inputs as described
in `docs/aws-phase-d/ADMIN-UAT-CONFIGURATION.md`; Next.js does not automatically
load the manifest. Supply NEXT_PUBLIC_MEDIA_CDN_BASE_URL at build time too.
Run `pnpm build`, then the hosting platform runs `pnpm start` after deployment
approval. These instructions do not start a local server.

The fixed UAT origin is https://manage-uat.houseofdiams.com and callback is
https://manage-uat.houseofdiams.com/api/auth/callback. Use the isolated admin
RDS login, never the database master account. Do not copy the development tunnel
URL or a Windows CA-file path into hosting. Keep order-email SMTP settings and
the intended storefront URL configured privately as well.

Keycloak controls admin sign-in. AWS IAM separately controls S3 access. RDS is
selected for products, catalog, CMS and operations. Video publication remains
disabled pending separate AWS protection review and database/application
acceptance; do not toggle it just because the source has been uploaded.

## Checks and release limits

The selected-profile guarded build passed compilation, TypeScript and all 124
generated pages in the original checkout before packaging. The snapshot's
offline test result is recorded in RELEASE-REVIEW.md after verification.
`pnpm typecheck` checks application source. `pnpm test` runs offline tests;
on memory-constrained Windows machines, use
`node scripts/check-admin-offline-suites-serial.mjs` for the same inventory.
No server or external service is required for these offline tests.

Selected SQL/schema snapshots under docs are regression fixtures, not a
deployment migration runner. SQL08–14 were installed in the existing UAT
database: do not automatically replay them. Historical live diagnostic files,
private credentials, dependencies and build output are excluded from this
public upload. Operational audit tools may need fresh private audit inputs
that are intentionally not published.

This is UAT preparation. Hosted login/refresh/logout, SMTP, feature saves,
storefront visibility, concurrency, media reconciliation and rollback acceptance
remain required before production cutover or Supabase retirement.
