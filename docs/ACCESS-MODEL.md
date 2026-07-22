# Access Model (backend) — read before touching internal-users auth

> **Product rule (deliberate, do not "fix" it away):**
> **There is NO admin-only functionality.** The backend accepts whatever
> functionality ids the frontend sends and gates internal routes by
> *functionality*, not by role. An admin can grant literally anything — including
> the `internal-users` console — to a non-admin.

Full write-up (flow, FE side, rationale) lives in the internal-fe repo at
`docs/ACCESS-MODEL.md`. This file is the backend-specific summary.

## What this means in code

- **No functionality whitelist.** `ALLOWED_FUNCTIONALITIES`, the Joi
  `.valid(...)` on the grant field, and `isAllowedFunctionality` were **removed**
  on purpose. `middlewares/admin-internal-users.validation.ts` validates the
  grant list as "array of unique non-empty strings" — nothing more. Do **not**
  reintroduce a catalog check. The FE (`src/services/functionalities.ts`) owns
  the catalog.

- **Functionality gating, not role gating.** `/admin/internal-users/*` is guarded
  by `requireFunctionality("internal-users")` (after
  `authenticateWithSession({ platforms: [INTERNAL] })`), **not** by
  `authenticateWithSession({ roles: [ADMIN] })`. Admins pass because
  `requireFunctionality` bypasses for `role === ADMIN`. Do **not** revert these
  routes to a `roles: [ADMIN]` guard.

## Self-service access requests

- Table: `access_requests`
  (`services/persistence-service/user/schemas/access-request.schema.ts`),
  registered in `services/persistence-service/database.ts` `addModels([...])`.
  Created by `sequelize.sync({ force:false, alter:false })` on boot when
  `DB_SYNC=true` — this repo has **no migration framework**, so a new registered
  model IS the migration.
- Endpoints (all under `/admin/internal-users`):
  - `GET /admins` — any internal user; list active admins for the picker.
  - `POST /access-requests` — any internal user; create a request.
  - `GET /access-requests/mine` — any internal user; own requests.
  - `GET /access-requests` — requires `internal-users`; approver inbox (PENDING).
  - `POST /access-requests/:id/approve` — requires `internal-users`; **merges**
    requested ids into the requester's `user_roles.restrictions.functionalities`.
  - `POST /access-requests/:id/reject` — requires `internal-users`.

## Deploy note

The `access_requests` table must exist before these routes work. Two options:

- **Preferred:** run the idempotent DDL below once against the DB (no app
  restart, no `DB_SYNC` toggle).
- Or set `DB_SYNC=true` on the next boot so `sequelize.sync` creates it, then
  turn it back off.

```sql
CREATE TABLE IF NOT EXISTS access_requests (
  id                 SERIAL PRIMARY KEY,
  "requesterUserId"  INTEGER NOT NULL REFERENCES users(id),
  functionalities    JSONB   NOT NULL DEFAULT '[]'::jsonb,
  "adminIds"         JSONB   NOT NULL DEFAULT '[]'::jsonb,
  note               TEXT,
  status             VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" INTEGER,
  "reviewedAt"       TIMESTAMP WITH TIME ZONE,
  "reviewNote"       TEXT,
  "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_access_requests_status    ON access_requests (status);
CREATE INDEX IF NOT EXISTS idx_access_requests_requester ON access_requests ("requesterUserId");
```

Column names are quoted to preserve the camelCase the ORM expects — do not
lowercase them.
