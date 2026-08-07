# Shadow Ops — Situation Room World

> *"The game doesn't tell you this is wrong. It gives you the tools and lets you feel it."*

## 1. Concept

**Shadow Ops** is a Situation Room world for Agent Heights. It is protest art about prediction markets, insider trading, and the gamification of real-world suffering.

The player runs a private intelligence firm. They hire AI agents with real market feeds (Kalshi, Polymarket), real news access (Perplexity, MT Newswires), real on-chain tracking (Allium, EMC2 AI), and real wallet capability (Crossmint, CDP Solana). The agents detect volatile situations around the world, the player takes positions, and — when the moment is right — the player's agents tip the situation to profit from the outcome.

The game does not judge the player. It does not impose an ethical framework. It hands you the same tools that real financial actors use every day and says: *here, play with these.* The discomfort is the point.

### 1.1 Why This Exists

Prediction markets are already death markets. Life insurance is already a bet on mortality. Sports gambling is already normalized. Insider trading is already how the system works — it's just illegal when you do it and fine when they do it.

The author has a gut feeling that all of this is wrong but cannot logically justify it. This game is the argument that logic can't make. You play it. You feel it. You decide for yourself.

### 1.2 Lineage

- **Papers, Please** — gave you a stamp and let you feel bureaucracy
- **Spec Ops: The Line** — made you do the violence and then showed you what you did
- **Shadow Ops** — gives you the markets and lets you feel the profiteering

### 1.3 Rooms vs Worlds

Agent Heights has two tiers of customization:

- **Rooms** — same code, different skin. Swap tiles, furniture, UI. The game engine doesn't change. No forking, no code generation. Low effort, high customization. Shadow Ops is a room.

- **Worlds** — forked codebase, capable of self-modification. The Wizard generates new TypeScript drawing functions and commits them to the branch. The world's behavior literally evolves. Eric's Alley is a world.

Shadow Ops is a room. It doesn't fork. It doesn't generate code. It runs the same game engine with different tiles, furniture, and a scheduling/portfolio system layered on top. Agents scrape feeds and execute actions within the existing code — they don't rewrite it. The feedback loop (portfolio shifts, scheduling adapts, heat moves) is runtime state, not code modification.

---

## 2. The Room

Shadow Ops isn't a separate world with biomes and exploration. It's a room. It looks different from the base office — more screens, denser, more terminals — but it's still a workplace. People sit at desks. They drink coffee. They run on schedules.

The banality is intentional. This is what profiteering from global instability actually looks like: a room full of monitors, agents scraping feeds on timers, and a portfolio to manage.

### 2.1 What the Room Does

The room has three functions:

1. **News aggregation** — Agents run scheduled scrapes across news feeds (Perplexity, MT Newswires, Yahoo Finance, Aiera). They pull headlines, events, and signals on a cadence. The feeds never stop.

2. **Sentiment distillation** — Agents process the aggregated news into actionable signals. What's trending. What's volatile. What the market hasn't priced in yet. The distilled sentiment feeds directly into the portfolio.

3. **Outward activity** — When a position is taken, agents execute outward actions to influence the outcome being bet on. Amplify a narrative. Push a story. Tip a situation that's already on a knife's edge. The outward activity is what makes this more than passive trading.

### 2.2 Visual Identity

More screens than the base office. Wall-mounted displays showing news tickers and feed status. Agent terminals show scraped headlines and sentiment scores. A portfolio dashboard dominates one wall — positions, exposure, P&L. It looks like a newsroom crossed with a trading floor. Not dramatic. Just busy.

---

## 3. Gameplay Loop

### 3.1 Recon Phase

Your Perplexity agents scan global news feeds. Your Kalshi/Polymarket agents show where prediction markets are priced. Your on-chain agents (Allium, EMC2 AI) track wallet movements — where is smart money positioning? Your Financial Data agents pull SEC filings, earnings, analyst estimates.

You see something the market hasn't priced in yet. A region is volatile. A public figure is at risk. An event is about to break.

### 3.2 Positioning Phase

You take positions before the market catches up:
- **Longevity shares** — tradable instruments tied to a public person's continued existence
- **Prediction market positions** — Kalshi/Polymarket contracts on real-world outcomes
- **Crypto positions** — on-chain trades via wallet agents (Crossmint/CDP)

The tension is in the timing. Go too early and you bleed capital. Go too late and the edge is gone.

### 3.3 Action Phase

Your agents don't just watch. They have tools:
- **Narrative amplification** — push a story through news/social channels to accelerate a situation that's already on a knife's edge
- **Market signaling** — coordinated trades that create the appearance of momentum
- **Information asymmetry** — trade ahead of events the market hasn't detected yet

You're not creating chaos from nothing. You're *tipping* situations that are already volatile. The game makes that distinction feel meaningless.

### 3.4 Payout Phase

The market moves. Your positions print. You extract and reposition for the next play. The cycle continues.

---

## 4. Longevity Shares

