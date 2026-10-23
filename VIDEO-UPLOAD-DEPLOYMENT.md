# Video upload deployment handoff — 2026-10-19

## Corrected behavior

`uploadProductVideoToR2()` sends `IfNoneMatch: '*'` on its PutObjectCommand and
uses a new UUID object key. It first checks the actual video provider reader and
rejects execution unless the selection is `legacy`. A conditional failure
propagates without an unconditional retry or returned success URL.

In this source, the legacy helper explicitly connects to Cloudflare R2 at
`https://<account>.r2.cloudflarestorage.com` using the private R2 configuration.
An S3-compatible SDK command alone does not mean its destination is AWS S3.
The image signing helper is unchanged.

All AWS video writers were traced:

| Writer | Key and condition |
|---|---|
| `lib/video-storage.ts` | Fresh validated UUID, `IfNoneMatch: '*'`, checksum/size/type HEAD verification |
| `lib/video-admission.ts` | Fresh UUID reserved against an operation; conditional Put and verified HEAD before admission; replay verifies the recorded object rather than overwriting |
| `lib/s3-media.ts` | Conditional Put; its legacy product/about video callers create UUID keys |

Products/about routes dispatch selected AWS video handling first. AWS-mode errors
do not fall through to legacy R2 or unconditional uploads. Published objects are
not replaced by a copy/delete workaround. Tests cover rejection without retry,
provider boundaries, command fields, fresh keys and existing image/video routes.

## Configuration

The reviewed working configuration and versioned `config/admin-uat-aws.env` both
select `ADMIN_VIDEO_PROVIDER=aws`, `ADMIN_VIDEO_ADMISSION_PROVIDER=rds` and
`ADMIN_VIDEO_IMMUTABILITY_VERIFIED=false`. The remaining data providers select RDS;
authentication selects Keycloak. The manifest is not automatically loaded by
Next.js: DevOps must apply it and inject the documented private inputs.

This confirms local settings and intended hosting settings, not the currently
running server process. DevOps must deploy this commit, restart through the normal
approved deployment process, and confirm the actual runtime selection. Do not
infer the active provider merely from the presence of `lib/r2.ts`.

Video publication stays disabled pending hosted-role AWS protection tests and
RDS/application activation acceptance. Do not toggle the flag or database policy
as part of deploying this source. No S3 bucket policy or IAM changes were made.

## Validation

Fresh offline video/R2/image focused checks: 129 passed, zero failed/cancelled/skipped.
Source TypeScript and scoped lint also passed with exit 0. Results
are reported with the final commit hash in the central handoff. No application
server, cloud upload, bucket/IAM modification or hosted test was run for these
checks. The earlier 661-test full suite and full build remain historical evidence;
they do not imply a fresh full build of this follow-up.

Commands:

```text
node --import ./scripts/offline-network-guard.mjs --conditions=react-server --test scripts/test-admin-r2-conditional-upload.mjs scripts/test-admin-videos.mjs scripts/test-admin-images.mjs
node node_modules/typescript/bin/tsc -p tsconfig.source.json --pretty false
node node_modules/eslint/bin/eslint.js lib/r2.ts lib/video-storage.ts lib/video-admission.ts lib/video-provider.ts lib/s3-media.ts scripts/test-admin-r2-conditional-upload.mjs
```

This repository's first commit contains the full reviewed admin UAT snapshot,
including the video correction. Private ENV, generated diagnostics and the old
checkout's history are not included. Uploading source is not production cutover
The hosted application is unchanged until deployed.
