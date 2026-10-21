# Admin authentication behind the UAT reverse proxy

The EC2 Next.js service listens on loopback port 3101. Its route Request URLs can
use that internal origin even though nginx supplies the correct public headers.
Comparing that URL directly with ADMIN_AUTH_ORIGIN rejected session and mutation
requests. Page authorization used a separately constructed canonical URL, which
explained why database reads could work while uploads and saves failed.

Authentication handlers now share assertRequestOrigin with mutation checks.
Canonical HTTPS requests remain supported. An internal loopback URL is accepted
only when Host and X-Forwarded-Host both exactly match ADMIN_AUTH_ORIGIN's host
and X-Forwarded-Proto is exactly https. Other internal addresses, public HTTP
URLs, differing hosts, and forwarded-header chains are rejected. Browser Origin,
Sec-Fetch-Site, CSRF, cookie, identity and session checks remain enforced.

## Deployment boundary

- Keep Next bound to loopback behind the trusted ingress. Do not expose its port.
- Nginx must overwrite Host, X-Forwarded-Host and X-Forwarded-Proto, rather than
  accept arbitrary incoming forwarded values. These headers are already set on
  the inspected UAT vhost; no blanket trustHostHeader setting is required.
- Deploy the corrected source, build it, and restart only the admin service.
- Preserve runtime secrets, database grants, IAM and bucket policies.
- Keep ADMIN_VIDEO_IMMUTABILITY_VERIFIED=false; this fix is not video acceptance.

## Hosted acceptance after deployment

1. Log in and check /api/auth/session in the same browser. Confirm authenticated
   is true; do not copy its CSRF token or cookies into messages/logs.
2. Open a fresh product form and verify catalog/metal choices load.
3. Upload an approved test image and create a uniquely named UAT test coupon.
   Verify persistence; use only agreed test data for cleanup.
4. Repeat session and mutation checks after access-token refresh.
5. Confirm logout denies subsequent authenticated requests.

Offline regression tests cover proxied login/callback/session/logout, authorized
mutations, and rejection of bad forwarded hosts/protocols/chains, non-loopback
origins, foreign browser origins and incorrect CSRF tokens. Hosted acceptance is
separate; a passing offline test is not proof of a deployed save/upload.
