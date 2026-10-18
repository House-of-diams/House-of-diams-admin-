# Admin development workflow

## Prerequisites

- Node.js 22 (the current deployment runtime)
- pnpm 10.28.0 (pinned in `package.json`)
- A local `.env.local` containing the required Supabase and storage variables

Do not commit environment files or credentials.

## Install and run locally

```sh
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm-lock.yaml` is the single dependency lockfile. Use pnpm for dependency changes and commit the updated lockfile with `package.json`.

## Checks before merging

Run these without starting another development server:

```sh
pnpm lint
pnpm typecheck
```

Validation tests are standalone Node test files under `scripts/`. In PowerShell, run the complete validation suite with:

```powershell
Get-ChildItem scripts/test-*-validation.mjs | ForEach-Object { node --experimental-strip-types --test $_.FullName }
```

Run `pnpm build` only as the final deployment verification when the person coordinating the release has approved a production build.

## Database migrations

SQL migrations live in `sql/` and are ordered by their timestamp prefix. Apply pending migrations in filename order to the target database, record which files were applied, and then verify the affected admin save/read flow. Never rerun a migration blindly if its application status is unknown.

## Repository conventions

- Keep API responses generic; log detailed database errors only on the server when operational logging is available.
- Put reusable validation and data mapping in `lib/` instead of duplicating it across pages and routes.
- Prefer scoped database queries. Do not load a full catalog when a page needs one product or a small list.
- Use Next.js `Image` for stable site images. Plain `img` is acceptable for temporary local previews, blob URLs, SVG/data URLs, and admin media whose dimensions are not known in advance.
- Do not commit `.next`, TypeScript build-info files, environment files, or generated caches.

## Production verification

Before calling the admin production-ready, confirm lint, typecheck, validation tests, the approved production build, pending SQL migrations, and a focused smoke test of login, product create/edit, inventory, catalog, CMS saves, image uploads, settings, and order/customer pages.
