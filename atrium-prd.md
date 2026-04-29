# Atrium — Product Requirements Document

**Version:** 0.1 (personal-use scope)
**Owner:** Dev
**Date:** April 2026
**Status:** Draft — working spec, expected to evolve

---

## 1. What this is

Atrium is a self-hosted, single-user web app that lets one human (me) hold a single conversation with multiple frontier LLMs at the same time. Bots are configured as named personas — Strategist, Analyst, Critic, Researcher — each pinned to a model and a system prompt, and dropped into rooms. The product runs on my testserver (172.40.0.29) and uses my GitHub Copilot subscription as the sole inference backend. No per-token API billing.

Mental model: Slack DMs, but the participants on the other side are bots I author and recombine.

---

## 2. Why build this

Poe and ChatGPT-group both ship multi-bot chat now. Three gaps justify a personal build:

1. **System-prompt control.** I want personas as first-class, versioned, editable objects — not opaque bot cards.
2. **Routing logic I configure.** Mention-only is the floor. I want all-respond, mute-by-default, and (later) draft → critique → reconcile chains.
3. **My data, my disk.** Every conversation searchable, exportable, owned. No vendor reading my drafts.

The hard constraint that shapes everything below: **subscriptions only, no API tokens.** Personal use cannot justify $100–200/month in raw API spend when my Copilot subscription already covers most of the model catalogue.

---

## 3. Scope

### In scope (Phase 1)
- Web app on testserver, accessed via browser
- Single user, single password
- Multiple rooms, up to 5 bots per room
- Persona library (CRUD, reusable across rooms)
- `@mention` routing + per-bot auto-respond toggle
- Streaming responses, parallel when multiple bots are invoked
- Conversation history with full-text search across rooms
- GitHub Copilot as sole inference provider
- Bot-count-aware model suggestions (see §5.3)

### Out of scope (deliberately deferred)
- Multi-tenant / multi-user authentication
- Mobile app (responsive web is enough)
- Voice, audio, image generation, vision
- Local model hosting (no GPU on hand)
- File upload / RAG over my own corpus → Phase 3
- MCP integration → Phase 3
- Audit trails, compliance, exports for third parties
- Public API

---

## 4. Users

One user. Me. Possibly Uma later if she adopts a use case, but the design assumes solo and pays no multi-user tax up front.

---

## 5. Inference strategy

### 5.1 The constraint
No per-token API billing. Existing subscriptions only.

### 5.2 Options considered

**Option A — GitHub Copilot via PAT-derived session token (selected).**
GitHub OAuth → exchange for Copilot session token via `/copilot_internal/v2/token` → use as Bearer against `https://api.githubcopilot.com/chat/completions`. Catalogue queryable at `/models`. OpenAI-compatible request shape, including streaming via SSE.

- Pros: one auth, one bill, multi-vendor model catalogue under one ceiling, no token-level metering for me.
- Cons: ToS posture is grey. Personal, low-volume, single-user use is the right side of acceptable risk for a hobby. Not a path I would ever ship to a client.

**Option B — GitHub Models (officially sanctioned).**
Free tier (~150 requests/day), OpenAI-compatible, similar catalogue, generous enough for casual use but tight for heavy-research days.

**Option C — Reverse-engineered ChatGPT / Claude session tokens.**
Rejected. Breaks weekly, ToS-hostile, streaming unreliable.