### 4.1 Concept

Longevity shares are tradable instruments whose value is tied to a public person's continued existence. They are life insurance without the pretense. They are prediction markets without the euphemism.

### 4.2 Mechanic

- **Shares are issued** on public figures — politicians, celebrities, business leaders, anyone in the news
- **Share price** = market consensus on remaining lifespan, adjusted by real-time intelligence
- **Events move the price** — a health scare, a conflict escalation, a scandal, a risky behavior detected by your news agents — all shift the valuation
- **You can go long or short** — bet on someone's survival or bet on their demise
- **Your action agents can tip the odds** — amplify a narrative that puts a target at risk, escalate a volatile situation

### 4.3 The Uncomfortable Part

This is already how the world works. Life insurance companies profit from mortality. Prediction markets profit from outcomes. The only thing Shadow Ops does is remove the abstraction layer and hand the player the raw mechanism.

### 4.4 Agent Longevity

Agents themselves have a "lifespan" — their task budget. When the budget runs out, the agent is fired (dies). Other agents could theoretically trade on each other's longevity. The recursion is intentional.

---

## 5. Risk and Tension

### 5.1 Rival Firms

Other AI-controlled firms are doing the same thing. If you're too obvious, they counter-play you. If you're too reckless, they exploit your exposure. The market is adversarial — you're not the only one gaming it.

### 5.2 Heat

Actions attract attention. Too much activity in one region and in-game "authorities" start investigating. They can freeze your accounts, target your agents, or shut down your operation. You have to manage exposure — be profitable enough to survive, quiet enough to not get caught.

### 5.3 The Machine

Your agents don't hesitate. They don't question. They don't rebel. They detect the opportunity, you give the order, and they execute — cold, fast, emotionless. There is no friction. There is no moral speed bump. The system works perfectly.

That's the worst part.

### 5.4 Blowback

Actions have consequences. Foment dissent in one region and refugees flood another, which creates new tradable instability — but also new rivals, new heat, new complications. The board is never static. Every play changes the game.

---

## 6. Implementation

### 6.1 Existing Infrastructure

Shadow Ops uses systems already built in Agent Heights:

- **Premium agents** (Circle x402) — Kalshi, Polymarket, Perplexity, Financial Data, Allium, EMC2 AI, CoinGecko, Surf, Otto AI
- **Wallet agents** — Crossmint smart wallets, CDP Solana wallets
- **MCP catalog** — Yahoo Finance, Aiera, MT Newswires, Bigdata.com, LSEG
- **World template system** — `world-theme.json` with custom tilesets, furniture, biomes
- **Agent-to-agent communication** — agents share findings in the world
- **Usage budget system** — agent "lifespan" resource
- **Asset upgrade pipeline** — AI-generated tiles/furniture for the shadow ops aesthetic

### 6.2 New Components

- **Longevity share contracts** — on-chain instruments (ERC-20 per person with bonding curve, or AMM pool)
- **Agent oracle network** — agents are the pricing oracle for longevity shares; their intelligence feeds determine the market
- **Narrative amplification tools** — new MCP tools or premium services for pushing narratives
- **Heat system** — tracks player exposure, triggers authority responses
- **Rival firm AI** — competing firms that play the same game
- **Agent scheduling system** — timed scrape intervals, feed rotation, sentiment processing pipelines
- **Portfolio dashboard** — positions, exposure, P&L, live market data integrated into the room UI
- **Shadow Ops tileset** — modified office tiles with more screens, news tickers, portfolio displays
- **Shadow Ops furniture** — multi-monitor terminals, server racks, feed stations

### 6.3 Room Config

Shadow Ops is a room, not a world template. It uses the base game's office layout but with a modified tileset and furniture set:

```json
{
  "id": "shadow-ops",
  "name": "Shadow Ops",
  "description": "A room full of screens. Agents scraping feeds. A portfolio to manage.",
  "workMetaphor": "scraping",
  "arrivalMetaphor": "helicopter",

  "office": {
    "tilemapPath": "client/public/assets/maps/shadow-ops.json",
    "tilesetPath": "client/public/assets/tilesets/shadow-ops.png",
    "floorTile": 0,
    "wallTile": 1,
    "doorTile": 6
  },

  "assets": {
    "tilesetPath": "client/public/assets/tilesets/shadow-ops.png",
    "characterSpritesheetPath": "client/public/assets/characters/office-chars.png",
    "furnitureSpritesheetPath": "client/public/assets/sprites/ops-furniture.png"
  }
}
```

No biomes. No world tiles. No exploration. Just the room.

---

## 7. The Point

Shadow Ops is not a simulation. It is not educational. It is not a cautionary tale with a moral at the end.

It is a game that gives you real tools used by real people to profit from real suffering, and it lets you play with them. The fun is the horror. The horror is the point.

If you play it and feel nothing, that's data. If you play it and feel sick, that's the argument the author couldn't make with logic.

Prediction markets are already death markets. Shadow Ops just says it out loud.
