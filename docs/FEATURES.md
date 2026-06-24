# Agent HQ — Feature Roadmap

Ideas for making the office more alive and more useful. Status legend:
✅ implemented · 🔜 planned · 💡 idea

---

## ✅ Personalities that show

Job titles aren't just flavor text anymore — each title (Code Gremlin, Docs Bard,
Yak Shaver…) carries a personality line that gets baked into the agent's system
prompt. The Docs Bard answers with dramatic flourish, the Merge Medic triages
calmly, the Yak Shaver mentions the detours it resisted. Pure prompt change,
instant charm.

*Where:* `PERSONALITIES` in `server/manager.ts`.

## ✅ Break room behavior

Agents who finish a task don't just snap back to idle — they wander over to the
coffee machine, water cooler, or sofa, linger a few seconds, then drift back to
normal office life. Zero AI work, big liveliness gain.

*Where:* `BREAK_SPOTS` in `client/src/game/agent.ts` (client-only).

## ✅ Walk up and chat (E to talk, for real)

Walk up to an agent and press **E** (or use the chat box in their panel) to say
something that *isn't* a work task — a question, feedback, banter. The message
goes into the agent's one ongoing session with a "this is a chat, not a task"
wrapper, so no tools run, and the agent remembers the conversation in later
tasks.

*Where:* `chat` message in `shared/types.ts`, `AgentManager.chat()` in
`server/manager.ts`, chat input in `client/src/ui/hud.ts`.

## ✅ Agents that hand work to each other

When assigning a task, pick "when done, hand off to…" and the finishing agent's
result (plus a pointer to their workspace) is forwarded to the next agent as a
new task. Chain Pixel → Mocha and watch a pipeline of real agents run across
the office.

*Where:* `handoffTo` on the assign message; handoff logic at the end of
`AgentManager.runTask()`.

## ✅ A manager agent

Hire an agent with the **Manager** role. Give the manager a big goal and instead
of doing the work, it looks at who's free, breaks the goal into one subtask per
suitable worker, and assigns them through the normal task path. The office
self-organizes while you watch.

*Where:* `role` on `AgentInfo`; planning prompt + JSON-plan parsing +
delegation in `server/manager.ts`.

---

## 🔜 Live workspace window

A "monitor view" when you click an agent's desk: file tree of their
`ag/workspace/<slug>/`, tail of what they just wrote, a diff since the task
started. The server already knows each cwd; needs a small file-listing message
and a HUD panel.

## 🔜 End-of-day standup

A button (or a 5pm in-game clock) where everyone huddles and each agent's
session is asked for a one-line summary of what it did today, posted to the
feed. Cheap, and gives the office a heartbeat.

## 💡 Office economy / scoreboard

Tasks award coins (sized by turns or tokens used — the Claude result message
includes usage). Spend coins on cosmetic desk upgrades from the existing
tileset. `tasksDone` is already tracked; this turns it into a game loop.

## 💡 Git integration per workspace

Auto-`git init` each agent workspace and commit after every task with the task
as the message. Free undo, free history, and a future "review their PR"
mechanic.

## 💡 Job board / queue

Instead of refusing tasks when someone's busy, post them on a corkboard; idle
agents grab the top item. Turns the office into a real task queue.
