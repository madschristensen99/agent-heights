# Agent Heights — Adaptive Guidance & User Engagement

The office should never leave the user without a direction. The outside world
should never leave the user without a challenge. And the user should never
doubt that their achievements are real, recognized, and worth pursuing.

This document describes a system that observes user state, identifies the
highest-value next step, and guides the user there — agentic, personalized,
and non-deterministic. It also describes how the game sells the **fantasy of
excellence** — making every user feel undeniably skilled, recognized by peers,
visually distinguished, and operating at the highest level of a competitive
area.

The system replaces the current "hire agent → tour → silence" funnel with a
continuous engagement loop that adapts to each user's use case, skill level,
and activity pattern — across both the office and the outside world.

---

## 1. The Fantasy of Excellence

Call of Duty succeeds because it sells a fantasy experience. It allows players
to briefly inhabit an aspirational self: someone who is undeniably skilled,
recognized by peers, visually distinguished, and operating at the highest
level of a competitive area.

Agent Heights has the same opportunity — but the fantasy is dual:

1. **In the outside world** — you're a warrior. You explore, fight, conquer. Skill
   is proven by what you've killed and what you're carrying. The progression
   chain (golf club → axe → sword → void blade → legendary weapon → Sovereign
   Crown) is the ladder.
2. **In the office** — you're a boss. You manage, delegate, ship. Skill is
   proven by what your team has accomplished and how efficiently you orchestrate.

The connection between them is what makes AH unique. The agents reacting to
your outside world exploits is the bridge — it makes the office feel like a place
where people *know* you, and the outside world feel like a place where you prove
yourself.

### The Four Pillars

#### Pillar 1: Undeniably Skilled
The outside world progression handles this — but the skill needs to be **visible
as a number.** CoD has K/D ratio. AH needs:
- outside world depth reached (chunks explored)
- Creatures killed
- Bosses slain
- Weapons collected
- Golf score / hole-in-ones
- Tasks completed (office side)
- Agents managed simultaneously

These already exist as achievements but they're hidden. They need to be a
**visible stats panel** — the "combat record" equivalent.

#### Pillar 2: Recognized by Peers
Two layers:

**a) Agents react in-character (the "glazing" system)**
When the boss achieves something, agents notice. This is cheap — pre-written
feed posts triggered by achievement unlocks. See §5 for the full reaction
table.

**b) Other players see it (future)**
- Public Hall of Fame / trophy room — a shareable URL showing your office,
  trophies, and stats
- Office visits — let other players visit and see your crown, weapon rack,
  stats
- Auto-screenshot + post to Telegram/Discord via the narration system when
  major achievements unlock ("The boss just killed the Infernal Sovereign.")

#### Pillar 3: Visually Distinguished
Already have: trophy case with crown, weapon rack (planned), custom avatar,
office design.

Still needed:
- Visual badges on the player sprite (crown icon, weapon icon)
- Office exterior changes after major milestones (more imposing door, etc.)
- Agent count as visual flex (walking around with 8 agents = status)

#### Pillar 4: Operating at the Highest Level of a Competitive Area
The outside world is the competitive area for now:
- Deepest explorer, most creatures killed, fastest crown run
- Speedrun timer (already planned in PROGRESSION.md §21)
- Leaderboard: "Deepest explorers" / "Fastest crown runs" / "Most creatures
  slain"
- Future: combined score — outside world conquest + office productivity

---

## 2. Pricing Model

The pricing structure supports the engagement funnel without forcing the sale.

| Tier | Price | Type | What you get |
|---|---|---|---|
| **Entry** | $0.99 | One-time | Hire agents, run tasks. ~$0.50 usage credit built in. |
| **Starter** | $3.99/mo | Subscription | More agents, higher usage cap, ongoing access. |
| **Pro** | $19.99/mo | Subscription | Max agents, max usage, premium APIs. |

### Why one-time entry instead of $0.99/mo subscription

Stripe takes ~$0.33 per transaction. A $0.99/mo subscription nets ~$0.66/mo —
13% revenue to Stripe. A one-time $0.99 payment has the same fee but you only
pay it once. The entry fee is a **commitment device** — it filters out
tire-kickers but is cheap enough that anyone serious will pay it.

$3.99 for Starter hits the psychological sweet spot — "a few bucks" rather than
"five dollars." It's still 4x the entry fee, so the upsell feels substantial
without feeling expensive.

### The funnel

```
1. ARRIVE — User signs up, enters office (free)
   └── Cost: $0

2. ONBOARDING — Hire agents, explore, play golf (free)
   └── Cost: $0
   └── Agents hired but can't run tasks

3. ENTRY — $0.99 one-time to unlock task execution
   └── Revenue: $0.99 (net ~$0.16 after Stripe + usage credit)
   └── User gets ~$0.50 of inference credit (enough for 5-15 tasks)

4. HOOK — User runs tasks, agents produce value, usage credit depletes
   └── Cost: funded by entry fee

5. SUBSCRIBE — "Subscribe to keep your agents working"
   └── Revenue: $3.99/mo Starter (net ~$3.55)
   └── Only shown to users who have already experienced agent value

6. EXPAND — More agents, more tools, premium APIs
   └── Revenue: $19.99/mo Pro
```

The subscription sells itself because the user has already experienced agents
doing real work. The paywall feels like "I need to give my employee a salary,"
not "ugh, a paywall."

### What changes from current code

The current code has `starter` at $0.99/mo and `pro` at $19.99/mo. The change is:
- Remove `starter` as a subscription tier — replace with $0.99 one-time entry fee
- Rename: old `starter` ($0.99/mo) → entry fee ($0.99 one-time), old `pro` ($19.99/mo) → new `starter` ($3.99/mo), old `business` ($19.99/mo) → new `pro` ($19.99/mo)
- Bring back `entrance_paid` as a $0.99 one-time Stripe checkout
- Free tier: can hire 2 agents, explore outside world, play golf — but no task
  execution
- Entry tier: `entrance_paid = true`, `subscriptionActive = false` — can run
  tasks until usage credit ($0.50) is exhausted
- Starter ($3.99/mo) and Pro ($19.99/mo): subscription tiers

