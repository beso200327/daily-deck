# Local recovery status — 2026-11-17

Rebuilt from GitHub branch feat/supabase-foundation, commit 04b2efd1d2987b3b8416ed03ac0d0ac068dcd751. This is a new reconstruction, not a verified reproduction of unavailable commit 8389d74.

Implemented durable account-scoped conflict review, rejected-write replay blocking, PT409 compatibility, storage-failure journal preservation, pending-import recovery visibility in local mode, and protection of conflict photo references.

Validated with Node 24: 182 unit tests passed; production build passed; 7 iPhone-sized Chromium Done/exit/Undo browser cases passed. These browser cases exercise local mode and do not establish cloud recovery correctness or real Safari behavior.

Remaining gate: run the Docker-backed cloud browser/SQL suite (Docker is unavailable here), including lost import response, interrupted photo upload, conflict review/reload, and cleanup. Updated integration expectations have not been executed.

The migration is retained for source history only: the owner already applied it to hosted Supabase. Do not rerun it automatically. Hosted services and main were not modified. No push or deployment performed; this directory is a source copy, not a Git checkout.

## Follow-up validation

54/54 cloud and startup browser cases now pass across desktop and iPhone-sized Chromium against a newly initialized disposable Postgres.app PostgreSQL 18.6 cluster, accessed only through a private Unix socket (TCP disabled). An ephemeral adapter translated the existing fixture's Docker launch/exec/stop calls to local binaries; no hosted credentials or services were used. This verifies browser plus SQL behavior, not a real PostgREST transport or Safari.

Current cloud.sql authorization checks passed. Broader legacy SQL checks stop at RESTRICT-delete SQLSTATE expectations under PG18 (isolation.sql:89 and cloud-regressions.sql:24); deletion is blocked, but the expected state differs. Do not claim the complete SQL suite passes. The Docker-pinned PostgREST regression script was preserved but not executed locally.

Portable patch: ../recovered-sync/rebuilt-web-fix.patch, relative to the original baseline commit. No commit or push has been made.
