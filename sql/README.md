# Database migrations

Files up to `202609300026_*` are the historical forward-only set already installed in UAT; do not replay them.

New changes ship as three files with the same prefix:

| File | Purpose |
| --- | --- |
| `YYYYMMDDNNNN_name.forward.sql` | Makes the change. Runs in one transaction and aborts if the database is not in the expected state. |
| `YYYYMMDDNNNN_name.verify.sql` | Read-only checks that the change is installed as expected. |
| `YYYYMMDDNNNN_name.rollback.sql` | Restores the previous definition. |

Rules:

- Migrations are applied by a person with the migration role, to UAT first, after an RDS snapshot. Application code never applies them.
- Forward files never delete or rewrite business data unless the file name says so and the change was approved.
