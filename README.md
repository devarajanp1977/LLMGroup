# Atrium

Atrium is a self-hosted, single-user, multi-bot chat workspace built from the PRD in `atrium-prd.md`.

It gives one operator:

- reusable personas with named system prompts and pinned models
- rooms with up to 5 bots each
- `@mention` routing and per-bot auto-respond toggles
- streaming multi-bot chat with shared room context
- searchable conversation history
- GitHub-hosted models via PAT as the intended inference backend, with a local demo fallback

## Stack

- Next.js 16 App Router
- React 19
- Tailwind 4
- Drizzle schema for PostgreSQL 16
- Signed-cookie single-user auth
- Docker Compose deployment

## Current behavior

Atrium runs in two modes:

1. **Postgres mode** when `DATABASE_URL` is configured
2. **File-backed mode** when no database is configured

File-backed mode exists so the product remains runnable immediately in this repository. The data model and bootstrap path still target the PRD's Postgres architecture, and the app will auto-create its tables plus seed records when `DATABASE_URL` is present.

Inference also has two modes:

1. **GitHub Models mode** when `GITHUB_PAT` is configured
2. **Demo mode** otherwise

Demo mode keeps the full product workflow testable without external credentials.

## Environment

Copy the example file:

```bash
cp .env.example .env.local
```

Important variables:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/atrium
AUTH_SECRET=change-me
ATRIUM_USERNAME=atrium
ATRIUM_PASSWORD=atrium
APP_URL=http://localhost:3000
GITHUB_PAT=
GITHUB_COPILOT_MODELS_URL=https://models.github.ai/catalog/models
GITHUB_COPILOT_CHAT_URL=https://models.github.ai/inference/chat/completions
```

`GITHUB_PAT` must have access to GitHub Models. The `GITHUB_COPILOT_*` variable names are kept for backwards compatibility, but the defaults now target the GitHub Models APIs.

## Local development

Install dependencies:

```bash
npm install
```

Bootstrap storage:

```bash
npm run db:bootstrap
```

Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

Default credentials:

- username: `atrium`
- password: `atrium`

Change them with `ATRIUM_USERNAME` and `ATRIUM_PASSWORD`.

## Docker Compose

Bring up the full stack:

```bash
docker compose up --build
```

This starts:

- `db`: PostgreSQL 16
- `web`: Next.js app on port `3000`

## Database notes

- `src/lib/db/schema.ts` mirrors the PRD tables
- `src/lib/store.ts` bootstraps tables automatically in Postgres mode
- `npm run db:bootstrap` initializes storage and seeds the default user, personas, room, and starter messages

## Product coverage

Implemented from the PRD:

- single-user login
- persona library CRUD
- multi-room management
- room persona composition with per-bot auto-respond
- mention-only and all-enabled routing
- parallel bot streaming UX
- monthly premium-request counter
- room search
- provider abstraction for GitHub Models with fallback model catalogue

## Known limitations

- GitHub Models integration uses direct HTTP calls and falls back to demo responses if credentials or responses fail
- the UI simulates chunked streaming from the returned model text rather than forwarding native token streaming from the provider
- there is no nginx config in this repo yet; Compose is included for local and server-side container deployment
