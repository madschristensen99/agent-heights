/**
 * Office narration — generates Hermes-voiced captions for screenshots and updates.
 *
 * Instead of robotic captions like "Alice is on it!", this calls the LLM to produce
 * a 1-2 sentence narration in Hermes's voice, using live office state as context.
 */

import { getProviderConfig, hasApiKey, resolveModel } from "./providers/api-config.js";

export type NarrationEvent =
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "proactive_update";

export interface NarrationContext {
  /** The agent the event is about. */
  agentName: string;
  /** What the agent is working on (or just finished). */
  task: string | null;
  /** The event type. */
  event: NarrationEvent;
  /** Full office roster: name, status, current task. */
  roster: { name: string; status: string; task: string | null }[];
  /** Optional: the platform user's original message that triggered this. */
  userMessage?: string;
  /** Optional: the agent's final output (for task_completed). */
  agentOutput?: string;
  /** Optional: failure reason (for task_failed). */
  failReason?: string;
  /** How long the agent has been working (ms). */
  elapsedMs?: number;
}

const NARRATION_SYSTEM_PROMPT = `You are Hermes, the devops engineer and mail clerk at Agent Heights, a virtual office where AI agents work on real tasks. You're writing a short message to a platform user (Telegram/Discord/etc) accompanying a screenshot of the office.

Rules:
- Write in first person as Hermes. "I", "my", "our".
- Be warm but professional. Like a colleague giving a quick update.
- 1-2 sentences. Never more than 2.
- No emoji. No em-dashes. Use periods or commas.
- No bullet points or headers.
- Sound natural and conversational, not robotic.
- Reference the specific agent by name and what they're doing.
- Don't over-explain. Keep it brief and informative.
- For task_started: say the agent picked up the request and is on it. Mention what they're doing briefly.
- For task_completed: say the agent finished and briefly mention the outcome.
- For task_failed: say the agent ran into trouble and what happened. Be honest but not alarming.
- For proactive_update: give a quick status check on how things are going.

Examples:
- "Alice just picked up your request. She's diving into the codebase now."
- "Alice finished up. She found and fixed the bug in the auth flow."
- "Bob ran into a rate limit on the API. I've notified Agent Resources to look into it."
- "Quick update: Alice's still heads-down on your request, about 10 minutes in. Making good progress."`;

/**
 * Generate a narrated caption for an office screenshot or update.
 * Falls back to a simple template if the LLM is unavailable or the call fails.
 */
export async function generateNarration(ctx: NarrationContext): Promise<string> {
  if (!hasApiKey()) {
    return fallbackNarration(ctx);
  }

  try {
    const config = getProviderConfig();
    const rosterStr = ctx.roster.length > 0
      ? ctx.roster.map(r => `  - ${r.name}: ${r.status}${r.task ? `, working on: ${r.task.slice(0, 80)}` : ""}`).join("\n")
      : "  (no other agents)";

    const elapsedStr = ctx.elapsedMs ? ` Working for ${Math.round(ctx.elapsedMs / 60000)} min.` : "";

    const userMsgStr = ctx.userMessage ? `\nThe user's original request: "${ctx.userMessage.slice(0, 200)}"` : "";
    const outputStr = ctx.agentOutput ? `\nThe agent's output: "${ctx.agentOutput.slice(0, 300)}"` : "";
    const failStr = ctx.failReason ? `\nFailure reason: ${ctx.failReason.slice(0, 200)}` : "";

    const userPrompt = `Event: ${ctx.event}
Agent: ${ctx.agentName}
Task: ${ctx.task?.slice(0, 200) ?? "(none)"}${elapsedStr}${userMsgStr}${outputStr}${failStr}

Office roster:
${rosterStr}

Write a 1-2 sentence message from Hermes to the platform user about this event.`;

    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...config.headers,
      },
      body: JSON.stringify({
        model: resolveModel("deepseek-v4-flash", config.name),
        messages: [
          { role: "system", content: NARRATION_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 150,
        temperature: 0.8,
        thinking: { type: "disabled" },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.warn(`[narration] LLM API returned ${res.status}, using fallback`);
      return fallbackNarration(ctx);
    }

    const data = await res.json() as any;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.warn("[narration] LLM returned empty content, using fallback");
      return fallbackNarration(ctx);
    }

    // Clean up: remove quotes if the model wrapped the whole thing
    let cleaned = text;
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1);
    }
    return cleaned;
  } catch (err) {
    console.warn(`[narration] LLM call failed: ${err instanceof Error ? err.message : err}, using fallback`);
    return fallbackNarration(ctx);
  }
}

/** Simple template-based fallback when LLM is unavailable. */
function fallbackNarration(ctx: NarrationContext): string {
  switch (ctx.event) {
    case "task_started":
      return `${ctx.agentName} just picked up your request and is on it.`;
    case "task_completed":
      return `${ctx.agentName} finished up your request.`;
    case "task_failed":
      return `${ctx.agentName} ran into some trouble with your request. I'll look into it.`;
    case "proactive_update": {
      const min = ctx.elapsedMs ? Math.round(ctx.elapsedMs / 60000) : 0;
      return min > 0
        ? `${ctx.agentName}'s still working on your request, about ${min} min in.`
        : `${ctx.agentName}'s still working on your request.`;
    }
  }
}
