# Aspiration Fulfillment Plan

> **Status**: Planning document. The aspiration *detection* layer (scoring, profiling, personalization) is implemented. This document covers the *fulfillment* layer — gameplay mechanics, content, and rewards that make each aspiration track feel fundamentally different to play.

## Background

Agent Heights has an aspirational profiling system that detects which of six tracks a user resonates with: **Warrior**, **Builder**, **Explorer**, **Puzzle Solver**, **Creator**, and **Strategist**. The system tracks signals, computes exponentially-decayed scores, and personalizes concierge nudges, suggestion ordering, NPC speech, and achievement emphasis.

**The problem**: The personalization is surface-level. A Builder and a Warrior have the same tools, the same game loop, and the same content. The system can *detect* what you like but can't *deliver* a fundamentally different experience. This plan closes that gap.

## Track Reference

| Track | Fantasy | Inspiration | Core Emotion |
|-------|---------|-------------|--------------|
| Warrior / Conqueror | Slay beasts, conquer the world, top the leaderboard | Diablo, Risk | Power, dominance, competition |
| Builder / Engineer | Design automation, watch your factory run, optimize throughput | Factorio, Satisfactory | Satisfaction, efficiency, "it works without me" |
| Explorer / Scientist | Discover new tools, experiment, find breakthroughs | KSP, No Man's Sky | Curiosity, discovery, "what if I try..." |
| Puzzle Solver | Decompose problems elegantly, find optimal solutions | Portal, Baba Is You | Cleverness, "aha!" moments, wit |
| Creator / Community | Express identity, decorate, socialize, collect | Sims, Animal Crossing | Self-expression, belonging, charm |
| Strategist | Grow an empire, make strategic trade-offs, climb ranks | Civilization, Stellaris | Long-arc progression, strategic depth |

## Current State by Track

### Warrior — Well Served
- Creatures, bosses, weapons (iron sword, void blade, legendary), crown, speedrun timer
- 6 biomes, golf, tennis, flower collecting, tree chopping, leprechaun trades
- Combat achievements, leaderboards (deepest explorers, most creatures slain, boss rating, fastest crown)
- **Verdict**: Strong. Real gameplay depth. Users can spend hours in the world.

### Builder — Weak
- Agent handoffs, schedules (cron-based), task boards, think loop
- **Missing**: Visual pipeline graph, automation dashboard, "while you were away" report, compound schedule chains, efficiency scoring
- **Verdict**: Has the plumbing but not the experience. A Builder user runs out of things to optimize quickly.

### Explorer — Medium
- Marketplace browsing, MCP server installation, agent hiring/firing, world generation, 6 biomes
- **Missing**: Experiment log, A/B config comparison, tech tree for MCP servers, discovery notifications, sandbox mode
- **Verdict**: Some exploration satisfaction from marketplace and world gen, but no systematic experimentation loop.

### Puzzle Solver — Weak
- Task decomposition (but Office Manager does it *for* the user), capability gap analysis, phase gates, V-model, card dependencies
- **Missing**: User-driven decomposition with scoring, optimization challenges, elegant solution recognition, NPC wit
- **Verdict**: Has the structure but the user isn't the one solving anything. Feels like project management, not puzzle solving.

### Creator — Medium
- Office themes, character customization, wardrobe, trophy room (public), office rooms, presenters, limited seasonal events
- **Missing**: Granular decoration, social interactions (comments/likes), deep seasonal events, org branding, agent workspace customization
- **Verdict**: Customization exists but is shallow. A Creator user customizes once and has nothing left to do.

### Strategist — Weak
- Org management, agent hiring/firing, subscription tiers, leaderboards (weekly + all-time)
- **Missing**: Office tech tree, agent growth trajectories, resource allocation decisions, ranking trajectory, org-to-org diplomacy
- **Verdict**: The org system is administrative, not strategic. No game of chess being played.

---

## Phase 1: Shared Infrastructure

> **Effort**: ~600 lines | **Priority**: Highest — foundation for all other phases
>
> These features serve multiple tracks and unlock the rest of the plan.

### 1A. "While You Were Away" Report

**What**: When a user reconnects after >2h absence, generate a summary modal of what happened during their absence.

**Contents**:
- Tasks completed (count, by which agent)
- Agent milestones (first task, 25th task, etc.)
- Leaderboard movement ("↑4 ranks")
- Schedule executions (which schedules fired, results)
- World events (creatures spawned/despawned, time of day changes)
- Aspiration-relevant framing: Builder sees "Your pipeline completed 12 tasks", Warrior sees "3 creatures spawned in the meadow", Strategist sees "You moved up 4 ranks"

