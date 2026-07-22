# Mail Processing Improvement Plan

## Current State

- Hermes polls the gateway every 10s for new sessions/messages
- All inbound messages are dumped to every idle agent's `inbox.jsonl` — no triage
- Messages are in-memory only (lost on redeploy)
- No reply capability from the UI
- No conversation threading
- Hermes and Yuki have no distinct mail-related roles

## Goals

1. **Hermes = postal worker** — receives, sorts, delivers, dispatches. Mechanical + light LLM triage.
2. **Yuki = office manager** — assigns, tracks, escalates, reports. Managerial.
3. Persist messages across deploys.
4. Allow agents to reply through the gateway.
5. Give the player visibility into mail status.

---

## Phase 1: Persistence (small, high-value)

**Store platform events in Supabase instead of in-memory.**

- New table: `sprite_heights_mail_events`
  - `id` UUID PK
  - `user_id` TEXT FK
  - `platform` TEXT
  - `direction` TEXT ('inbound' | 'outbound')
  - `sender` TEXT
  - `text` TEXT
  - `timestamp` BIGINT
  - `status` TEXT ('new' | 'delivered' | 'handled' | 'escalated')
  - `assigned_agent_id` TEXT (nullable)
- On `emitPlatformEvent()`, also INSERT into this table
- On load, SELECT recent events per platform instead of seeding fake data
- `checkMailbox()` updates status to 'handled' or marks as read

**Files:** `server/db-relational.ts`, `server/manager.ts`, new migration

---

## Phase 2: Smart Routing (Hermes triage)

**Hermes reads inbound messages and routes to the best agent.**

- Replace `routePlatformEvent()` blanket delivery with a triage step:
  - **Rule-based (free):** keyword matching on agent roles/skills
    - "deploy", "server", "down" → DevOps agent
    - "bug", "error", "crash" → QA/debugging agent
    - "design", "UI", "layout" → design agent
    - "invoice", "payment", "billing" → finance agent
  - **LLM-based (optional, costs tokens):** if no rule matches, ask Hermes's agent to classify and pick an agent. Only triggers on messages that don't match any rule.
- Hermes writes to the chosen agent's `inbox.jsonl` with routing context:
  ```json
  {"ts": 123, "from": "Hermes", "platform": "Slack", "sender": "sarah@design", "message": "Can someone review the new landing page?", "routing_reason": "keyword: design → assigned to Design Agent"}
  ```
- If no agents are idle, Hermes holds the message in a queue and retries when one becomes idle.

**Files:** `server/manager.ts` (routePlatformEvent rewrite), possibly `server/hermes-client.ts`

---

## Phase 3: Reply Capability

**Agents can reply through the gateway.**

- Wire `HermesClient.sendMessage()` into the agent workflow:
  - When an agent's log contains `[Platform] reply → target: message`, Hermes detects it and sends via gateway
  - Add a `sendPlatformReply()` method to manager that calls `hermesClient.sendMessage()`
  - Log the outbound event with `emitPlatformEvent(direction: 'outbound')`
- UI: when checking a mailbox, show conversation thread (inbound + outbound in chronological order)
- UI: add a "Reply" button in the mailbox check modal that lets the player type a reply

**Files:** `server/manager.ts`, `server/hermes-client.ts`, `client/src/game/scene.ts`

---

## Phase 4: Yuki Oversight

**Yuki tracks mail assignments and escalates.**

- Yuki periodically checks:
  - Are there messages with status 'delivered' but no agent response after N minutes?
  - If so, escalate: reassign to another idle agent, or alert the player
- When the player visits Yuki, she gives a mail summary:
  - "You have 3 unread messages: 1 urgent (Slack, 15 min ago), 2 normal"
  - "Agent X is handling the deploy issue from Telegram"
  - "1 message has been waiting 2 hours — no available agents"
- Yuki can reassign tasks if an agent is stuck or on vacation

**Files:** `server/manager.ts`, `client/src/game/scene.ts` (Yuki dialogue)

---

## Phase 5: Queue & Retry

**Hermes holds undeliverable mail and retries.**

- In-memory queue (or DB table `sprite_heights_mail_queue`):
  - `platform`, `sender`, `text`, `timestamp`, `retry_count`, `last_retry`
- When all agents are busy, message goes to queue
- On agent state change (busy → idle), Hermes checks queue and delivers
- Max retry count (e.g., 3) before escalating to Yuki/player
- UI: mailbox shows a small "queued" indicator when messages are waiting

**Files:** `server/manager.ts`, `client/src/game/scene.ts`

---

## Phase 6: Mail Digest & Notifications

**Player gets a summary on login/visit.**

- When player enters the mail room, Hermes greets with:
  - "Good morning! 5 new messages across 3 platforms since you were last here."
  - Flag animation on mailboxes with unread count
- Optional: desktop notification via the HUD feed when a new high-priority message arrives
- "Mark all as read" button in the mailbox check modal

**Files:** `server/manager.ts`, `client/src/game/scene.ts`, `client/src/ui/hud.ts`

---

## Implementation Priority

| Phase | Effort | Value | Dependencies |
|-------|--------|-------|-------------|
| 1. Persistence | Small | High | None |
| 2. Smart Routing | Medium | High | Phase 1 |
| 3. Reply Capability | Medium | High | None |
| 4. Yuki Oversight | Medium | Medium | Phase 1, 2 |
| 5. Queue & Retry | Small | Medium | Phase 2 |
| 6. Mail Digest | Small | Medium | Phase 1 |

Recommended order: **1 → 2 → 3 → 5 → 4 → 6**