**Decision:** Start with Option A. Keep the provider layer clean enough that B can be added as a fallback (or A's replacement) in a single file.

### 5.3 Model selection — 0x-first

Copilot Pro+ gives me 1500 premium requests/month and generous session limits. The constraint shifts from "balance the bot count carefully" to "default to 0x models, escalate when warranted." Premium becomes opt-in per persona, not a budget-allocation exercise.

**Default tier for new personas: 0x.** The persona editor labels each model with its current multiplier (0x, 0.5x, 1x) so the choice is conscious. The live `/models` catalogue is the source of truth for which models sit at which multiplier — Copilot rotates them.

**Routing pattern this unlocks:** 0x bots are the default first responders (auto-respond on); premium bots sit muted and answer only on `@mention`. A 5-bot room with three 0x first responders and two premium specialists costs zero per turn unless I explicitly escalate. That is the right shape for personal use — abundance of perspective on cheap models, frontier capability available on demand.

Tier definitions (live, queried at runtime):
- **0x (default):** GPT-5 mini, GPT-4.1, smaller variants — current as of catalogue read
- **Premium (opt-in):** Claude Opus, Claude Sonnet, GPT-5, Gemini 2.5 Pro, o-series

The 1500 ceiling becomes a backstop, not a budget to manage. The monthly counter still lives in the UI as a passive indicator, not a constraint that drives feature design.

---

## 6. Core features

### 6.1 Rooms
Create, rename, archive, delete. A room owns: ordered bot participants, a default routing mode, and a conversation history. Phase 2 adds room templates (preset persona stacks).

### 6.2 Personas (BotPersona)
The reusable bot definition, independent of any room.
- Name
- System prompt (full edit, version-tracked)
- Model (from live Copilot catalogue, with tier hint)
- Temperature, top-p
- Identity colour (drives the chat-UI dot and chip)
- Default auto-respond state

A persona can sit in many rooms. Editing it does not retroactively rewrite history.

### 6.3 Routing
Two layers — room default + per-bot toggle:
- **All enabled** (`⌘ + Enter`): every auto-respond bot replies in parallel.
- **Mention** (`@strategist`): only the addressed bot replies.
- **Chain** (Phase 2): predefined sequences such as `draft → critique → reconcile`.

Muted bots stay in the room but don't reply unless explicitly mentioned.

### 6.4 Chat UI
Per the mockup. Sidebar of rooms; main pane with persona chips (each with a model badge and a one-tap mute toggle); messages flow with parallel streaming when multiple bots are invoked; input with `@mention` helpers and a routing hint.

### 6.5 Search
Postgres full-text across all rooms. Filter by bot, date, room. No vector search until I have a real RAG use case.

---

## 7. Architecture

```
Browser (Next.js + React)
    ↓  WebSocket / SSE
Next.js API routes
    ↓
Inference proxy  ──→  Copilot session-token manager
    ↓                   (refresh every ~25 min)
api.githubcopilot.com/chat/completions

PostgreSQL  ←  rooms, personas, messages, users
```

Monolithic Next.js app. Docker Compose. Behind nginx on the existing testserver. No microservices, no Redis, no message queue. Premature distribution is how personal projects die.

The Copilot session-token manager is the one piece of infrastructure that has to be bulletproof — it caches the token, refreshes proactively before expiry, and exposes a stale-while-revalidate fetch to the proxy.

---

## 8. Data model

```sql
users (id, name, password_hash, created_at)

bot_personas (
  id, owner_id, name, system_prompt, model_id,
  temperature, top_p, colour, auto_respond_default,
  created_at, updated_at, version
)

rooms (
  id, owner_id, name, routing_mode,
  archived_at, created_at
)

room_personas (
  room_id, persona_id, auto_respond, position
)

messages (
  id, room_id, sender_type, sender_id,
  content, model_used, latency_ms,
  premium_cost, created_at
)
-- sender_type: 'user' | 'bot'
-- sender_id: users.id or bot_personas.id

message_chunks (
  id, message_id, content, chunk_index,
  finish_reason, created_at
)
-- supports streaming reconstruction and retry
```

Five tables. Drizzle for the ORM layer. No migrations theatre.

---

## 9. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15 (App Router) | Single deploy unit, good streaming primitives |
| Runtime | Node.js 22 | Already on testserver |
| Database | PostgreSQL 16 | Already running, full-text search built in |
| ORM | Drizzle | Lightweight, type-safe, no migration politics |
| UI | shadcn/ui + Tailwind 4 | Fast, owns the design tokens |
| Streaming | Vercel AI SDK | Provider-agnostic, handles SSE end to end |
| Auth | Signed cookies + bcrypt | Overkill avoided for single user |
| Deploy | Docker Compose + nginx | Existing testserver pattern |

---

## 10. Phase plan

| Phase | Scope | Effort |
|---|---|---|
| 0 | Repo, schema, Copilot auth working in isolation | Weekend 1 |
| 1 | Single room, 3 bots, `@mention`, streaming, persistence | Weekend 2 |
| 2 | Multiple rooms, persona library, full-text search, monthly counter | Weekend 3 |
| 3 | Routing chains, MCP, RAG over personal corpus | Open-ended |

The cut-line for Phase 1 is brutal on purpose: prove the multi-bot conversation flow feels right before adding any breadth.

---

## 11. Open questions

1. **Real-world premium burn under Pro+.** 1500/month is generous, and 0x defaults mean most turns cost nothing. The interesting question is which workflows actually justify premium escalation — and whether the per-persona "premium" flag is the right control surface, or whether it should be a per-turn toggle on the input ("send this one to the frontier bot").
2. **Token-refresh edge cases.** Copilot tokens expire every ~30 minutes. If a refresh fails mid-stream, do we kill the in-flight response or queue it? Default: kill, surface the error, let user retry with one click.
3. **Stalled-bot policy.** When one of three parallel bots stalls, do we wait or proceed? Default: 30s timeout per bot, mark errored, the rest of the conversation continues.
4. **Persona versioning semantics.** Edit Strategist's prompt — does prior history re-render under the new prompt, or stay frozen? Decision: stay frozen. Conversations are immutable artefacts of the persona at the time.
5. **Cross-bot context.** When Bot A and Bot B are both in a room, does Bot B see Bot A's reply in its context? Default: yes. The whole point of the room is shared context. Configurable later if it causes problems.

---

## 12. Risks

- **Copilot ToS revocation.** Unlikely for personal volumes, but possible. Mitigation: human-rate request patterns, single user, no parallel scaling. Plan B: switch to GitHub Models within a day (one provider-layer file).
- **Premium-budget drift.** Pro+ ceiling is 1500/month, so the risk is no longer running out — it's silent escalation: a persona quietly switched from 0x to premium and burning quota I didn't notice. Mitigation: explicit multiplier label on every persona chip, monthly counter visible in sidebar.
- **Model deprecation.** Copilot rotates the catalogue. Mitigation: never hard-code model IDs; resolve from `/models` at runtime, store the resolved ID with each message for replay.
- **Session-token churn.** A leaky refresh manager destroys the experience faster than any other bug. This is the single most important piece of plumbing to get right.

---

## 13. Success criteria (personal)

- I use Atrium more than I use Claude.ai or ChatGPT directly within 4 weeks of Phase 1 ship.
- Average conversation has at least 2 bots involved meaningfully.
- Monthly premium-request burn stays comfortably under 1000 of the 1500 Pro+ ceiling, with headroom for heavy weeks.
- Search retrieves the right past conversation in under 10 seconds, every time.
- Adding a new persona takes under 90 seconds.