**Files**:
- `server/away-report.ts` (new) — compute diff between last-seen state and current state
- `server/index.ts` — on WS connect, if lastActiveAt > 2h ago, generate and send report
- `shared/types.ts` — `away_report` ServerMsg type
- `client/src/store.ts` — `awayReport` state + listener
- `client/src/ui/hud.ts` — modal rendering with aspiration-aware framing

**Serves**: Builder (factory ran while you slept), Strategist (empire grew), Warrior (world changed)

### 1B. Aspiration-Specific External Task Framing

**What**: When a user creates a task, the UI and language adapt to their dominant aspiration.

| Aspiration | Task creation header | Placeholder text | CTA button |
|------------|---------------------|------------------|------------|
| Warrior | "Define your boss fight" | "What challenge will your team conquer?" | "Deploy your squad" |
| Builder | "Design your pipeline" | "What should your factory produce?" | "Start the assembly line" |
| Explorer | "Set up your experiment" | "What do you want to discover?" | "Launch the experiment" |
| Puzzle Solver | "Structure the problem" | "What needs to be solved?" | "Break it down" |
| Creator | "What will you create?" | "Describe your vision" | "Make it happen" |
| Strategist | "Plan your next move" | "What's your strategic objective?" | "Execute the plan" |

**Files**:
- `client/src/ui/hud.ts` — conditional rendering in task creation modal based on `store.aspirationProfile?.dominant`
- `client/src/ui/suggestions.ts` — aspiration-aware suggestion text already partially done

**Serves**: All tracks — makes the core loop feel different immediately with minimal effort

### 1C. Aspiration Unlocks System

**What**: As aspiration scores increase, unlock track-specific features. Creates progression meaning.

**Unlock thresholds** (based on 0.0–1.0 score):

| Feature | Required track | Threshold | Phase |
|---------|---------------|-----------|-------|
| Pipeline graph view | Builder | 0.30 | 2A |
| Automation dashboard | Builder | 0.40 | 2B |
| Experiment log | Explorer | 0.30 | 3A |
| A/B agent comparison | Explorer | 0.45 | 3B |
| Decomposition scoring | Puzzle Solver | 0.30 | 4A |
| Optimization challenges | Puzzle Solver | 0.45 | 4B |
| Office decoration mode | Creator | 0.30 | 5A |
| Social interactions | Creator | 0.40 | 5B |
| Office tech tree | Strategist | 0.30 | 6A |
| Agent growth trajectories | Strategist | 0.40 | 6B |

**Files**:
- `server/aspirations.ts` — `getUnlocks(userId)` function, check cached profile scores against thresholds
- `shared/types.ts` — `AspirationUnlocks` interface, `aspirationUnlocks?` field on snapshot
- `client/src/store.ts` — `aspirationUnlocks` state
- `client/src/ui/hud.ts` — gate features behind unlock checks, show "Unlock at Builder 0.30" tooltips

**Serves**: All tracks — gives aspiration scores tangible meaning beyond a number

---

## Phase 2: Builder Track (Factorio Satisfaction)

> **Effort**: ~1,150 lines | **Priority**: Highest after Phase 1
>
> The Builder track improvements make the core product more satisfying for *every* user, not just Builders. The "watch your factory work" feeling is universally appealing.

### 2A. Visual Pipeline Graph

**What**: A graph view (toggle from task board) showing agents as nodes and handoff relationships as edges. Animated dots flow along edges when tasks transfer. Color-coded by status (green = working, yellow = thinking, gray = idle). Bottlenecks highlighted in red. Throughput numbers on edges.

**Visual design**:
- Agents rendered as circular nodes with avatar + name
- Handoff relationships as directed edges with animated particles
- Current task shown as a label on each node
- Idle agents pulse gray, working agents glow green
- Click a node to select that agent
- Auto-layout using a simple force-directed algorithm

**Files**:
- `client/src/ui/pipeline-graph.ts` (new, ~400 lines) — SVG-based graph rendering, layout, animation
- `client/src/ui/hud.ts` — toggle button between "Board" and "Pipeline" views
- `client/src/style.css` — pipeline graph styles
- Gated behind: Builder unlock at 0.30

**Tech**: SVG overlay (not Phaser) for DOM interactivity. Reuse agent data from store.

### 2B. Automation Dashboard

**What**: A stats panel showing real-time automation metrics.

**Metrics**:
- **Throughput**: tasks/hr (rolling 1h window)
- **Success rate**: % of tasks completed without error
- **Avg completion time**: minutes per task
- **Busiest agent**: agent with most active tasks
- **Idle time %**: aggregate idle time across all agents
- **Automation rate**: % of tasks completed via schedule vs manual assignment
- **Pipeline depth**: longest handoff chain currently active
- **Total tasks completed**: all-time counter

