# KBK Payroll System — Automated Payroll Management with Scheduled Payslip Email Notifications

**Final-year academic project** — Case study: Kay-Billie-Klaer International School, Accra, Ghana.

A secure, production-style payroll system: employee management, salary/allowance/deduction configuration,
automatic payroll calculation (SSNIT, PAYE, custom deductions), PDF payslips, scheduled processing,
automated payslip email delivery, reports, and a full audit trail.

---

## 1. Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (>= 18) + Express 4 |
| Database | PostgreSQL 14+ (recommended) *or* SQLite (zero-setup demo mode) |
| ORM | Sequelize (parameterised queries — SQL-injection safe) |
| Views | EJS + Bootstrap 5 (vendored locally, no CDN dependency) |
| Auth | express-session + bcryptjs + CSRF tokens + rate limiting |
| Email | Nodemailer (SMTP — Gmail App Password) — Stage 11 |
| PDF | pdfmake — Stage 10 |
| Scheduler | node-cron — Stage 12 |
| Testing | Node built-in test runner (`node --test`) — Stage 15 |

## 2. Project structure

```
payroll-project/
├── docs/                    # analysis & design documents (00–03)
├── scripts/
│   ├── db-migrate.js        # npm run db:migrate
│   ├── db-seed.js           # npm run db:seed   (demo data)
│   └── db-reset.js          # npm run db:reset  (destroys data!)
├── src/
│   ├── server.js            # entry point
│   ├── app.js               # Express app factory
│   ├── config/              # env.js (validated env), database.js (Sequelize)
│   ├── db/
│   │   ├── runner.js        # tiny versioned migration runner
│   │   └── migrations/      # 001..010 — full schema
│   ├── models/              # Sequelize models + associations
│   ├── middleware/          # csrf, flash, rateLimit, errorHandler
│   ├── routes/              # home, health (auth routes arrive Stage 3)
│   ├── utils/               # money (decimal.js), passwords, settings, asyncHandler
│   ├── views/               # EJS templates (partials + pages)
│   └── public/              # css, vendored Bootstrap
└── storage/payslips/        # generated PDFs (gitignored, outside web root)
```

## 3. Setup (two options)

### Option A — PostgreSQL (recommended)

```bash
# 1. Create the database and user once (as postgres superuser):
#    CREATE USER payroll_app WITH PASSWORD 'change-me';
#    CREATE DATABASE payroll_db OWNER payroll_app;

# 2. Configure
cp .env.example .env            # then edit DB_* + SESSION_SECRET

# 3. Install, migrate, seed, run
npm install
npm run db:migrate
npm run db:seed
npm run dev                     # http://localhost:3000
```

### Option B — SQLite (no database install)

In `.env` set `DB_DIALECT=sqlite` (the file `./data/payroll.sqlite` is created automatically),
then run the same `npm install && npm run db:migrate && npm run db:seed && npm run dev`.

## 4. Demo accounts (seed data — CHANGE these in any real deployment)

| Role | Email | Password |
|---|---|---|
| System Administrator | admin@kbk.edu.gh | Admin@123 |
| Payroll Officer | payroll@kbk.edu.gh | Payroll@123 |
| HR Officer | hr@kbk.edu.gh | Hr@123 |
| School Management | mgmt@kbk.edu.gh | Mgmt@123 |
| Employee (self-service) | kwame.mensah@kbk.edu.gh | Emp@1234 (was Emp@123 — changed during the Stage 3 forced-password test) |

## 5. Security practices (applied from day one)

- Passwords hashed with bcrypt (10 rounds); never stored or logged in plaintext
- Role-based access control (5 roles), enforced server-side per route (Stage 4)
- CSRF tokens on every state-changing form
- Helmet security headers + strict Content Security Policy
- Rate limiting (global + strict login limiter)
- Sessions: HttpOnly, SameSite cookies, 30-minute inactivity timeout, HTTPS-only in production
- SQL injection prevented by construction (Sequelize parameterised queries)
- Secrets only in `.env` (never committed — see `.gitignore`)
- Audit logging of every sensitive action (Stage 14)

## 6. Environment variables — never hard-code secrets

See `.env.example` for the full list. Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 7. Roadmap status

- ✅ Stage 0 — Analysis & requirements (`docs/00`, `docs/01`, `docs/02`, `docs/03`)
- ✅ Stage 1 — Project setup (this skeleton)
- ✅ Stage 2 — Database setup (12 migrations, 13 tables, models, seed)
- ✅ Stage 3 — Authentication (login/logout, bcrypt, lockout, session regeneration, forced password change)
- ✅ Stage 4 — User roles & permissions (permission map, RBAC middleware, user management, role-aware dashboard & nav)
- ✅ Stage 5 — Employee management (CRUD, search/filter, masking, status changes, audit)
- ✅ Stage 6 — Salary, allowances & deductions (effective-dated salaries, catalogues, assignments, loan end-months)
- ✅ Stage 8 — Payroll calculation engine (15/15 unit tests; dry-run script `npm run payroll:preview`)
- ✅ Stage 9 — Payroll processing (transactional runs, duplicate prevention, finalise, admin override reruns)
- ✅ Stage 10 — Payslip PDF generation (7-zone PDF, self-service, permission-checked downloads, audit)
- ✅ Stage 11 — Email notifications (PENDING/SENT/FAILED/RETRYING state machine, retry backoff, resend, audit)
- ✅ Stage 12 — Scheduled payroll processing (monthly auto-payroll + 5-min email dispatcher, system actor, run-now, toggles)
- ✅ Stage 13 — Reports & settings (summary/departmental/remittance/employee reports, CSV/Excel/PDF export, configurable statutory rates)
- ✅ Stage 14 — Audit log viewer (filterable append-only trail, admin-only)
- ✅ Stage 15 — Testing & documentation (143/143 test cases; report structure in `docs/report/`)
- ✅ Stage 16 — Deployment guide (`docs/17-stage16-deployment.md` + `docs/18-vercel-deployment.md`)

**Project complete — all 16 stages delivered and tested.** Supports both a classic long-running
server (docs/17) and **Vercel serverless** (docs/18: Postgres sessions, Vercel Cron endpoints,
/tmp storage).

## 8. Troubleshooting

| Symptom | Cause & fix |
|---|---|
| `Cannot find module 'sequelize'` (or any package) | Sandbox/CI environments don't persist `node_modules` between sessions. Run `npm install` again, then `npm run dev`. |
| `FATAL: Missing required environment variable: SESSION_SECRET` | `.env` is missing or incomplete. Copy `.env.example` → `.env` and fill in values (never commit `.env`). |
| `ECONNREFUSED` to Postgres | Start the database first (`sudo pg_ctlcluster 17 main start` on Debian/Ubuntu) or switch `DB_DIALECT=sqlite`. |
| `relation "schema_migrations" does not exist` | Run `npm run db:migrate` once before starting the app. |
| Duplicate data after `db:seed` | The seed script is idempotent and refuses to double-seed; use `npm run db:reset` for a clean slate (destroys data). |
