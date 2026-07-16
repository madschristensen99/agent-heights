# AGENT HEIGHTS — Product & Monetization Strategy

*The multi-agent manager that people actually enjoy opening.*

---

## 1. What this product is

Agent Heights turns multi-agent orchestration into a place. Instead of a wall of
terminal panes or a YAML pipeline, your AI agents are pixel-art coworkers in an
office you walk around in. You hire them, brief them in a huddle, watch them
walk to their desks and type, chat with them, chain them into handoffs, and read
everything they did in one feed. Underneath the charm is a real orchestration
runtime: every character is a live Cline agent session routed through the
Swarms API with persistent memory, its own workspace on disk, role prompts,
and an exportable audit trail.

**One-liner:** *Sims for AI agents — except the work is real.*

### Why it can win

| Conventional agent tooling | Agent Heights |
| --- | --- |
| Dashboards, logs, DAGs | A game world your brain parses instantly |
| "Which run is stuck?" → grep | The stuck agent is literally standing there with a red dot |
| Multi-agent = config files | Multi-agent = hiring a second coworker |
| Demos are screenshots | Demos are *clips people share* — the office sells itself |
| Onboarding: read the docs | Onboarding: WASD to walk, E to talk |

The ambient-visibility angle matters beyond charm: managing 5–50 concurrent
agents is fundamentally a *situational awareness* problem, and a spatial world
with status colors, monitors, and movement is a genuinely better dashboard than
a table of run IDs.

### Who it's for (in order of adoption)

1. **AI-curious developers** — already pay for LLM APIs; want a delightful
   cockpit for parallel agents. (Beachhead. They have keys, they have Twitter.)
2. **Indie hackers & agencies** — run agent "staff" (researcher → writer →
   reviewer pipelines) for client work; need the audit trail and exports.
3. **Teams** — shared offices where teammates see each other's agents working;
   the office becomes the team's agent ops room.
4. **Educators & streamers** — the most legible way ever made to teach/show
   what agents do. Free marketing tier.

---

## 2. Business model overview

Two revenue engines that compound:

```
  SUBSCRIPTIONS  (seats, features, office size)     ← predictable base
+ USAGE          (managed inference, compute hours) ← scales with success
─────────────────────────────────────────────────────
  blended margin: software-like on subs, ~20–30% on usage
```

Key structural choice: **BYOK-first** (bring your own Swarms API key).
- BYOK keeps our COGS near zero on Free/Pro → high-margin subscriptions.
- A **managed-keys option** (we provision inference, billed as credits) is the
  usage engine: zero-setup onboarding for non-technical users, ~25% markup on
  inference at list price.
- This dual structure means we never lose a customer over pricing model: tinkers
  use their own keys; companies who want one invoice buy credits.

---

## 3. Subscription tiers

### 🟢 Free — "Solo Office" ($0 forever)
The open-source core, local-first. This is the growth engine, not a crippled trial.
- Run locally with your own keys/CLIs (exactly what exists today)
- Up to **3 concurrent agents** working at once (hire as many as you want)
- One office map, full memory & persistence, JSON export
- Community Discord
- *Goal: maximum top-of-funnel, GIFs, GitHub stars. No credit card, ever.*

### 🔵 Pro — $19/mo (or $190/yr)
For the individual power user. Unlock the ceiling and the conveniences.
- **Unlimited concurrent agents**
- **Cloud sync**: offices, saves, and transcripts follow you across machines
- **Hosted offices** (we run the server; share a URL, manage from your phone)
- Agent templates & role library (reviewer, researcher, QA, scraper…)
- Scheduled tasks ("every morning, Mocha summarizes HN")
- Pipelines/handoff chains of any depth + conditional handoffs
- Custom office maps & cosmetic packs (also à la carte, see §5)
- Priority support
- *Anchor math: one good agent run saves an hour. $19 is < 1 hour of anyone's time.*

### 🟣 Team — $39/user/mo (min 3 seats)
The multiplayer office. This is where retention gets structural.
- Everything in Pro, plus:
- **Shared offices**: teammates appear as characters; everyone sees all agents,
  feeds, and handoffs in real time
- Roles & permissions (who can hire/fire/change settings; spend limits per member)
- Shared agent memory policies + shared workspace volumes
- Slack/GitHub/Linear integrations (agent posts PR → ping channel)
- SSO (Google/GitHub), centralized billing, 90-day audit log retention
- *The wedge: a team that watches its agents together stops churning.*

### ⬛ Enterprise — custom ($15k+ /yr)
- Self-hosted or VPC deployment of the multiplayer server
- SAML/SCIM, RBAC, unlimited audit retention, compliance exports
- Private model endpoints (Bedrock/Vertex/Azure routing)
- Custom branding (your office, your logo on the wall — they will pay for this)
- SLA + dedicated support
- *Sell the audit trail and the sandbox policy, not the pixels.*

---

## 4. Usage-based pricing (the second engine)

