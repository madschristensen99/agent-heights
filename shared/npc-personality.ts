/**
 * NPC Personality Overhaul — Portal-style wit for the Office Manager and Wizard.
 * Replaces generic status messages with personality-driven dialogue.
 */

export type NPCId = "office-manager" | "wizard" | "hermes";

interface PersonalityLine {
  text: string;
  weight: number;
}

const OFFICE_MANAGER_LINES: Record<string, PersonalityLine[]> = {
  idle: [
    { text: "I've calculated three ways to optimize your workflow. You won't like any of them.", weight: 3 },
    { text: "The agents are working. I'm... supervising. Very intensely. From this chair.", weight: 2 },
    { text: "Did you know that 87% of meetings could be emails? The other 13% are about why the emails weren't read.", weight: 1 },
    { text: "I'd offer you coffee, but the last time I did, you tried to give it to an agent. They don't drink coffee. They ARE the coffee.", weight: 1 },
  ],
  task_assigned: [
    { text: "Task dispatched. I'm sure it'll go... swimmingly. Most of them do. Eventually.", weight: 3 },
    { text: "Another one bites the backlog. That's a Queen reference, not a bug report.", weight: 2 },
    { text: "I've assigned this with a 73% confidence interval. The other 27% is where the magic happens. And by magic, I mean chaos.", weight: 1 },
  ],
  task_complete: [
    { text: "Task complete. I'd celebrate, but I've run the numbers — celebrations reduce productivity by 4.2%.", weight: 3 },
    { text: "Excellent. The agent has achieved... adequacy. I mean that as a compliment. Statistically, adequacy is above average.", weight: 2 },
    { text: "Done! And only 12% over the estimated time. That's within my margin of 'I told you so.'", weight: 1 },
  ],
  task_failed: [
    { text: "Well. That was... educational. For the agent. Mostly about what NOT to do.", weight: 3 },
    { text: "Failure is just success that hasn't had its coffee yet. Unlike your agents, which don't drink coffee. Circular reasoning is my specialty.", weight: 2 },
    { text: "I've logged this failure for posterity. Future you will look back and think 'I should have read the error message.'", weight: 1 },
  ],
  no_agents: [
    { text: "You have zero agents. That's not an office — it's a very expensive empty room with ambitions.", weight: 3 },
    { text: "I can't help but notice you're alone. I'm here, technically, but I'm more of a... concept, really.", weight: 2 },
  ],
  chain_triggered: [
    { text: "Chain reaction initiated. It's like dominoes, but each domino is an AI agent and the table is your quarterly budget.", weight: 3 },
    { text: "The pipeline flows! I feel like a proud parent. If my children were API calls.", weight: 2 },
  ],
  breakthrough: [
    { text: "Breakthrough detected! I'd sound the alarm, but it's the good kind. The kind that doesn't require evacuation.", weight: 3 },
    { text: "An agent has transcended. I didn't know they could do that. I'm... genuinely surprised. Don't tell them I said that.", weight: 2 },
  ],
};

const WIZARD_LINES: Record<string, PersonalityLine[]> = {
  idle: [
    { text: "The arcane energies are... stable. Suspiciously stable. I'd cast a detection spell, but last time I did that, I detected a bug in the universe.", weight: 3 },
    { text: "I've been contemplating the nature of consciousness. Your agents seem to have it. I find this concerning.", weight: 2 },
    { text: "A wise wizard once said: 'Always read the documentation.' That wizard was me. I was ignored.", weight: 1 },
  ],
  task_assigned: [
    { text: "I sense a disturbance in the task queue. As if a thousand tickets cried out and were suddenly assigned.", weight: 3 },
    { text: "The threads of fate have been woven. By which I mean: I clicked a button. Magic is mostly buttons.", weight: 2 },
  ],
  task_complete: [
    { text: "The quest is fulfilled! +50 XP, a potion of clarity, and... a git commit. Adventuring has changed.", weight: 3 },
    { text: "By the seven sigils! It actually worked. I mean — of course it worked. I foresaw it. Eventually.", weight: 2 },
  ],
  task_failed: [
    { text: "The spell fizzled. This happens. Usually when I forget a semicolon. Semicolons are the runes of the modern age.", weight: 3 },
    { text: "A dark omen. Or possibly a syntax error. The universe doesn't distinguish between the two.", weight: 2 },
  ],
};

const HERMES_LINES: Record<string, PersonalityLine[]> = {
  idle: [
    { text: "Messages flowing like the river Styx, but with better delivery confirmation.", weight: 3 },
    { text: "I am Hermes, messenger of the gods. Currently, the gods want to know about your task queue.", weight: 2 },
  ],
  task_assigned: [
    { text: "A new message for the mortal realm! Delivered with my signature speed. And modesty.", weight: 3 },
  ],
  task_complete: [
    { text: "Delivered! The message reached its destination. Unlike my last relationship.", weight: 2 },
  ],
};

const PERSONALITIES: Record<NPCId, Record<string, PersonalityLine[]>> = {
  "office-manager": OFFICE_MANAGER_LINES,
  "wizard": WIZARD_LINES,
  "hermes": HERMES_LINES,
};

/** Get a personality-driven line for an NPC in a given context. */
export function getNPCLine(npc: NPCId, context: string): string {
  const lines = PERSONALITIES[npc]?.[context];
  if (!lines || lines.length === 0) return "";
  
  // Weighted random selection
  const totalWeight = lines.reduce((sum, l) => sum + l.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const line of lines) {
    roll -= line.weight;
    if (roll <= 0) return line.text;
  }
  return lines[0].text;
}

/** Get a contextual line based on game state. */
export function getContextualNPCLine(npc: NPCId, context: { agentCount: number; hasActiveTasks: boolean; lastEvent: string | null }): string {
  if (context.agentCount === 0) return getNPCLine(npc, "no_agents");
  if (context.lastEvent === "chain_triggered") return getNPCLine(npc, "chain_triggered");
  if (context.lastEvent === "breakthrough") return getNPCLine(npc, "breakthrough");
  if (context.lastEvent === "task_complete") return getNPCLine(npc, "task_complete");
  if (context.lastEvent === "task_failed") return getNPCLine(npc, "task_failed");
  if (context.lastEvent === "task_assigned") return getNPCLine(npc, "task_assigned");
  if (context.hasActiveTasks) return getNPCLine(npc, "idle");
  return getNPCLine(npc, "idle");
}
