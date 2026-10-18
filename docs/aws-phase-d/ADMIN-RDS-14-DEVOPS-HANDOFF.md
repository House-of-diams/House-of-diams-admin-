# S3 media — concrete DevOps review handoff

2026-10-17. **Review artifacts only. No cloud policy has been changed.** The SQL registry can be installed separately with its policy disabled. Keep all media activation flags false until enforcement and actual object/CDN tests pass.

**2026-10-18 diagnosis update — hold policy changes.** [Actual controlled upload tests](ADMIN-RDS-14-s3-upload-live-result.md) passed for all five video source tuples using the local backend SDK identity hod-local-dev-ssm. Put/HEAD/GET/list and CDN Range passed; duplicate conditional Put returned expected 412; all five new fixtures were removed. No upload 403/AccessDenied was reproduced. The app's migrated publication remains disabled. Identify the hosted backend principal and review existing writers before considering the policy candidates below. Their earlier copy-paste proposal is superseded by this diagnostic result; no permission broadening is requested to fix an observed local upload failure.

## Observed AWS configuration

Current CLI user: hod-local-dev-ssm, account 083268668910. Both bucket policies currently contain a CloudFront service-principal read statement and no conditional-create or canonical-key deletion deny. Both buckets use default AES256 encryption, block SSE-C, and report no lifecycle or replication configuration. Product bucket versioning is Enabled; content bucket's response has no enabled versioning status.

CloudFront configuration matches the expected routing:

| Alias | Distribution | Default origin | Path | Methods |
|---|---|---|---|---|
| media.houseofdiams.com | E26EL71KHX6GRQ | house-of-diams.s3.us-east-1.amazonaws.com | empty | GET, HEAD |
| content.houseofdiams.com | EBSE81L76VM0C | house-of-diams-hod.s3.us-east-1.amazonaws.com | empty | GET, HEAD |

Both distributions are enabled, use origin access control and redirect viewers to HTTPS. This is configuration evidence, not a bytes/MIME/Range test. Evidence: `ADMIN-RDS-14-aws-config-audit.json`. The refreshed CLI login worked; the older login-failure record is historical.

## Review the exact video-prefix scope

- house-of-diams: products/videos/, hiphop/videos/, bespoke/videos/, historical about/hero/video/.
- house-of-diams-hod: new about/hero/video/.

New uploads use UUID filenames and single PutObject calls, at most 100 MiB. Images and all other prefixes are outside these review files. Keep historical references and the existing CloudFront read statements intact.

## Files and required handling

1. `ADMIN-RDS-14-house-of-diams-policy-APPEND-REVIEW.json`
2. `ADMIN-RDS-14-house-of-diams-hod-policy-APPEND-REVIEW.json`
3. `ADMIN-RDS-14-runtime-IAM-REVIEW.json`

The first two files contain **statements to merge into each current bucket policy, not complete replacement policies**. They deny writes without If-None-Match: *, deny alternative write conditions, and deny deletion or replication replacement in the listed video prefixes. They must cover every writer, not just the admin role. Confirm that existing uploaders, copy tools, multipart pipelines and replication jobs can tolerate this restriction before applying it. The proposed strict missing-header deny also blocks multipart APIs without that header; the current admin uses single PutObject. If another required writer needs multipart/copy or mutable video keys, resolve its routing/contract with engineering before applying these statements.

The IAM file is an identity-policy review candidate for the **actual admin runtime identity**. It allows prefix-exact listing, GetObject for current-object HEAD/checksum inspection, and conditional PutObject. No DeleteObject, ACL, tag, bucket configuration or version-read permission is requested. Existing broader policies are not removed by attaching it; review those separately. Please return the runtime role/user ARN, not access keys or passwords. Current AES256 defaults require no inferred KMS key grant.

AWS IAM Access Analyzer accepted the identity-policy validation request with two `WILDCARD_WITHOUT_LIKE_OPERATOR` warnings and no reported errors. The `StringEquals` value `*` for `s3:if-none-match` intentionally requires the literal conditional-create header value; changing it to a wildcard match would weaken that requirement. This lint result is not an authorization simulation or an installed-policy test. See `ADMIN-RDS-14-runtime-IAM-validation.json`.

Conditional-write enforcement follows [AWS S3 bucket policy guidance](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html). Its header requirement can affect multipart/copy clients. Versioning alone does not make an unversioned CDN URL immutable: the app validates the current object, as described in [AWS conditional-write behavior](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html). Preserve the no-expiration/no-replacement behavior for admitted video keys and review future policy/lifecycle changes as part of release control.

After approved cloud changes, engineering must re-read configuration, test fresh conditional uploads/current-object checksums, verify denied replacement/deletion using the appropriate test identity, test CDN bytes/MIME/Range and scoped listing, then reconcile historical references. No one should enable the DB policy or verification flags merely because these JSON files exist. A successful local CLI check is not proof of the deployed application's role.

## Copy-paste message

> The admin's RDS product duplication has passed. We are now completing S3 media. The bucket/CDN names you supplied are already recorded, and both CloudFront distributions point to the expected bucket roots. Please review the three attached ADMIN-RDS-14 policy JSON files. Merge the two bucket-policy statement sets into the existing policies while preserving CloudFront access, after checking other writers in the listed video prefixes. Review the scoped IAM policy for the actual deployed admin identity and send its role/user ARN. These video prefixes need create-only writes and protection against deletion/replacement. Please confirm no conflicting multipart/copy/replication or lifecycle workflow affects them. No SQL changes or secret credentials are requested from you. We will keep media activation disabled until engineering verifies real upload/library/CDN behavior.