### 4.1 Managed inference — "HQ Credits"
For users who don't want to manage API keys (most of the world):
- Buy credits ($10 / $50 / $200 packs, or monthly auto-refill)
- We meter actual provider cost per task and charge **cost + ~25%**
- Live "payroll" UI in-game: each agent shows what it has spent today —
  cost-awareness presented as the office budget (on-theme and genuinely useful)
- Tier-gated free credit drip: Pro includes $5/mo of credits to seed usage

### 4.2 Hosted compute hours
Cloud-hosted offices run agent sandboxes (containers) on our infra:
- Free: shared, throttled sandboxes
- Pro: 100 sandbox-hours/mo included, then $0.10–0.25/hr by size
- Team/Enterprise: pooled hours + dedicated runners option

### 4.3 Overage philosophy
Never hard-stop a paying user mid-task. Soft caps + "your office worked
overtime this month" email with one-click top-up. Usage anxiety kills agent
products; predictable bills with caps users set themselves build trust.

---

## 5. Secondary monetization (margin-rich, demand-proven by gaming)

- **Cosmetics**: character packs, office themes (space station, wizard tower,
  noir detective floor), seasonal items. $3–8 one-time. Pure margin, zero
  effect on utility — the Fortnite lesson applied to dev tools.
- **Template marketplace**: creators publish agent roles, pipelines, and office
  setups; we take 20%. Turns power users into stakeholders.
- **"Office cam" embeds**: read-only live view of your office for streams,
  status pages, or team TVs (Pro feature that doubles as advertising).

---

## 6. Growth strategy

### Phase 1 — Open-source wildfire (months 0–6)
- OSS the local core (MIT or BSL — decide before launch; BSL protects the
  hosted business). README GIF of a huddle → desks → typing is the entire pitch.
- Launch: Show HN, Product Hunt, X/Twitter clips. The product is inherently
  screen-recordable — every user is a marketing channel.
- Ship template gallery early so "hello world" is impressive (e.g., one-click
  "research office": scraper → analyst → writer pipeline).
- KPI: GitHub stars, weekly active offices, clips shared.

### Phase 2 — Cloud + Pro (months 4–10)
- Hosted offices = the convenience conversion (no terminal, share a link).
- Convert at the moment of felt pain: 4th concurrent agent, second machine,
  "I want this running while my laptop is closed."
- In-product upgrade moments, never paywalls mid-task.
- KPI: free→Pro conversion (target 3–5%), managed-credit attach rate.

### Phase 3 — Multiplayer teams (months 8–18)
- Shared offices land team subscriptions; integrations (GitHub/Slack/Linear)
  make agents visible where work already lives — each integration is a
  retention hook and an acquisition surface ("what's this Agent Heights link?").
- Agency program: white-label offices for client deliverables.
- KPI: team seats, seat expansion rate, logo retention.

### Phase 4 — Platform (18+ months)
- Marketplace GA, public API ("hire an agent into my office via REST"),
  provider partnerships (bundled credits with model vendors), education SKU.
- The long-game position: **the default front-end for agent fleets**, the way
  Slack became the front-end for SaaS notifications.

### Moats being built, in order
1. **Brand/meme energy** — the office is recognizable in one frame.
2. **Memory & history** — months of agent conversations and audit trails are
   high-friction to abandon.
3. **Multiplayer** — teams churn slower than individuals.
4. **Marketplace** — creators' income depends on the platform.

---

## 7. Pricing/packaging principles (the fine print that matters)

- **Gate concurrency, not headcount.** "Hire as many as you want, N work at
  once" feels generous, scales with value delivered, and maps to our real costs.
- **BYOK is never punished.** Pro is fully usable on your own keys; credits are
  a convenience, not a tax. This keeps the dev community on-side.
- **The free tier must stay genuinely fun** — it's the marketing budget.
- **Annual default at checkout** (2 months free) for cash-flow.
- **Price the audit trail to enterprises**, the convenience to individuals, and
  the multiplayer to teams. Same product, three different "jobs to be done."

## 8. Honest risks

- **Platform risk**: LLM providers could ship official multi-agent UIs.
  Counter: stay provider-neutral via Swarms API (the office runs any model
  side by side), move fast on multiplayer + marketplace, own the fun.
- **Novelty decay**: pixel charm gets a user in the door; only real utility
  (memory, pipelines, audit, scheduling) keeps them. Ship utility relentlessly.
- **Usage margin pressure**: inference prices fall ~10x/18mo. Fine — credits
  are a convenience layer, not the core margin; subscriptions carry the model.
- **Security headlines**: an agent product that runs shell commands will
  eventually star in someone's blog post. Invest early in sandbox defaults,
  spend limits, and a disclosed-by-design audit story — make safety a selling
  point, not a liability.

## 9. North-star metric

**Weekly Active Offices (WAO)** — an office with ≥1 completed agent task this
week. It captures the whole loop: hired agents, real work, user came back.
Everything in §6 exists to move WAO; everything in §3–5 exists to monetize it.
