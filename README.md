# multi-tenant-ai-starter

A multi-tenant SaaS starter built with Next.js, Supabase and Stripe, with a Claude-powered agent that respects tenant boundaries.

## Project structure

```
apps/
  web/            Next.js application
packages/
  config/         Shared TypeScript and ESLint configuration
```

Planned additions: `packages/db`, `packages/billing`, `packages/ai`, `apps/e2e` and `supabase/`.

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

## Scripts

| Command             | Description                        |
| ------------------- | ---------------------------------- |
| `yarn dev`          | Start the development server       |
| `yarn build`        | Build all workspaces               |
| `yarn lint`         | Lint all workspaces, warnings fail |
| `yarn typecheck`    | Type-check all workspaces          |
| `yarn test`         | Run tests                          |
| `yarn format`       | Format the codebase with Prettier  |
| `yarn format:check` | Check formatting                   |
| `yarn docker:up`    | Build and run the app in Docker    |

## Continuous integration

- **Lint, typecheck and test**: formatting, ESLint, TypeScript, tests and a production build
- **Docker image**: builds the production image
- **Dependency audit**: fails on known high or critical vulnerabilities
