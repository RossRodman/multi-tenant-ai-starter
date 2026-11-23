# multi-tenant-ai-starter

A multi-tenant SaaS starter built with Next.js, Supabase and Stripe, with a Claude-powered agent that respects tenant boundaries.

## Project structure

```
apps/
  web/            Next.js application (UI in src/app, backend code in src/server)
packages/
  config/         Shared TypeScript and ESLint configuration
  db/             Typed Supabase client factories and generated database types
supabase/         Local stack configuration and SQL migrations
```

Planned additions: `packages/billing`, `packages/ai` and `apps/e2e`.

## Getting started

### Prerequisites

- Node.js 24 (see `.nvmrc`)
- Corepack, bundled with Node.js, to provide Yarn 4
- Docker, for the container image and the local Supabase stack

### Setup

```bash
nvm use
corepack enable
yarn install
cp .env.example .env
yarn dev
```

### Run with Docker

```bash
yarn docker:up
```

The container reads `.env`, where `127.0.0.1` points at the container itself. To use the local Supabase stack from Docker, set `NEXT_PUBLIC_SUPABASE_URL` to a host address the container can reach, such as `http://host.docker.internal:54321` on Docker Desktop.

## Database

The schema lives in SQL migrations under `supabase/migrations`. Development, tests and CI run against a local Supabase stack in Docker; no hosted project is needed.

```bash
yarn db:start
yarn db:env
```

Run `cp .env.example .env`, then replace the Supabase lines in `.env` with the output of `yarn db:env`. The database tests read the same values. Do not redirect the output over an existing `.env`.

The local stack uses public default credentials and listens on all network interfaces, so keep the OS firewall on when working on untrusted networks.

| Command         | Description                                                               |
| --------------- | ------------------------------------------------------------------------- |
| `yarn db:start` | Start the local stack and apply migrations                                |
| `yarn db:stop`  | Stop the local stack                                                      |
| `yarn db:reset` | Recreate the local database from the migrations                           |
| `yarn db:env`   | Print the local Supabase values (URL, keys, database URL) as `.env` lines |
| `yarn db:types` | Regenerate `packages/db/src/database.types.ts` from the local schema      |
| `yarn db:push`  | Apply migrations to the linked hosted project (`--remote`)                |

Run `yarn db:types` after every migration and commit the result. CI fails when the committed types differ from the generated ones.

Local auth emails are caught by Mailpit at http://127.0.0.1:54324. The web app and the tests read `MAILPIT_URL` and the Supabase values from `.env`.

### Hosted Supabase

1. Create a project in the Supabase dashboard.
2. Log in and link it: `yarn supabase login`, then `yarn supabase link --project-ref <ref>`.
3. Apply the migrations: `yarn db:push`.
4. Put the project URL and publishable key (Project Settings > API) in `.env`. The secret key goes in `SUPABASE_SECRET_KEY` and must never get a `NEXT_PUBLIC_` prefix.

The `Push migrations` workflow does the same from GitHub Actions and runs on manual dispatch only. Create a GitHub environment named `hosted` with the secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_ID`; the workflow fails with a list of any that are missing.

Set Deployment branches of the `hosted` environment to `main` and `dev`. That is the actual control: `workflow_dispatch` runs the workflow file from the chosen branch, so the branch check in the workflow can be edited away on any branch, while an environment branch rule withholds the secrets. The workflow also refuses any other branch. Local `yarn db:push` pushes the migrations of the current checkout, so run it only from an up-to-date `main` or `dev`.

## Scripts

| Command             | Description                        |
| ------------------- | ---------------------------------- |
| `yarn dev`          | Start the development server       |
| `yarn build`        | Build all workspaces               |
| `yarn lint`         | Lint all workspaces, warnings fail |
| `yarn typecheck`    | Type-check all workspaces          |
| `yarn test`         | Run tests (needs the local stack)  |
| `yarn format`       | Format the codebase with Prettier  |
| `yarn format:check` | Check formatting                   |
| `yarn docker:up`    | Build and run the app in Docker    |

## Continuous integration

- **Lint, typecheck and build**: formatting, ESLint, TypeScript and a production build
- **Database**: starts the local Supabase stack, lints the schema, checks the generated types are current and runs the tests
- **Docker image**: builds the production image
- **Dependency audit**: fails on known high or critical vulnerabilities