---

## 3. The Problem

### Current funnel

1. User signs up → auth overlay
2. Onboarding modal: name, workspace, avatar builder
3. "What do you do?" prompt → agent recommendations → user clicks HIRE on 1-2
4. 7-step intro tour
5. **Silence**

After step 4, the user is in an office with 1-2 agents sitting at desks and
no idea what to do next. No prompt, no suggestion, no nudge. The achievements
system fires (`first_hire`, `first_done`) but these are reactive — they
celebrate what happened, they don't guide what happens next. The outside world is
accessible but has no combat system yet — exploration only. Agents don't
react to anything the boss does. The office feels dead.

### Where users churn

| Drop-off point | Why | Current mitigation |
|---|---|---|
| After onboarding, before first hire | Blank-page paralysis in hire modal | Onboarding prompt recommends agents |
| After first hire, before first task | "OK I hired an agent... now what?" | None |
| After first task, before habit | No reason to return daily | None |
| After 3 days of inactivity | Out of sight, out of mind | None (deletion at 30 days) |
| After connecting 1 platform | No suggestion to connect more | None |

### What we have but don't use

- **User's email** — captured at signup, used only for welcome/deletion/billing
- **User's onboarding text** — "I'm a backend developer using GitHub, Sentry..." — stored but never referenced after the initial recommendation
- **Office Manager** — has full context (roster, task board, MCP catalog, PulseMCP search) but only responds when clicked
- **Agent activity** — tasks completed, tools used, errors — all logged but never surfaced proactively
- **Achievements** — track milestones but don't suggest next steps, and agents don't react to them
- **Outside world state** — chunks explored, creatures killed, weapons collected — all tracked but never surfaced in the office
- **Narration system** — can post screenshots to Telegram/Discord but only fires on scheduled intervals, not on achievement unlocks
- **Trophy case** — exists in the office but has no crown display and no agent reaction when something is placed

---

## 4. Design Principles

