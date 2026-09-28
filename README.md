# VeiligStallen Next.js app

Next.js (Pages Router) + React + TypeScript. Prisma talks to MySQL.

This repo is the public map, gemeente-beheer, reports, and FMS **v4** API. The citizen portal and FMS v2/v3 still run on ColdFusion (`www.veiligstallen.nl`, `remote.veiligstallen.nl`).

## Environments

| | URL | Git branch | Host |
| --- | --- | --- | --- |
| Local | http://localhost:3000 | — | your machine |
| Acceptance | https://vstfb-eu-acc-app01.azurewebsites.net | `acceptance` | Azure App Service |
| Production | https://beta.veiligstallen.nl | `main` | Azure App Service |

## Requirements

- Node 22 (not 23) and npm 10+
- SSH access as `veiligstallen` on `veiligstallen.work` (dev database)
- Copy `.env.example` → `.env` (and optionally `.env.local.example` → `.env.local` for local overrides)

## First-time setup

```bash
npm install
```

`postinstall` runs `prisma generate`. If that fails after a pull:

```bash
npx prisma generate
npm i
```

### Environment

Minimum in `.env`:

```
DATABASE_URL=mysql://UNAME:PASSWD@127.0.0.1:5555/veiligstallen
NEXTAUTH_SECRET=          # openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_MAPBOX_TOKEN=
LOGINTOKEN_SIGNER_PRIVATE_KEY=   # openssl rand -hex 32
```

Put Mapbox (and other local-only overrides) in `.env.local` if you prefer; it overrides `.env`. Full list: `.env.example`.

FMS writes on this host need `ENABLE_WRITE_API=true` (omit on production).

## Database

Local development uses the shared MySQL on `veiligstallen.work`, not a Docker database.

```bash
npm run start-db    # SSH tunnel: local 5555 → remote 3306
npm run stop-db
```

Your SSH key must be registered for `veiligstallen@veiligstallen.work`. See `mysqldb-veiligstallen.work/README.md` for Workbench and restore.

Then:

```bash
npm run dev
```

In development, click the logged-in username to dump session info to the console.

## Prisma

`prisma/schema.prisma` is the working schema. It is **not** a full dump of the MySQL database; keep manual edits.

Do **not** run `prisma db pull --force` unless you intend to re-apply those edits afterwards (`scripts/prisma-update-schema.sh` warns about this).

Schema changes that must land on acc/prod go through Prisma migrations, applied via `/api/protected/database/migrate` (`npm run migrate-db` locally, `:acceptance` / `:production` against those hosts).

## Deploy

Acc and prod deploy automatically with GitHub Actions to Azure:

- Push to `acceptance` → [azure-webapps-node-acceptance.yml](.github/workflows/azure-webapps-node-acceptance.yml)
- Push to `main` → [azure-webapps-node-production.yml](.github/workflows/azure-webapps-node-production.yml)

Secrets and publish profiles: `github/README.md`. Azure CLI helpers: `azure/README.md`. Release notes: `RELEASES.md` (from `acceptance`, `.cursor/commands/prod-release.md`).

## FMS v4

Interactive docs on a running app:

- V4 reference: `/test/fms-api-docs-v4`
- V2 → v4 / V3 → v4: `/test/fms-api-docs-migrate-v2`, `/test/fms-api-docs-migrate-v3`

Write-path split (Next.js v4 vs ColdFusion v2/v3): `docs/analyse-api/fms-write-paths.md`.  
Wilmar test setup (acceptance, citycode `9933`): `docs/userdocs/wilmar-v4-intern-setup.md`.

## Optional: run the app in Docker locally

```bash
npx prisma generate
npm run docker-build
npm run docker-run
```

`.env` is baked in for the image; use `.env.local` only for `npm run dev`.

## Beheer extras

Data exploration (Fietsberaad superadmin + acceptatie/ontwikkeling): **Ontwikkeling** in the left menu, or `/beheer/exploreusers`.

## Change the `veiligstallen_readwrite` password (dev DB)

```bash
ssh veiligstallen@veiligstallen.work
sudo mysql
```

```sql
ALTER USER 'veiligstallen_readwrite'@'127.0.0.1' IDENTIFIED BY 'new password';
FLUSH PRIVILEGES;
```

Generate a password with `openssl rand -base64 32`, then update `DATABASE_URL` locally.
