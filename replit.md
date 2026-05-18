# Handbook Chat

A web app for a creative production team to chat with their Google Doc handbook using GPT-5. Ask questions by text or push-to-talk voice; get instant, grounded answers with handbook section citations.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/handbook-chat run dev` — run the frontend (port 24004)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (`artifacts/handbook-chat/`)
- API: Express 5 (`artifacts/api-server/`)
- DB: PostgreSQL + Drizzle ORM (`lib/db/`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from `lib/api-spec/openapi.yaml`)
- AI: OpenAI via Replit AI Integration (`@workspace/integrations-openai-ai-server`)
- Google Docs: `@replit/connectors-sdk` proxying the Google Docs REST API

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle schema (conversations, messages)
- `artifacts/api-server/src/lib/handbook.ts` — Google Doc fetcher, section parser, relevance scorer, 60s TTL cache
- `artifacts/api-server/src/routes/openai/messages.ts` — streaming SSE chat + voice endpoints
- `artifacts/api-server/src/routes/openai/conversations.ts` — conversation CRUD
- `artifacts/api-server/src/routes/handbook.ts` — handbook status + refresh
- `artifacts/handbook-chat/src/pages/home.tsx` — full chat UI (sidebar, streaming, citations, voice)

## Architecture decisions

- **Live fetch over vector store**: the handbook is fetched fresh from Google Docs API on demand with a 60s in-memory TTL cache. No vector store, no reindexing lag — edits in the doc appear in the next answer after the cache expires.
- **Heading-based section chunking**: the doc is parsed into sections by heading structure on each refresh; keyword scoring picks the top 8 most relevant sections to pass as GPT-5 context.
- **SSE streaming**: text responses stream token-by-token via Server-Sent Events; the frontend reads the stream and appends chunks in real time.
- **Voice pipeline**: push-to-talk records audio → `gpt-4o-mini-transcribe` STT → same handbook-grounded GPT-5 chat → `tts-1/alloy` TTS spoken reply, all over SSE.
- **Google Docs via connectors SDK**: `@replit/connectors-sdk` proxies requests to `docs.googleapis.com/v1/documents/{id}` with automatic OAuth2 token injection/refresh — no credentials managed manually.

## Product

- **Streaming text chat** — ask any question about the handbook; answers stream live with the relevant handbook section cited below the response.
- **Push-to-talk voice** — hold the mic button, speak your question, hear the answer spoken back.
- **Conversation history** — sidebar lists all past conversations ordered by recency; conversations can be deleted.
- **Always-fresh handbook** — 60s cache TTL plus a manual refresh button ensures answers always reflect the latest version of the Google Doc.
- **53 handbook sections** parsed from "Creative Operations Producer Handbook".

## User preferences

- Google sign-in / per-user auth is deferred to a later phase.
- Handbook doc ID: `1KF52xpcvrJBWA-LJbIZs4LGwWa-sW9IR5AeLjey4LgE`
- GPT model: `gpt-5.4` for text/voice, `gpt-4o-mini-transcribe` for STT, `tts-1/alloy` for TTS.

## Gotchas

- The Google Docs connector uses `@replit/connectors-sdk` — tokens are injected automatically; never cache the `ReplitConnectors` instance across requests (tokens expire).
- The handbook is fetched server-side; the public export URL (`/export?format=txt`) does NOT work — the doc is not publicly shared.
- Voice audio is sent as base64 JSON (up to 50 MB body limit set in `app.ts`).
- After schema changes, always run `pnpm --filter @workspace/db run push` before running the server.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