### Non-deterministic
Every user has different use cases. A deterministic checklist ("Step 1: hire
agent. Step 2: connect Slack. Step 3: ...") breaks because a crypto user wants
wallet setup, a founder wants GitHub, a researcher wants web search. The system
must adapt.

### Agentic
The Office Manager already has the context and LLM capability to generate
personalized guidance. The system should leverage her — not hard-code every
suggestion. The LLM evaluates the user's state and generates a relevant nudge.

### Non-threatening
No red warnings. No "you haven't done X." No guilt. The tone is warm and
helpful — "Hey boss, want to try this?" — not demanding. The user can always
ignore a suggestion without penalty.

### Confidence-inspiring
Every suggestion should make the user feel like they're making progress, not
like they're failing. "You've got 1 agent and 3 tasks done — want to add a
second agent to work in parallel?" not "You only have 1 agent. Hire more."

### Playful
The office metaphor is the delivery vehicle. Suggestions come from characters
(Hermes, Office Manager) not from a system notification. The tone matches the
game: warm, slightly humorous, in-character.

### Progressive
Don't overwhelm. One suggestion at a time, or at most 2-3 in a "Next Steps"
panel. Never show a wall of tasks. The user should feel guided, not managed.

### Fantasy-reinforcing
Every interaction should reinforce the dual identity: competent boss in the
office, capable warrior in the outside world. Agent reactions make achievements
feel real. Stats make skill visible. Suggestions guide toward the next moment
of recognition. The user should never feel like they're using a tool — they
should feel like they're living a fantasy.

---

## 5. State Signals

The system needs to track a set of signals about the user's state. These are
the inputs that drive suggestion generation.

### Agent signals
| Signal | Source | Example values |
|---|---|---|
| `agentsHired` | `store.agents` count (excl. built-ins) | 0, 1, 3, 8 |
| `agentRoles` | `agent.role` across roster | `["worker", "manager"]` |
| `agentSkills` | `agent.skills` across roster | `["frontend", "backend", "research"]` |
| `hasManager` | any agent with role "manager" | true/false |
| `hasDevOps` | any agent with role "devops" | true/false |
| `agentModels` | distinct `agent.model` values | `["deepseek-v4-flash", "claude-sonnet-4-20250514"]` |

### Task signals
| Signal | Source | Example values |
|---|---|---|
| `tasksCompleted` | achievements stat `tasksDone` | 0, 1, 5, 50 |
| `tasksInProgress` | agents with status "working"/"thinking" | 0, 1, 3 |
| `lastTaskAt` | timestamp of most recent task completion | 2024-01-15T10:30:00Z |
| `everGivenTask` | any agent has ever had `task != null` | true/false |

### Platform signals
| Signal | Source | Example values |
|---|---|---|
| `platformsConnected` | `store.platformStates` with connected=true | `["slack", "telegram"]` |
| `mcpServersConfigured` | agents with `mcpServers` length > 0 | 0, 1, 3 |
| `mcpAuthPending` | MCP servers with authType but no key | 0, 1, 2 |
| `walletsProvisioned` | agents with `cdpSolana` or `crossmintWallet` | 0, 1, 2 |

### Engagement signals
| Signal | Source | Example values |
|---|---|---|
| `sessionsCount` | server-side session count | 1, 3, 10 |
| `lastSessionAt` | server-side last connection time | 2024-01-15T10:30:00Z |
| `daysSinceLastSession` | computed from `lastSessionAt` | 0, 1, 3, 7, 14 |
| `marketplaceVisits` | client-side localStorage counter | 0, 1, 3 |
| `officeManagerChats` | client-side localStorage counter | 0, 1, 5 |
| `onboardingText` | stored from "What do you do?" prompt | "I'm a backend dev using GitHub..." |

### Achievement signals
| Signal | Source | Example values |
|---|---|---|
| `unlockedAchievements` | `achievements.unlocked` set | `["first_hire", "first_done"]` |
| `totalTasksDone` | `achievements.stats.tasksDone` | 0, 10, 100 |

### Outside world signals
| Signal | Source | Example values |
|---|---|---|
| `outsideVisited` | client-side flag on first world scene entry | true/false |
| `chunksExplored` | `visitedChunks` count in world state | 0, 5, 50 |
| `creaturesKilled` | achievement stat `creaturesKilled` | 0, 1, 20 |
| `bossesSlain` | achievement stat `bossesSlain` | 0, 1, 3 |
| `weaponsCollected` | set of weapon types ever equipped | `["axe", "iron_sword"]` |
| `hasGolfClub` | world state flag | true/false |
| `holeInOnes` | achievement stat `holeInOnes` | 0, 1, 3 |
| `bestWeapon` | highest-tier weapon currently equipped | null, "axe", "void_blade" |
| `sovereignCrownPlaced` | achievement `from_cubicle_to_conqueror` unlocked | true/false |

### Derived: "User Stage"
Based on the signals above, classify the user into a stage. This is not a
linear progression — a user can be at different stages for different
dimensions.

| Stage | Condition | Meaning |
|---|---|---|
| `empty` | 0 agents hired | Brand new, needs first agent |
| `seeded` | 1+ agents, 0 tasks ever | Has agents but hasn't used them |
| `active` | 1+ tasks completed, active within 3 days | Getting value |
| `dormant` | Was active, 3+ days since last session | Drifting away |
| `lapsed` | 7+ days since last session | Likely churned |
| `power` | 5+ agents, 50+ tasks, multiple platforms | Self-sufficient |
| `adventurer` | outside world visited, 1+ creatures killed | Exploring the game layer |
| `conqueror` | Sovereign Crown placed | Completed the progression chain |

---

## 6. Agent Reaction System ("Glazing")

The cheapest, highest-impact piece of the fantasy. When the boss achieves
something — in the office or the outside world — agents notice and react. This
makes the office feel alive and makes the player's achievements feel *seen.*

### How it works

```
When an achievement is unlocked:
  1. Check if there's an agent reaction mapped for this achievement
  2. If yes, post an in-character message to the Office Feed from a specific
     agent (or random agent for generic reactions)
  3. The message is pre-written, not LLM-generated (zero cost, instant,
     controllable tone)
```

This is ~100 lines of code — a `REACTION_TABLE` mapping achievement IDs to
agent dialogue, hooked into the existing achievement unlock flow in
`store.ts`. Zero AI cost. Instant personality.

### Reaction table

| Achievement | Agent | Reaction (Office Feed) |
|---|---|---|
| `first_hire` | New agent | "Welcome to the team! I'm excited to get started, boss." |
| `first_done` | Task agent | "First task done! That felt good. Got another one?" |
| `hole_in_one` | Random | "The boss got a hole-in-one on the golf course. We've been here 10 minutes." |
| `first_blood` | Hermes | "Heard you got into a fight outside. You okay? ... You're smiling. Concerning." |
| `leprechaun_trade` | Random | "The boss traded a golf club for an axe with a leprechaun. I have questions but I'm afraid of the answers." |
| `first_chop` | Random | "Why is the boss chopping trees? We have agents for that. ... We don't have agents for that." |
| `lumberjack` | Random | "20 trees. The boss has chopped 20 trees. We're supposed to be working." |
| `racket_kill` | Random | "The boss killed a creature with a tennis racket. I'm not sure if that's brave or insane." |
| `beast_slayer` | Random | "The boss killed a legendary beast in the outside world. I'm going to pretend I know what that means." |
| `armory_found` | Random | "The boss found a hidden armory. With weapons. This is fine. Everything is fine." |
| `void_blade_pickup` | Hermes | "The boss has a void blade now. I'm not asking where they got it. I'm not asking." |
| `legendary_weapon` | Random | "The boss is carrying a legendary weapon. I feel like we should be paying them more." |
| `infernal_sovereign_kill` | Random | "The boss killed the Infernal Sovereign. I don't know what that is but it sounds impressive. Should we be worried?" |
| `from_cubicle_to_conqueror` | All agents | "..." (speechless) then Hermes: "You came from a cubicle. Now you rule the outside world. I'm not even being sarcastic. That's genuinely incredible." |
| `first_task_5` | Random | "5 tasks done. The office is actually running. This is... weirdly emotional." |
| `first_task_25` | Random | "25 tasks. We're a real team now. Don't tell the boss I said that." |
| `first_task_100` | Hermes | "100 tasks completed. I've been logging every one. You're a good boss. Don't let that go to your head." |
| `personality_variety` | Random | "The boss has hired agents with wildly different personalities. It's like a sitcom in here." |

### Implementation

```typescript
// client/src/ui/agent-reactions.ts

interface AgentReaction {
  achievementId: string;
  agentId?: string;  // specific agent (e.g. HERMES_ID), or undefined for random
  text: string;
  delayMs?: number;  // optional delay before posting (for dramatic effect)
}

const REACTION_TABLE: AgentReaction[] = [
  { achievementId: "first_hire", text: "Welcome to the team! I'm excited to get started, boss." },
  { achievementId: "first_done", text: "First task done! That felt good. Got another one?" },
  { achievementId: "hole_in_one", text: "The boss got a hole-in-one on the golf course. We've been here 10 minutes." },
  { achievementId: "first_blood", agentId: HERMES_ID, text: "Heard you got into a fight outside. You okay? ... You're smiling. Concerning." },
  // ... full table
];

export function getReactionForAchievement(achievementId: string): AgentReaction | null {
  return REACTION_TABLE.find(r => r.achievementId === achievementId) ?? null;
}
```

Hook into the achievement unlock flow in `store.ts`:
```typescript
// After achievements.unlock(id) is called:
const reaction = getReactionForAchievement(id);
if (reaction) {
  const agentId = reaction.agentId ?? randomAgentId();
  // Post to Office Feed as if the agent said it
  this.postFeedMessage(agentId, reaction.text, reaction.delayMs);
}
```

### Special: Crown placement sequence

When `from_cubicle_to_conqueror` unlocks:
1. All agents in the office turn to face the trophy case (visual)
2. 2-second pause (dramatic silence)
3. Feed post from all agents: "..."
4. Feed post from Hermes: "You came from a cubicle. Now you rule the outside world. I'm not even being sarcastic. That's genuinely incredible."
5. VFX: golden particle burst from the trophy case

This is the AH equivalent of the CoD match-ending killcam — the moment the
player feels the full weight of their achievement.

### Special: Return from outside world

When the player transitions from WorldScene back to OfficeScene after a
significant outside world event (first kill, new weapon, boss slain):
- Check what changed since they left (new weapon, new achievement)
- Post a contextual reaction from a random agent
- Example: boss returns with void blade → "The boss is carrying a glowing purple blade. I'm not asking where they got it. I'm not asking."

This requires tracking state at outside world exit and comparing to state at
outside world entry. Store a snapshot of `unlockedAchievements` and `bestWeapon`
when the player leaves the office; diff on return.

---

## 7. Architecture

Three layers, each with different timing and delivery mechanisms.

```
┌─────────────────────────────────────────────────────────────┐
│                       USER STATE                             │
│  (agents, tasks, platforms, sessions, achievements,          │
│   outside world exploration, weapons, creatures killed)       │
└───────┬────────────┬───────────────┬────────────────────────┘
        │            │               │
 ┌──────▼──────┐ ┌───▼─────────┐ ┌──▼──────────────┐
 │  Layer 0    │ │  Layer 1    │ │  Layer 2        │
 │  Agent      │ │  In-Office  │ │  Email          │
 │  Reactions  │ │  Prompts    │ │  Re-engagement  │
 │  (instant)  │ │  (real-time)│ │  (async)        │
 └─────────────┘ └─────┬───────┘ └────┬────────────┘
                       │              │
                       └──────┬───────┘
                              │
                      ┌───────▼───────┐
                      │  Layer 3      │
                      │  Office Mgr   │
                      │  Concierge    │
                      │  (agentic)    │
                      └───────────────┘
```

### Layer 1: In-Office Prompts (Real-time, Client-side)

Lightweight, mostly deterministic logic that checks state signals and shows
contextual prompts. No AI needed for the basic version — just if/else on
state. AI enhances it later (Layer 3).

**Delivery mechanisms:**

#### a) Speech Bubbles from NPCs
When the user walks near Hermes or the Office Manager, the NPC shows a speech
bubble with a contextual suggestion. This reuses the existing NPC interaction
system but triggers proactively instead of waiting for a click.

Examples:
- Hermes (no platforms connected): "Hey boss, if you connect Slack I can send
  you updates there too. Just click me and ask about platforms."
- Office Manager (1 agent, 0 tasks): "Welcome to the office! Try giving
  [Agent Name] a task — type something in the Office Feed below."
- Office Manager (5+ tasks, no manager hired): "You're getting busy! Want me
  to hire a Manager to help delegate work across the team?"

**Implementation:**
- A `SuggestionEngine` class in the client that runs on an interval (every
  30s) and checks state signals
- When a suggestion is available, it sets a `pendingSuggestion` on the
  relevant NPC
- The NPC's existing render loop shows the speech bubble when the player is
  within proximity
- Each suggestion has a `minInterval` (don't show more than once per session)
  and `dismissKey` (stored in localStorage so it doesn't repeat across
  sessions)

#### b) Post-Event Toasts
After key events, show a toast with a contextual next-step suggestion.

| Event | Current behavior | With guidance |
|---|---|---|
| First agent hired | Achievement toast | "Hired! Try giving [Name] a task in the Office Feed." |
| First task completed | Achievement toast | "Task done! Want to connect [Name] to Google Calendar? Click their desk." |
| Agent error | Error log | "Hmm, [Name] hit an error. Want to ask the Office Manager for help?" |
| Agent idle 5+ min | Nothing | "[Name] is idle — give them something to do!" |
| Marketplace visit, no hire | Nothing | "Find someone you like? Click their card for details, then HIRE INTO HQ." |

**Implementation:**
- Hook into existing event handlers in `store.ts` (the `case "agent":` block
  already detects new agents and task completions)
- After the existing achievement logic, call `suggestionEngine.onEvent(event, context)`
- The engine decides whether to show a toast with a suggestion

#### c) "Next Steps" Panel
A small panel in the HUD (collapsible, dismissible) that shows 2-3
personalized suggestions based on current state. Always available but never
intrusive.

Example content:
```
NEXT STEPS
─────────────────────────────
▸ Give [Agent Name] a task
▸ Connect Slack for agent updates
▸ Hire a second agent to work in parallel
```

As the user completes each step, it's replaced with the next relevant
suggestion. When the user is fully "power" stage, the panel shows "Your office
is running smoothly. Check the Office Feed for activity."

**Implementation:**
- A `NextStepsPanel` component in `hud.ts`
- Rendered in the HUD, toggled with a small "Next" button
- Content generated by `SuggestionEngine.getSuggestions()` which returns 0-3
  items based on current state
- Each item has a label and an optional action (click to navigate, open
  marketplace, focus an agent, etc.)

### Layer 2: Email Re-engagement (Async, Server-side)

Uses the existing Resend email system to reach users who haven't returned.
Triggered by a server-side cron job that checks `lastSessionAt` for all users.

**Email schedule:**

| Trigger | Subject | Content |
|---|---|---|
| Day 2, no return | "Your office is ready and waiting" | Reminder that agents are hired and ready for tasks. Link to enter office. |
| Day 5, no return | "Here's what your agents could do for you" | Personalized based on onboarding text: "You said you're a backend developer — your agents can review PRs, write tests, and monitor deployments." Link to office. |
| Day 10, no return | "A quick task to try" | One specific, low-friction task suggestion based on their use case: "Try asking your agent to research your top 3 competitors." Link to office. |
| Day 14, no return | "Should we keep your office?" | Gentle warning that inactive offices are cleaned up after 30 days. Not a threat — framed as "we don't want to delete your setup, come back and give it a try." |
| Day 25, no return | "Final notice: your agents will be let go" | The existing deletion warning email, softened. |

**Personalization data available:**
- `onboardingText` — what they said they do
- `agentsHired` — names and roles of their agents
- `tasksCompleted` — what their agents have already done
- `platformsConnected` — what integrations they set up

**Implementation:**
- New function `sendReengagementEmail()` in `server/email.ts`
- New cron job in `server/index.ts` (or `server/tenant.ts`) that runs daily:
  1. Query Supabase for all users with `last_active_at` in the target windows
  2. Fetch their state (agents, tasks, onboarding text)
  3. Generate personalized email content
  4. Send via Resend
- Track `last_reengagement_email_at` per user to avoid duplicate sends
- Unsubscribe link in every email (required for CAN-SPAM compliance)

**Email template (branded, matching existing dark theme):**
```
Subject: Your office is ready and waiting

Hi [Name],

Your AI office at Agent Heights is set up and ready.

[Agent Name] is at their desk, waiting for their first task.
Just enter your office and type something in the Office Feed
— they'll get to work immediately.

[Enter Office →]

— The Agent Heights Team
```

### Layer 3: Office Manager Concierge (Agentic, Server-side)

The most powerful layer. The Office Manager proactively initiates
conversations based on user state, using the LLM to generate personalized
guidance.

**When it triggers:**
- User enters the office and has been "seeded" (agents hired, 0 tasks) for
  2+ minutes without giving a task
- User returns after 3+ days of inactivity
- User has 1 agent and 5+ completed tasks but hasn't hired a second
- User has agents with MCP servers but none are authenticated
- User has been in the office for 5+ minutes without any interaction

**How it works:**

1. Server tracks a `userEngagementState` object per session:
   ```typescript
   interface UserEngagementState {
     stage: "empty" | "seeded" | "active" | "dormant" | "lapsed" | "power";
     signals: StateSignals; // from Section 4
     lastSuggestionAt: number;
     lastSuggestionType: string;
     sessionStartTime: number;
     idleMinutes: number;
   }
   ```

2. A server-side timer checks the state every 60 seconds during an active
   session. If a trigger condition is met and enough time has passed since
   the last suggestion, it sends a `office_manager_nudge` ServerMsg to the
   client.

3. The client receives the nudge and shows it as a speech bubble from the
   Office Manager (not a toast — it's a character speaking, not a system
   notification).

4. The nudge content is generated by the LLM with full context:
   ```
   System: You are the Office Manager. The boss has been in the office for
   3 minutes. They hired 1 agent (a Research Assistant) but haven't given
   any tasks yet. Their onboarding said: "I'm a marketing consultant."
   Generate a short, friendly suggestion for what they should do next.
   Keep it to 1-2 sentences. Be warm and specific to their use case.
   ```

5. If the user clicks the speech bubble, it opens the Office Manager chat
   with the suggestion pre-loaded as context, so the conversation continues
   naturally.

**Implementation:**
- New `UserEngagementTracker` class in `server/manager.ts` (or a new file
  `server/engagement.ts`)
- Runs as part of the existing session lifecycle — started on connection,
  stopped on disconnect
- Uses the existing `runOfficeManagerKnowledgeChat()` infrastructure but with
  a shorter, focused prompt for nudge generation
- Rate-limited: max 1 nudge per 5 minutes, max 3 per session
- Respects `dismissKey` in localStorage — if the user dismissed a nudge type,
  don't repeat it

**Example nudges:**

| State | Nudge |
|---|---|
| Seeded, 3 min idle, onboarding "backend developer" | "Hey boss! [Agent Name] is ready to go. Want to have them review your latest GitHub PR? Just type it in the Office Feed." |
| Active, 5 tasks, 1 agent | "You're getting a lot done with [Name]! If you hire a second agent, they can work in parallel. Want me to find someone?" |
| Dormant return, day 5 | "Welcome back! While you were away, I reorganized the task board. [Name] has 2 completed tasks ready for your review." |
| MCP auth pending | "I noticed [Name]'s Google Calendar connection isn't set up yet. Want me to walk you through it?" |

---

## 8. The Suggestion Engine (Layer 1 Detail)

The `SuggestionEngine` is the client-side brain for deterministic suggestions.
It's a pure function of state — no AI, no server calls.

### Interface

```typescript
interface Suggestion {
  id: string;              // unique key for dedup/dismiss
  label: string;           // short text shown to user
  action: SuggestionAction; // what happens when clicked
  priority: number;         // 1 (highest) to 5 (lowest)
  dismissKey: string;       // localStorage key to prevent repeat
  minIntervalMs: number;    // don't show more often than this
}

type SuggestionAction =
  | { type: "focus_agent"; agentId: string }
  | { type: "open_marketplace" }
  | { type: "open_hire_modal" }
  | { type: "focus_office_manager" }
  | { type: "focus_hermes" }
  | { type: "open_feed" }
  | { type: "open_worlds" }
  | { type: "navigate"; url: string };
```

### Suggestion Rules

Rules are evaluated in priority order. The first matching rule that hasn't
been dismissed produces the suggestion.

| Priority | Condition | Suggestion | Action |
|---|---|---|---|
| 1 | `agentsHired === 0` | "Hire your first agent" | `open_hire_modal` |
| 1 | `agentsHired === 0`, visited marketplace | "Browse the marketplace for pre-built agents" | `open_marketplace` |
| 2 | `agentsHired >= 1`, `everGivenTask === false` | "Give [Name] a task — type in the Office Feed" | `open_feed` |
| 2 | `agentsHired >= 1`, `everGivenTask === false`, idle 2+ min | Office Manager speech bubble: "Try giving [Name] a task..." | `focus_office_manager` |
| 3 | `tasksCompleted >= 1`, `platformsConnected.length === 0` | "Connect a platform (Slack, Telegram) for agent updates" | `focus_hermes` |
| 3 | `tasksCompleted >= 1`, `mcpAuthPending > 0` | "Connect [Service] to unlock [Agent]'s tools" | `focus_agent` (the agent with pending auth) |
| 3 | `tasksCompleted >= 5`, `agentsHired === 1` | "Hire a second agent to work in parallel" | `open_hire_modal` |
| 4 | `tasksCompleted >= 10`, `hasManager === false` | "Hire a Manager to delegate work across the team" | `open_hire_modal` |
| 4 | `tasksCompleted >= 10`, `marketplaceVisits === 0` | "Browse the marketplace for specialized agents" | `open_marketplace` |
| 4 | `tasksCompleted >= 20`, `walletsProvisioned === 0` | "Give an agent a crypto wallet for autonomous transactions" | `open_marketplace` (filtered to wallet agents) |
| 3 | `outsideVisited === false`, `agentsHired >= 1` | "Explore the outside world — walk out the office door" | `open_worlds` |
| 3 | `outsideVisited === true`, `creaturesKilled === 0` | "Find a weapon in the outside world and fight back" | `open_worlds` |
| 4 | `hasGolfClub === true`, `holeInOnes === 0` | "Try for a hole-in-one on the golf course" | `open_worlds` |
| 4 | `bestWeapon === "axe"`, `chunksExplored >= 10` | "You're ready for deeper outside world exploration — find the blacksmith" | `open_worlds` |
| 5 | `stage === "power"` | "Your office is running smoothly. Check the Office Feed for activity." | `open_feed` |
| 5 | `stage === "conqueror"` | "You rule the outside world. Your office runs itself. What's next?" | `open_feed` |

### Implementation

```typescript
// client/src/ui/suggestion-engine.ts

export class SuggestionEngine {
  private dismissed = new Set<string>();

  constructor(private store: Store) {
    // Load dismissed suggestions from localStorage
    const saved = localStorage.getItem("ah-dismissed-suggestions");
    if (saved) {
      try { this.dismissed = new Set(JSON.parse(saved)); } catch {}
    }
  }

  getSuggestions(): Suggestion[] {
    const signals = this.collectSignals();
    const results: Suggestion[] = [];

    for (const rule of SUGGESTION_RULES) {
      if (results.length >= 3) break;
      const match = rule.check(signals);
      if (match && !this.isDismissed(match.dismissKey)) {
        results.push(match);
      }
    }

    return results;
  }

  dismiss(id: string): void {
    this.dismissed.add(id);
    localStorage.setItem("ah-dismissed-suggestions", JSON.stringify([...this.dismissed]));
  }

  private collectSignals(): StateSignals {
    const agents = [...this.store.agents.values()]
      .filter(a => a.id !== OFFICE_MANAGER_ID && a.id !== HERMES_ID && a.id !== WIZARD_ID);

    return {
      agentsHired: agents.length,
      agentNames: agents.map(a => a.name),
      agentRoles: agents.map(a => a.role),
      agentSkills: agents.flatMap(a => a.skills ?? []),
      hasManager: agents.some(a => a.role === "manager"),
      hasDevOps: agents.some(a => a.role === "devops"),
      tasksCompleted: /* from achievements stat */,
      everGivenTask: agents.some(a => a.tasksDone > 0),
      platformsConnected: this.store.platformStates
        .filter(p => p.connected).map(p => p.platform),
      mcpServersConfigured: agents.filter(a => a.mcpServers?.length).length,
      mcpAuthPending: /* count agents with authType but no key */,
      walletsProvisioned: agents.filter(a => a.cdpSolana || a.crossmintWallet).length,
      marketplaceVisits: parseInt(localStorage.getItem("ah-market-visits") ?? "0"),
      officeManagerChats: parseInt(localStorage.getItem("ah-om-chats") ?? "0"),
      sessionStartTime: this.store.sessionStartTime,
    };
  }
}
```

---

## 9. Email Re-engagement Detail (Layer 2)

### Server-side cron

```
Daily at 09:00 UTC:
  1. Query Supabase: users where last_active_at is between X and Y days ago
     - Day 2: last_active_at between 1.5 and 2.5 days ago
     - Day 5: between 4.5 and 5.5 days ago
     - Day 10: between 9.5 and 10.5 days ago
     - Day 14: between 13.5 and 14.5 days ago
     - Day 25: between 24.5 and 25.5 days ago
  2. For each user:
     a. Fetch user state (agents, tasks, onboarding text)
     b. Check if re-engagement email already sent for this window
     c. Generate personalized content
     d. Send via Resend
     e. Record send in heights_cloud_reengagement_log
```

### New table

```sql
CREATE TABLE public.heights_cloud_reengagement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email_type TEXT NOT NULL,  -- 'day2', 'day5', 'day10', 'day14', 'day25'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, email_type)  -- one per type per user
);
```

### Personalization

The email content is personalized using the user's onboarding text and agent
roster. This can be done two ways:

**Option A: Template-based (simple, no AI cost)**
Pre-written templates with variable substitution:
```
Hi {name},

Your AI office at Agent Heights is set up and ready.

{agentName} is at their desk, waiting for their first task.
You mentioned you're a {onboardingSummary} — {agentName} can help
with {suggestedTasks}.

Just enter your office and type something in the Office Feed.

[Enter Office →]
```

**Option B: AI-generated (richer, costs ~$0.001 per email)**
Use the LLM to generate a personalized message:
```
System: Write a short, friendly re-engagement email for a user who
said they are "{onboardingText}". They have {agentCount} agents
named {agentNames}. They have completed {tasksCompleted} tasks.
Suggest one specific task they could try. Keep it under 100 words.
```

Recommendation: **Start with Option A, upgrade to Option B if open rates
are low.** Template-based is free and immediate. AI-generated is better but
requires cost monitoring.

### Unsubscribe

Every email includes an unsubscribe link that sets a `reengagement_opt_out`
flag on the user's profile. If opted out, no re-engagement emails are sent
(but transactional emails like billing/deletion still are).

---

## 10. Office Manager Concierge Detail (Layer 3)

### Trigger conditions

The system evaluates triggers every 60 seconds during an active WebSocket
session. A trigger fires if:
- The condition is met
- At least 5 minutes have passed since the last nudge
- The user hasn't dismissed this nudge type (localStorage)
- Max 3 nudges per session

| Trigger ID | Condition | Nudge Type |
|---|---|---|
| `first_task_gap` | `stage === "seeded"`, idle 2+ min | "Give your agent a task" |
| `return_from_absence` | `daysSinceLastSession >= 3`, first session back | "Welcome back" |
| `parallel_hire` | `tasksCompleted >= 5`, `agentsHired === 1` | "Hire a second agent" |
| `manager_hire` | `tasksCompleted >= 10`, `hasManager === false` | "Hire a manager" |
| `platform_connect` | `tasksCompleted >= 1`, `platformsConnected === 0` | "Connect a platform" |
| `mcp_auth` | `mcpAuthPending > 0`, agent idle | "Connect your agent's tools" |
| `marketplace_browse` | `tasksCompleted >= 3`, `marketplaceVisits === 0` | "Browse the marketplace" |
| `wallet_setup` | `tasksCompleted >= 20`, `walletsProvisioned === 0` | "Give an agent a wallet" |

### Nudge generation flow

```
1. Trigger condition met
2. Build context: { stage, signals, onboardingText, agentRoster, taskBoard }
3. Send to LLM with concierge system prompt:
   "You are the Office Manager. Generate a short (1-2 sentence) friendly
   suggestion for the boss based on their current state. Be specific to
   their use case. Be warm, not demanding. Do not use tools."
4. Receive nudge text
5. Send `office_manager_nudge` ServerMsg to client:
   { type: "office_manager_nudge", text: "...", action: "focus_agent" | "open_marketplace" | ... }
6. Client shows speech bubble from Office Manager
7. If clicked, opens Office Manager chat with nudge as context
```

### Server message

```typescript
// shared/types.ts
| { type: "office_manager_nudge"; text: string; action?: string }
```

### Client handling

```typescript
// client/src/store.ts
case "office_manager_nudge": {
  this.officeManagerNudge = msg.text;
  this.officeManagerNudgeAction = msg.action;
  this.officeManagerNudgeListeners.forEach(fn => fn(msg.text, msg.action));
  break;
}
```

The HUD shows the nudge as a speech bubble above the Office Manager's desk.
If the user is not near the Office Manager, a subtle indicator appears on
the minimap or a small toast: "The Office Manager wants to talk to you."

---

## 11. Implementation Phases

### Phase 0: Agent Reaction System (Layer 0)
**Effort:** ~150 lines
**Files:**
- New: `client/src/ui/agent-reactions.ts` (reaction table + lookup)
- Modified: `client/src/store.ts` (hook into achievement unlock flow, post feed messages)
- Modified: `client/src/game/scene.ts` (crown placement sequence — agents face trophy case)

**Delivers:** Agents react in-character when the boss achieves milestones. Zero
AI cost. Instant personality. The office feels alive. This is the highest
impact-to-effort ratio of any phase.

### Phase 1: Suggestion Engine + Next Steps Panel (Layer 1)
**Effort:** ~400 lines
**Files:**
- New: `client/src/ui/suggestion-engine.ts`
- Modified: `client/src/ui/hud.ts` (add Next Steps panel, post-event toasts)
- Modified: `client/src/store.ts` (track session start time, market visits, OM chats, outside world visits)

**Delivers:** Users always see 1-3 next steps in the HUD. Post-event toasts
guide users after key milestones. Includes outside world exploration suggestions.
No server changes needed.

### Phase 2: Email Re-engagement (Layer 2)
**Effort:** ~300 lines + 1 migration
**Files:**
- New: `server/engagement-cron.ts`
- Modified: `server/email.ts` (add `sendReengagementEmail()`)
- Modified: `server/index.ts` (start cron job)
- New: `supabase/migrations/20250819000001_reengagement_log.sql`

**Delivers:** Inactive users receive personalized emails at day 2, 5, 10, 14,
and 25. Template-based personalization (Option A). Unsubscribe support.

### Phase 3: NPC Speech Bubbles (Layer 1 enhancement)
**Effort:** ~200 lines
**Files:**
- Modified: `client/src/game/scene.ts` (speech bubble rendering for NPCs)
- Modified: `client/src/ui/suggestion-engine.ts` (proximity-based suggestions)

**Delivers:** Hermes and Office Manager proactively show speech bubbles with
suggestions when the player walks near them.

### Phase 4: Stats Panel (Pillar 1 — Undeniably Skilled)
**Effort:** ~200 lines
**Files:**
- Modified: `client/src/ui/hud.ts` (add stats panel to settings or as standalone overlay)
- Modified: `client/src/store.ts` (aggregate achievement stats for display)

**Delivers:** A visible stats panel showing outside world depth, creatures killed,
weapons collected, tasks completed, agents managed. The "combat record"
equivalent. Makes skill visible as numbers.

### Phase 5: Return-from-outside world Reactions (Layer 0 enhancement)
**Effort:** ~100 lines
**Files:**
- Modified: `client/src/ui/agent-reactions.ts` (add return-from-outside world reactions)
- Modified: `client/src/game/scene.ts` (snapshot state on outside world entry, diff on return)

**Delivers:** Agents react when the boss returns from the outside world with a new
weapon or after a kill. Bridges the two halves of the fantasy.

### Phase 6: Office Manager Concierge (Layer 3)
**Effort:** ~500 lines
**Files:**
- New: `server/engagement.ts` (UserEngagementTracker)
- Modified: `server/manager.ts` (start tracker on session, evaluate triggers)
- Modified: `shared/types.ts` (add `office_manager_nudge` ServerMsg)
- Modified: `client/src/store.ts` (handle nudge message)
- Modified: `client/src/ui/hud.ts` (render nudge as speech bubble)

**Delivers:** AI-generated, personalized nudges from the Office Manager based
on real-time user state. The most powerful but also the most complex layer.

### Phase 7: AI-Generated Email Content (Layer 2 enhancement)
**Effort:** ~100 lines
**Files:**
- Modified: `server/engagement-cron.ts` (use LLM for email content generation)

**Delivers:** Richer, more personalized re-engagement emails. Only worth doing
if template-based emails have low open/click rates.

### Phase 8: Pricing Model Update
**Effort:** ~300 lines + 1 migration
**Files:**
- Modified: `server/stripe.ts` (add $0.99 one-time checkout, rework tier logic)
- Modified: `shared/types.ts` (rework SubscriptionTier, add entry concept)
- Modified: `client/src/payment.ts` (update payment overlay for one-time entry)
- Modified: `client/src/ui/hud.ts` (update billing panel messaging)
- New: `supabase/migrations/20250819000002_entry_fee.sql` (re-enable entrance_paid)

**Delivers:** $0.99 one-time entry fee replaces old Starter subscription. Free tier
can hire but not run tasks. Entry tier gets usage credit. Starter ($3.99/mo)
and Pro ($19.99/mo) subscriptions replace the old Starter/Pro tiers. Subscription
only sold to users who have already experienced agent value.

---

## 12. Metrics & Success Criteria

### What to measure

| Metric | How | Target |
|---|---|---|
| D1 retention | % of users who return on day 2 | 40%+ (from ~20% baseline) |
| D7 retention | % of users who return within 7 days | 25%+ |
| First-task rate | % of users who complete 1 task within first session | 60%+ |
| Platform connection rate | % of active users with 1+ platform connected | 30%+ |
| Email open rate | Open tracking on re-engagement emails | 25%+ |
| Email click rate | Click tracking on "Enter Office" link | 10%+ |
| Nudge dismissal rate | % of nudges dismissed without action | <40% (if higher, nudges are annoying) |
| Suggestion click rate | % of Next Steps suggestions clicked | 30%+ |
| Outside world visit rate | % of users who enter the outside world within first session | 40%+ |
| First-kill rate | % of outside world visitors who kill a creature | 20%+ |
| Agent reaction engagement | % of users who interact with feed after an agent reaction | 50%+ |
| Entry fee conversion | % of free users who pay $0.99 entry fee | 15%+ |
| Entry-to-subscription | % of entry users who subscribe to Starter | 30%+ |

### A/B testing

- **Suggestion engine on/off:** Compare retention with and without the Next
  Steps panel for new users
- **Email timing:** Test day 2 vs day 1 for first re-engagement email
- **Nudge frequency:** Test 5-min vs 10-min minimum interval between nudges
- **Template vs AI email:** Compare open rates between Option A and Option B

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Nudges feel naggy / annoying | Rate limit (max 1 per 5 min, 3 per session). Always dismissible. Track dismissal rate. |
| Suggestions are irrelevant | Layer 3 uses LLM with full context. Layer 1 rules are conservative — only suggest when signal is strong. |
| Email lands in spam | Use Resend with verified domain. Include unsubscribe link. Monitor bounce rate. |
| Users feel surveilled | All suggestions are framed as helpful, not monitoring. No "we noticed you haven't..." language. |
| LLM cost for nudges | Rate-limited to 3 per session. ~$0.001 per nudge. At 1000 DAU, max $3/day. |
| Over-guidance kills exploration | "Power" stage users get minimal suggestions. Panel is collapsible. All nudges dismissible. |
| Agent reactions feel forced | Keep reactions short, varied, and in-character. Random agent selection prevents repetition. Not every achievement needs a reaction. |
| Outside world combat too hard | PROGRESSION.md already has a gentle curve. Tennis racket joke weapon ensures even unskilled players can fight. |
| $0.99 entry fee reduces signups | Keep free tier generous — can hire agents, explore outside world, play golf. Entry fee only gates task execution. |
| Usage credit too small | $0.50 funds 5-15 tasks on cheap models. Enough to feel value. Monitor and adjust. |

---

## 14. Relationship to Existing Systems

| System | How guidance integrates |
|---|---|
| Achievements | Achievements celebrate past actions. Guidance suggests future actions. Agent reactions make achievements feel *seen.* Three systems, one flow: unlock → react → suggest next. |
| Onboarding prompt | The onboarding text ("What do you do?") feeds into personalization for all layers. Currently stored but unused after initial recommendation. |
| Office Manager chat | Layer 3 uses the same LLM infrastructure (`runOfficeManagerKnowledgeChat`). Nudges are just shorter, proactive versions of the same conversation. |
| Email system | Layer 2 adds new email types to the existing Resend integration. Same branded templates, same fire-and-forget pattern. |
| Marketplace | Suggestions can direct users to the marketplace (`open_marketplace` action). Marketplace visit counter feeds back into suggestion logic. |
| Task board | Task completion events trigger post-event toasts. Task board state feeds into Office Manager nudge context. |
| Gamification | The guidance system IS the gamification — it turns "use a product" into "play a game where the game tells you what to do next." |
| Outside world progression | Outside world exploration signals feed into suggestion rules. Agent reactions bridge outside world achievements back to the office. Stats panel makes outside world skill visible. See `docs/PROGRESSION.md` for the full progression chain. |
| Narration system | Auto-screenshot + post to Telegram/Discord when major achievements unlock. Uses existing `server/narration.ts` infrastructure. |
| Pricing / Stripe | $0.99 one-time entry fee replaces old Starter subscription. `entrance_paid` field already exists in `user_payments`. New tiers: Starter ($3.99/mo) and Pro ($19.99/mo). |

---

## 15. Future Extensions

- **Social proof:** "3 other users with your stack hired [Agent Name] this week"
- **Office tours:** Let power users share their office setup as a template for new users
- **Daily challenges:** "Today's challenge: have your agent write a unit test" — gamified tasks that guide usage
- **Streak tracking:** "You've given a task every day for 7 days. Keep it up!"
- **Agent-initiated chat:** Agents proactively message the boss when they find something interesting ("Hey boss, I found a bug in the codebase while reviewing...")
- **Community feed:** See what other users' agents are working on (opt-in) — social motivation
- **Public trophy room:** Shareable URL showing your office, trophies, stats, and outside world achievements
- **Outside world leaderboards:** Deepest explorers, fastest crown runs, most creatures slain — competitive recognition
- **Speedrun timer:** Track time from first golf club pickup to crown placement. Display in hall of fame.
- **Office visits:** Let other players visit your office and see your crown, weapon rack, and stats
- **Auto-screenshot achievements:** Major achievement unlocks trigger `server/narration.ts` to capture and post a screenshot to the user's configured Telegram/Discord
- **Combined score:** outside world conquest + office productivity = overall "boss rating" leaderboard
- **Visual prestige:** Office exterior changes after major milestones. Crown icon above player sprite. Weapon rack display in office.
- **Agent weapon gifting:** Give an outside world weapon to an agent — their robot uses it on expeditions. Ties outside world progression to the Expeditions system.