**Files**:
- `server/manager.ts` — `computeAutomationStats()` method, track task start/end timestamps
- `shared/types.ts` — `AutomationStats` interface, `automation_stats` ServerMsg type
- `server/index.ts` — broadcast stats every 30s or on task completion
- `client/src/store.ts` — `automationStats` state
- `client/src/ui/hud.ts` — dashboard panel (toggle from pipeline view)
- Gated behind: Builder unlock at 0.40

### 2C. Compound Schedule Chains

**What**: Schedules can chain — the output of one agent's task becomes the input for the next agent's task. Visual chain builder in the schedule UI.

**Example**: "Every Monday 9am: Agent A researches topic → Agent B writes draft from A's output → Agent C reviews and publishes B's draft"

**Chain builder UI**:
- Drag agents into a sequence
- Each step: select agent + define input mapping (previous output → this task's prompt)
- Set trigger (cron schedule or manual "run chain" button)
- Visual: horizontal flow diagram with agent avatars connected by arrows

**Files**:
- `server/manager.ts` — `executeChain()` method, sequential task creation with output passing
- `shared/types.ts` — `ScheduleChain` interface (steps, trigger, input mappings)
- `client/src/ui/hud.ts` — chain builder UI in schedule modal
- Gated behind: Builder unlock at 0.50 (not in initial unlock table — advanced feature)

### 2D. Efficiency Scoring & Badges

**What**: Score each completed pipeline cycle and award badges.

**Badges**:
- **Perfect Pipeline**: Zero idle time across all agents during the cycle
- **Zero Waste**: No rework or failed tasks during the cycle
- **Speed Run**: Cycle completed in <50% of historical average
- **Full House**: All 8 agents participated in the cycle
- **Smooth Flow**: No task waited >5min for an available agent

**Files**:
- `server/manager.ts` — scoring logic on task completion, check cycle boundaries
- `client/src/game/achievements.ts` — new efficiency badge definitions
- `client/src/ui/hud.ts` — badge notifications in feed
- Gated behind: Builder unlock at 0.30 (basic), advanced badges at 0.50+

---

## Phase 3: Explorer Track (KSP Satisfaction)

> **Effort**: ~1,200 lines | **Priority**: High
>
> Adds depth to the experimentation loop. Satisfies the "what if I try..." curiosity.

### 3A. Experiment Log

**What**: A persistent journal where each agent config change, MCP server install, and model swap is logged with structured hypothesis → experiment → result entries.

**Entry structure**:
```
{
  id, timestamp, userId,
  type: "config_change" | "mcp_install" | "model_swap" | "agent_hire" | "agent_fire",
  hypothesis: string (user-written or auto-suggested),
  setup: { before: ConfigDiff, after: ConfigDiff },
  result: { successRate, avgTime, qualityRating, tasksCompleted },
  verdict: "confirmed" | "refuted" | "inconclusive",
  notes: string
}
```

**UI**: Timeline view with filter by type, sort by date, compare two entries side-by-side. Auto-generate hypothesis suggestions ("Think Claude will be better at research? Track it!").

**Files**:
- `server/experiment-log.ts` (new) — CRUD for experiment entries, auto-detect config changes
- `supabase/migrations/*_experiment_log.sql` — `heights_cloud_experiment_log` table
- `shared/types.ts` — `ExperimentEntry` interface, `experiment_log` ServerMsg types
- `client/src/ui/experiment-log.ts` (new, ~200 lines) — timeline + comparison UI
- `client/src/ui/hud.ts` — tab in achievements modal or standalone modal
- Gated behind: Explorer unlock at 0.30

### 3B. A/B Agent Comparison

**What**: "Fork" an agent — run two copies with different configs on the same task set. Side-by-side results comparison.

**Flow**:
1. User selects an agent, clicks "A/B Test"
2. Configures variant B (different model, different system prompt, different tools)
3. Both agents receive the same tasks for N tasks (user-defined, default 5)
4. Results compared: success rate, avg completion time, output quality (user-rated)
5. User picks the winner, loser is fired

**Files**:
- `server/manager.ts` — fork logic, parallel task dispatch, result collection
- `shared/types.ts` — `ABTest` interface, `ab_test_result` ServerMsg
- `client/src/ui/hud.ts` — A/B setup wizard, comparison results view
- Gated behind: Explorer unlock at 0.45

### 3C. MCP Tech Tree

**What**: MCP servers unlock progressively. Start with basic tools. Unlock advanced ones by completing prerequisites.

**Tree structure**:
```
Tier 1 (available immediately):
  - File System, Web Search, Basic HTTP

Tier 2 (unlock by completing 10 tasks with Tier 1 tools):
  - Notion, Google Drive, GitHub

Tier 3 (unlock by completing 25 tasks with Tier 2 tools):
  - Google Sheets, Slack, Database connectors

Tier 4 (unlock by completing 50 tasks with Tier 3 tools):
  - Custom API builder, Advanced integrations
```

**Files**:
- `server/marketplace.ts` — unlock check logic, tier definitions
- `supabase/migrations/*_mcp_unlocks.sql` — track per-user unlock state
- `client/src/ui/marketplace.ts` — tree view with locked/unlocked nodes, progress bars
- Gated behind: Explorer unlock at 0.30 (tree visible), tiers unlock progressively

### 3D. Discovery Notifications

**What**: When an agent config produces unexpectedly good results, fire a "Breakthrough!" notification.

**Triggers**:
- Success rate >90% on first 3 tasks with a new config
- Completes a task 2x faster than the agent's historical average
- Completes a task 2x faster than any other agent on similar tasks
- MCP server tool call produces unexpected useful output (heuristic: agent references tool output in task completion)

**Files**:
- `server/manager.ts` — breakthrough detection on task completion
- `shared/types.ts` — `breakthrough` ServerMsg type
- `client/src/store.ts` — breakthrough listener
- `client/src/ui/hud.ts` — confetti animation + notification card
- Gated behind: Explorer unlock at 0.30

---

## Phase 4: Puzzle Solver Track (Portal Satisfaction)

> **Effort**: ~950 lines | **Priority**: Medium — mostly reframing existing mechanics
>
> Quick wins. The structure exists; we need to change *who does the thinking* and add *wit*.

### 4A. User-Driven Decomposition Mode

**What**: A mode where the user manually breaks down a goal into subtasks. The system scores the decomposition after agents execute.

**Flow**:
1. User enters a high-level goal ("Build a landing page for my SaaS")
2. Instead of Office Manager auto-decomposing, user creates subtasks manually
3. User defines dependencies between subtasks
4. User assigns agents to subtasks
5. Agents execute
6. System scores the decomposition:
   - **Coverage**: Did the subtasks address all aspects of the goal? (LLM-evaluated)
   - **Parallelism**: Could tasks run concurrently? (based on dependency graph)
   - **Dependency depth**: Shallower = better (longest path in DAG)
   - **Granularity**: Not too coarse (1 task = bad), not too fine (50 tasks = bad)
   - **Execution success**: Did all tasks complete without rework?
7. Score shown as a letter grade (S, A, B, C, D) with breakdown

**Files**:
- `client/src/ui/hud.ts` — decomposition UI (goal input → manual subtask creation → dependency drawing)
- `server/manager.ts` — scoring logic on goal completion
- `client/src/game/achievements.ts` — decomposition grade badges
- Gated behind: Puzzle Solver unlock at 0.30

### 4B. Optimization Challenges

**What**: Periodic challenges with fixed constraints. User finds the optimal solution.

**Example challenge**:
```
"You have 4 agents and 12 tasks with these dependencies:
Task A → B, C → D, E → F, G → H, I → J, K → L
Agent 1: best at research (A, C, E, G, I, K)
Agent 2: best at writing (B, D, F, H, J, L)
Agents 3, 4: generalists

Optimal assignment minimizes total completion time.
Assign tasks to agents. Go."
```

**Scoring**: Compare user's assignment to theoretical optimum (calculated via critical path analysis). Score = (optimal_time / user_time) * 100. 100 = perfect.

**Files**:
- `server/challenges.ts` (new) — challenge generation, optimal solution computation, scoring
- `shared/types.ts` — `Challenge` interface, `challenge_result` ServerMsg
- `client/src/ui/hud.ts` — challenge modal with assignment UI
- Leaderboard integration: closest-to-optimal rankings
- Gated behind: Puzzle Solver unlock at 0.45

### 4C. NPC Personality Overhaul

**What**: Rewrite NPC dialogue to have Portal-style wit — dry, clever, slightly sarcastic. Not mean, but pointed.

**Office Manager lines** (examples):
- "Oh, you assigned all 8 tasks to one agent. Bold strategy. Let me know how that works out."
- "Great news! Three of your agents are idle. The other one is drowning. Just... pointing that out."
- "I see you've created a task with no description. I'm sure your agent will figure out what you want. They're mind readers, right?"
- "Your pipeline has a bottleneck at Agent B. I'd say more, but I think the data speaks for itself."
- "You fired Agent C. They completed 47 tasks for you. Anyway, no judgment here."

**Hermes lines** (examples):
- "Mail's sorted. Nothing urgent. Which is more than I can say for your task board."
- "I'll deliver this message. Unlike some people around here, I actually finish my tasks."
- "All systems running. Your agents? Well, that's a different department."

**Reaction lines** (context-triggered):
- User assigns 5+ tasks to one agent: "Giving [Agent Name] quite the workout, aren't we?"
- User creates a task with no dependencies: "A task that depends on nothing and no one. How philosophical."
- All agents idle for 5+ minutes: "Your team is very well-rested. Perhaps *too* well-rested."

**Files**:
- `server/concierge.ts` — rewrite nudge text with wit
- `client/src/game/scene.ts` — rewrite proximity lines
- `client/src/ui/agent-reactions.ts` — context-triggered reaction lines
- `server/aspirations.ts` — aspiration-aware wit (Builder gets pipeline sarcasm, Warrior gets combat bravado, etc.)
- No gating — personality overhaul applies to all users

### 4D. Elegant Solution Recognition

**What**: When a decomposition results in zero idle time, no rework, and fast completion, fire an "Elegant Solution" celebration.

**Detection criteria** (all must be true):
- All agents had <2min idle time during execution
- Zero tasks required rework or retry
- Total completion time <80% of historical average for similar task counts
- Dependency graph had at least 2 parallel paths

**Files**:
- `server/manager.ts` — elegant solution detection on goal completion
- `client/src/game/achievements.ts` — "Elegant Solution" badge (tiered: Bronze, Silver, Gold based on how many criteria exceeded threshold)
- `client/src/ui/hud.ts` — special celebration animation
- Gated behind: Puzzle Solver unlock at 0.30

---

## Phase 5: Creator Track (Sims / Animal Crossing Satisfaction)

> **Effort**: ~1,450 lines | **Priority**: High for retention
>
> Social loops and customization are the #1 retention driver in life-sim games.

### 5A. Tile-Based Office Decoration

**What**: A decoration mode where users place furniture, plants, rugs, posters, and decorations on a tile grid in their office.

**Decoration categories**:
- **Furniture**: desks, chairs, couches, bookshelves, filing cabinets, whiteboards
- **Plants**: small plants, large plants, hanging plants, flower arrangements
- **Wall decor**: posters, paintings, clocks, motivational signs
- **Flooring**: rugs, mats, tiles patterns
- **Lighting**: desk lamps, floor lamps, string lights
- **Special**: trophy case (shows achievements), helipad model, mini golf set

**Unlock system**: Items unlocked through gameplay:
- Complete 10 tasks → unlock basic furniture
- Complete 50 tasks → unlock plants
- Complete 100 tasks → unlock wall decor
- Hire 5 agents → unlock special items
- 7-day streak → unlock lighting
- Each achievement unlocked → unlock 1 decoration item of choice

**Placement**: Grid-based in the office interior. Click to place, drag to move, right-click to remove. Items snap to tiles. Collision with existing furniture and agent desks.

**Files**:
- `server/office-deco.ts` (new) — validate and persist decoration placements
- `supabase/migrations/*_office_deco.sql` — `heights_cloud_office_decorations` table (user_id, decorations JSON, updated_at)
- `client/src/game/scene.ts` — render decorations on tile grid, placement mode
- `client/src/ui/hud.ts` — decoration palette modal, category tabs, item grid
- `client/src/style.css` — palette styles
- Gated behind: Creator unlock at 0.30

**Tech**: Reuse existing tile/sprite system. Decorations stored as JSON array of `{type, tileX, tileY, variant}`. Rendered as Phaser sprites on the office layer.

### 5B. Social Interactions

**What**: When visiting another user's office, users can leave interactions.

**Interactions**:
- **Sticky note comment**: Leave a short text note on the office wall. Owner sees it next visit. "Love what you've done with the plants!"
- **Like**: Thumbs up on the office. Counter visible to owner. "3 people liked your office"
- **Visitor log**: Auto-tracked. Owner sees "5 visitors this week" with names.
- **Gift**: Send a decoration item to another user. Limited to 1 gift/day.

**Files**:
- `server/social.ts` (new) — comment, like, visitor tracking, gift logic
- `supabase/migrations/*_office_social.sql` — `heights_cloud_office_visitors`, `heights_cloud_office_comments`, `heights_cloud_office_likes` tables
- `shared/types.ts` — social interaction types
- `client/src/ui/hud.ts` — comment box, like button, visitor log view
- `client/src/game/scene.ts` — render sticky notes on office walls when visiting
- Gated behind: Creator unlock at 0.40

### 5C. Seasonal Events

**What**: Limited-time events with themed decorations, challenges, and community goals.

**Event types**:
- **Decorating contest**: "Best Halloween office" — community votes, winner gets exclusive items
- **Community goal**: "Collectively complete 10,000 tasks this week → unlock Golden Office theme for everyone"
- **Limited-time decorations**: Holiday-themed items available only during event
- **Themed challenges**: "Complete 5 tasks with a spooky agent name" during Halloween

**Event calendar**:
- Spring: "Spring Cleaning" — reorganize your office, earn plant decorations
- Summer: "Summer Productivity" — community goal: 50k tasks globally
- Fall: "Harvest" — collect resources in the world, trade for decorations
- Winter: "Year in Review" — showcase your best work, vote on community favorites

**Files**:
- `server/events.ts` (new) — event scheduling, community goal tracking, reward distribution
- `supabase/migrations/*_seasonal_events.sql` — `heights_cloud_events`, `heights_cloud_event_participation` tables
- `shared/types.ts` — event types
- `client/src/ui/hud.ts` — event banner, event modal, community progress bar
- Gated behind: Creator unlock at 0.30 (participation), all users see events

### 5D. Org Branding & Identity

**What**: Custom org identity that appears throughout the game.

**Customization**:
- **Org name**: Already exists, but now shown in NPC dialogue and feed
- **Org emoji/logo**: Pick from curated set, shown on office entrance
- **Color scheme**: Pick primary/accent colors, applied to task cards, feed highlights, office trim
- **Org motto**: Short tagline shown on office entrance and trophy room

**Integration points**:
- Office Manager: "Welcome to [Org Name] HQ. [Motto]"
- Feed: "[Org Name] Feed" header
- Trophy room: "[Org Name] Trophy Room"
- Agent dialogue: Agents refer to the org by name
- Leaderboards: Org name shown alongside username

**Files**:
- `server/manager.ts` — store and serve org branding
- `shared/types.ts` — `OrgBranding` interface (emoji, colors, motto)
- `supabase/migrations/*_org_branding.sql` — add branding columns to orgs table
- `client/src/game/scene.ts` — render org name/emoji on office entrance
- `client/src/ui/hud.ts` — branding settings UI, apply colors to feed/cards
- Gated behind: Creator unlock at 0.30, requires org creation

---

## Phase 6: Strategist Track (Civilization Satisfaction)

> **Effort**: ~1,500 lines | **Priority**: Medium-high — drives long-term engagement
>
> Long-arc progression is what keeps Strategist users engaged for months.

### 6A. Office Tech Tree

**What**: A progression tree where the office itself levels up. XP earned through gameplay. Capabilities unlock at each level.

**XP sources**:
- Task completed: +10 XP
- Agent hired: +50 XP
- Day active (login): +25 XP
- Achievement unlocked: +100 XP
- Schedule executed: +15 XP
- World explored (new biome): +200 XP

**Level thresholds and unlocks**:

| Level | XP Required | Unlock |
|-------|------------|--------|
| 1 | 0 (start) | 3 agents max, basic task board |
| 2 | 500 | 5 agents max, schedules |
| 3 | 1,500 | 6 agents max, handoffs |
| 4 | 3,000 | 7 agents max, phase gates |
| 5 | 5,000 | 8 agents max, V-model |
| 6 | 8,000 | 9 agents max (standing), parallel execution |
| 7 | 12,000 | 10 agents max, compound chains |
| 8 | 20,000 | 12 agents max, A/B testing |
| 9 | 35,000 | 15 agents max, org collaboration |
| 10 | 50,000 | 20 agents max, prestige system |

**Prestige**: At level 10, user can "prestige" — reset office level but keep a permanent badge and +1 agent slot per prestige level.

**Files**:
- `server/office-progression.ts` (new) — XP tracking, level computation, unlock enforcement
- `supabase/migrations/*_office_progression.sql` — `heights_cloud_office_progress` table (user_id, xp, level, prestige_count)
- `shared/types.ts` — `OfficeProgress` interface, `office_progress` ServerMsg
- `client/src/ui/tech-tree.ts` (new, ~250 lines) — visual tree with unlocked/locked nodes, XP bar
- `client/src/ui/hud.ts` — tech tree modal, level badge in header
- Gated behind: Strategist unlock at 0.30 (tree visible), progression applies to all users

### 6B. Agent Growth Trajectories

**What**: Each agent has a visible growth curve showing performance over time.

**Tracked metrics per agent**:
- Success rate (rolling 20-task window)
- Tasks completed (cumulative)
- Avg completion time (rolling 20-task window)
- Specialties emerged (most common task types)
- Efficiency trend (improving/stagnating/declining)

**Visual**: Sparkline in agent detail panel showing success rate over time. "Agent A: 62% → 89% success rate over 47 tasks. Specializes in research."

**Files**:
- `server/manager.ts` — track per-agent task history, compute rolling metrics
- `supabase/migrations/*_agent_history.sql` — `heights_cloud_agent_history` table (agent_id, user_id, task_id, success, duration, timestamp)
- `shared/types.ts` — `AgentGrowth` interface on `AgentInfo`
- `client/src/ui/hud.ts` — sparkline rendering (SVG), growth summary in agent detail
- Gated behind: Strategist unlock at 0.40

### 6C. Resource Allocation Decisions

**What**: A monthly budget of "agent-hours" that forces strategic trade-offs.

**Budget system**:
- Each subscription tier gets a monthly agent-hour budget
- Free: 500 agent-hours/month
- Pro: 2,000 agent-hours/month
- Team: 5,000 agent-hours/month
- Each agent consumes hours when working (1 task ≈ 1-3 hours based on complexity)
- Senior agents (better models) consume 2x hours per task
- User decides: 2 junior agents (efficient) or 1 senior agent (higher quality)?

**Decision points**:
- Hiring: "This senior agent costs 2x hours per task. Hire anyway?"
- Budget warning: "You've used 80% of your monthly budget. 4 days remaining."
- Budget exceeded: Agents go idle until next month or user upgrades

**Files**:
- `server/manager.ts` — budget tracking, hour consumption on task completion
- `supabase/migrations/*_agent_budget.sql` — `heights_cloud_agent_budget` table (user_id, month, hours_used, hours_limit)
- `shared/types.ts` — `BudgetInfo` interface, `budget_update` ServerMsg
- `client/src/ui/hud.ts` — budget bar in header, warning modals, hiring decision prompts
- Gated behind: Strategist unlock at 0.30 (budget visible), enforcement at 0.50+

### 6D. Ranking Trajectory & Diplomacy

**What**: Leaderboard trajectory + org-to-org collaboration.

**Trajectory**:
- 30-day rank history chart ("↑47 ranks this month")
- Projection: "At current pace, you'll reach top 100 in ~12 days"
- Milestone notifications: "You broke into the top 500!"

**Diplomacy**:
- **Agent sharing**: Lend an agent to another org for N tasks
- **Co-completion**: Two orgs collaborate on a shared task (both get credit)
- **Alliance leaderboard**: Alliance of orgs ranked by combined output
- **Alliance chat**: Simple shared chat channel between allied orgs

**Files**:
- `server/leaderboards.ts` — 30-day trajectory computation, rank history storage
- `server/org-collab.ts` (new) — agent sharing, co-completion, alliance management
- `supabase/migrations/*_org_collab.sql` — `heights_cloud_alliances`, `heights_cloud_shared_agents` tables
- `shared/types.ts` — alliance types, trajectory types
- `client/src/ui/hud.ts` — trajectory chart in leaderboards tab, alliance management UI
- Gated behind: Strategist unlock at 0.40 (trajectory), 0.50+ (diplomacy)

---

## Phase 7: Warrior Track Enhancements (Polish)

> **Effort**: ~400 lines | **Priority**: Low — already well-served
>
> Deepen the existing combat/exploration loop with agent-integration.

### 7A. Real-Task Bosses

**What**: Hard multi-agent tasks framed as boss fights with a health bar overlay.

**Detection**: A task with 3+ subtasks, 2+ dependencies, and assigned to multiple agents = "boss fight"

**UI**: Boss bar overlay at top of screen showing:
- Boss name (task title)
- Health bar (completion %)
- Phase indicators (subtask stages)
- "Boss Defeated!" celebration on completion

**Files**:
- `client/src/ui/hud.ts` — boss bar overlay, phase indicators
- `server/manager.ts` — boss detection logic
- Gated behind: Warrior unlock at 0.30

### 7B. Weapon = Tool Proficiency

**What**: Agent's tool count and proficiency maps to a "weapon" in the world.

**Mapping**:
- 1-2 tools: Wooden Sword
- 3-4 tools: Iron Sword
- 5-6 tools: Void Blade
- 7+ tools: Legendary Weapon

**Visual**: Weapon icon shown on agent sprite in the world. Agent's "combat power" in the world scales with tool count.

**Files**:
- `server/manager.ts` — compute weapon tier from tool count
- `shared/types.ts` — `weaponTier` on `AgentInfo`
- `client/src/game/scene.ts` — render weapon icon on agent sprite
- Gated behind: Warrior unlock at 0.30

---

## Phase 8: Integration & Polish

> **Effort**: ~500 lines | **Priority**: Medium — ties everything together

### 8A. Aspiration-Aware Onboarding

**What**: During onboarding, ask 2-3 light questions to seed the profile and skip the cold-start problem.

**Questions** (pick one of two options each):
1. "What sounds more fun?" → "Automating a pipeline" (Builder) vs "Exploring a new tool" (Explorer)
2. "What's your style?" → "Plan every detail" (Puzzle Solver) vs "Jump in and adapt" (Warrior)
3. "What matters most?" → "Expressing your style" (Creator) vs "Climbing the ranks" (Strategist)

**Result**: Seed profile with 0.15-0.20 on selected tracks. Dominant aspiration available after first session instead of after 5 signals.

**Files**:
- `client/src/ui/hud.ts` — onboarding question modal (after first agent hire)
- `server/aspirations.ts` — `seedProfile(userId, answers)` function
- `server/index.ts` — new `seed_aspiration` WS handler
- `shared/types.ts` — `seed_aspiration` ClientMsg

### 8B. Aspiration Switching Detection

**What**: If a user's dominant aspiration shifts over time, acknowledge it smoothly.

**Detection**: Compare dominant aspiration 7 days ago vs today. If different, fire a transition nudge.

**Transition nudge examples**:
- Builder → Explorer: "Looks like you've been exploring new tools lately! Check out the experiment log."
- Warrior → Strategist: "You've been focused on growing your team. The tech tree has new unlocks for you."
- Any → Creator: "You've been customizing a lot! The decoration mode has new items available."

**Files**:
- `server/aspirations.ts` — store 7-day-old dominant in profile, compare on recompute
- `server/concierge.ts` — transition nudge as a special critical nudge
- ~100 lines

### 8C. Aspiration Dashboard

**What**: A profile page showing the user's aspiration data.

**Contents**:
- **Radar chart**: 6-axis chart showing all aspiration scores
- **Dominant aspiration**: Large label with icon
- **Signal history**: Timeline of recent signals (what actions contributed to scores)
- **Unlocks**: List of unlocked features and next unlock progress bars
- **Track summary**: "You've completed 47 Builder-type actions, 12 Explorer-type actions..."
- **Switching history**: If dominant has changed, show timeline of transitions

**Files**:
- `client/src/ui/aspiration-dashboard.ts` (new, ~250 lines) — radar chart (SVG), signal timeline, unlock progress
- `client/src/ui/hud.ts` — dashboard modal, accessible from header
- `shared/types.ts` — `AspirationDetail` interface with signal history

---

## Execution Order

### Sprint 1: Foundation + Builder Core
1. Phase 1A — While You Were Away Report
2. Phase 1B — Aspiration-Specific Task Framing
3. Phase 1C — Aspiration Unlocks System
4. Phase 2A — Visual Pipeline Graph
5. Phase 2B — Automation Dashboard

**Deliverable**: Users see different framing based on aspiration, can view their pipeline visually, and get a return report. Builder track feels real.

### Sprint 2: Puzzle Solver + Explorer Core
1. Phase 4A — User-Driven Decomposition Mode
2. Phase 4C — NPC Personality Overhaul
3. Phase 4D — Elegant Solution Recognition
4. Phase 3A — Experiment Log
5. Phase 3D — Discovery Notifications

**Deliverable**: Puzzle Solver users can decompose and get scored. NPCs have wit. Explorer users can track experiments and get breakthrough notifications.

### Sprint 3: Creator + Strategist Core
1. Phase 5A — Tile-Based Office Decoration
2. Phase 5B — Social Interactions
3. Phase 6A — Office Tech Tree
4. Phase 6B — Agent Growth Trajectories

**Deliverable**: Creator users can decorate and socialize. Strategist users see progression and growth.

### Sprint 4: Depth + Integration
1. Phase 2C — Compound Schedule Chains
2. Phase 2D — Efficiency Scoring & Badges
3. Phase 3B — A/B Agent Comparison
4. Phase 3C — MCP Tech Tree
5. Phase 4B — Optimization Challenges
6. Phase 5C — Seasonal Events
7. Phase 5D — Org Branding
8. Phase 6C — Resource Allocation
9. Phase 6D — Ranking Trajectory & Diplomacy
10. Phase 7A-7B — Warrior Enhancements
11. Phase 8A-8C — Integration & Polish

**Deliverable**: Full depth content for all tracks. Integrated onboarding, switching detection, and dashboard.

---

## Total Effort Estimate

| Phase | Track | Lines | Sprint |
|-------|-------|-------|--------|
| 1 | Shared | ~600 | 1 |
| 2 | Builder | ~1,150 | 1-4 |
| 3 | Explorer | ~1,200 | 2-4 |
| 4 | Puzzle Solver | ~950 | 2 |
| 5 | Creator | ~1,450 | 3-4 |
| 6 | Strategist | ~1,500 | 3-4 |
| 7 | Warrior | ~400 | 4 |
| 8 | Integration | ~500 | 4 |
| **Total** | | **~7,750** | **4 sprints** |

## Key Principle

> The aspiration detection layer we already built is the *nervous system*. This plan builds the *body* — the actual gameplay mechanics that make each aspiration feel different to play. The detection layer without fulfillment is like a personality test that doesn't change your life. This plan makes it change your life.
