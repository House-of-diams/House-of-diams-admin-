# Switching video uploads on (UAT)

Video uploads are blocked by `ADMIN_VIDEO_IMMUTABILITY_VERIFIED=false`. Setting it to `true` is only safe when all four protections below are in place. Checked on 2026-10-22:

| # | Protection | Status |
| --- | --- | --- |
| 1 | S3 bucket policy: video writes need `If-None-Match: *` (create only), and deletes are denied, on `house-of-diams` (products, hiphop, bespoke, about/hero video) and `house-of-diams-hod` (about/hero video) | **Applied.** Tested: an unconditional upload and a delete are both refused with AccessDenied. Bucket versioning is on. |
| 2 | The admin server's AWS role may write the video prefixes | **OK.** `instanceRole` has broad S3 access; the bucket policy's denies still apply to it. |
| 3 | Database video registry: `admin_media.policy.enabled = true` for `hod-uat-video-v1` | **Not confirmed.** Run the read-only check below. |
| 4 | Server config: `ADMIN_VIDEO_IMMUTABILITY_VERIFIED=true`, and the deploy script allows it | **Prepared in this change.** |

## Steps

1. Take an RDS snapshot.
2. Read-only check (as any admin database user):

   ```sql
   select policy, enabled, review_reference, jsonb_array_length(sources) as sources
   from admin_media.policy;
   select status, count(*) from admin_media.admissions group by status;
   ```

   `enabled` must be `false` before step 3 and the row must exist (`hod-uat-video-v1`, 5 sources). If the table does not exist, `ADMIN-RDS-14-media-forward.sql` has not been installed: stop and ask.
3. Enable the registry, as `hod_migration`:

   ```sql
   update admin_media.policy set enabled = true where singleton;
   ```

4. Merge and deploy this change (it sets the flag to `true` and lets the deploy script accept it).
5. Test on UAT with a short MP4: upload a video in Product Videos, save, and open the product. A second upload of the same file gets a new name, and nothing existing is replaced.

## If something goes wrong

- Set `ADMIN_VIDEO_IMMUTABILITY_VERIFIED=false` again and redeploy: uploads stop at once, existing videos keep playing.
- Or run `update admin_media.policy set enabled = false where singleton;`.
- Uploaded video objects are never deleted by the app (the bucket policy forbids it).

## Limits to know

- At most 2 videos upload at the same time per server (`ADMIN_VIDEO_MAX_CONCURRENT_UPLOADS`, up to 4); others are asked to retry in a minute.
- Videos are limited to 100 MB (MP4, MOV or WebM). The server holds the file in memory while it checks it, so use the smaller files where possible.
- Videos uploaded before the switch-on are not in the admission registry. They keep playing on existing products, but the admin will not let you newly select them until they are reconciled (`historical-current-object` entries).
