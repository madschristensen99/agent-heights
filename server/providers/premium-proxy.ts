/**
 * Premium service proxy — wraps Circle marketplace x402-protected API services
 * as agent tools. When an agent calls a premium tool, the proxy:
 *
 *   1. Checks the user's monthly spend vs usageCap (blocks if over budget)
 *   2. Pays for the API call via Circle Gateway (USDC, zero gas)
 *   3. Records the cost to api_usage_records (flows into existing budget)
 *   4. Returns the response to the agent
 *
 * Users never hold crypto — Agent Heights pays and passes the cost through
 * to their subscription usage budget.
 */

import type { AgentTool } from "@cline/sdk";
import { payAndFetchWithPrice, isCircleGatewayConfigured } from "./circle-gateway.js";
import { getMonthlySpend } from "../usage.js";
import { getUsageCap } from "../usage.js";
import type { SubscriptionTier } from "../../shared/types.js";

/** Maximum allowed cost per single API call (USD). */
const MAX_COST_PER_CALL = parseFloat(process.env.CIRCLE_MAX_COST_PER_CALL ?? "0.50");

/** Maximum premium API calls per task (prevents runaway spend). */
const MAX_PREMIUM_CALLS_PER_TASK = parseInt(process.env.CIRCLE_MAX_CALLS_PER_TASK ?? "20", 10);

export interface PremiumToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface CircleServiceConfig {
  /** Human-readable name for the service (e.g. "weather-api"). */
  name: string;
  /** The x402-protected API endpoint URL. */
  endpoint: string;
  /** Price per call in USD (used for budget checking + recording). */
  pricePerCall: number;
  /** Human-readable description of the service. */
  description: string;
  /** Tool definitions exposed by this service. */
  tools: PremiumToolDef[];
}

/**
 * Context needed for budget checking and cost recording per task run.
 * Passed from the manager when loading tools.
 */
export interface PremiumProxyContext {
  userId: string;
  agentId: string;
  agentName: string;
  subscriptionTier: SubscriptionTier | null;
  /** Called to record the cost of a premium API call. */
  onPremiumUsage?: (params: {
    userId: string;
    agentId: string;
    agentName: string;
    serviceName: string;
    cost: number;
    task?: string;
  }) => void;
}

/**
 * Load premium service tools for an agent.
 * Each tool checks the user's budget before making a paid API call.
 */
export async function loadPremiumTools(
  services: CircleServiceConfig[],
  proxyCtx: PremiumProxyContext,
): Promise<AgentTool<any, any>[]> {
  if (!isCircleGatewayConfigured()) {
    console.warn("[premium-proxy] Circle Gateway not configured — premium tools disabled");
    return [];
  }

  const allTools: AgentTool<any, any>[] = [];
  let taskCallCount = 0;

  for (const service of services) {
    for (const def of service.tools) {
      // Prefix tool name with service name to avoid collisions
      const toolName = `${service.name}__${def.name}`;

      allTools.push({
        name: toolName,
        description: `[Premium: $${service.pricePerCall}/call] ${def.description}`,
        inputSchema: def.inputSchema ?? { type: "object", properties: {} },
        async execute(input: any) {
          // Per-task call limit
          taskCallCount++;
          if (taskCallCount > MAX_PREMIUM_CALLS_PER_TASK) {
            throw new Error(
              `[PREMIUM LIMIT] ${taskCallCount} premium API calls in this task — budget exhausted. ` +
              `Do NOT retry. Report to the boss that the premium API call limit was reached.`,
            );
          }

          // Per-call cost ceiling
          if (service.pricePerCall > MAX_COST_PER_CALL) {
            throw new Error(
              `[PREMIUM ERROR] Service ${service.name} costs $${service.pricePerCall}/call ` +
              `which exceeds the per-call ceiling of $${MAX_COST_PER_CALL}. Blocked for safety.`,
            );
          }

          // Budget check — compare monthly spend vs usage cap
          const cap = getUsageCap(proxyCtx.subscriptionTier);
          if (cap > 0) {
            const spend = await getMonthlySpend(proxyCtx.userId);
            if (spend + service.pricePerCall >= cap) {
              throw new Error(
                `[BUDGET EXCEEDED] Monthly usage cap reached ($${spend.toFixed(2)} / $${cap.toFixed(2)}). ` +
                `This premium API call would cost $${service.pricePerCall}. ` +
                `Upgrade your plan to continue using premium services.`,
              );
            }
          }

          // Build the full URL with query params from input (for GET-style APIs)
          // or we pass the input as the request body for POST-style APIs.
          // The x402 protocol works with any HTTP method — GatewayClient.pay()
          // handles the 402 → sign → retry flow for the URL.
          let url = service.endpoint;
          const inputObj = input ?? {};

          // If the tool schema has parameters, append them as query string
          // This is a simple approach — services can also use POST bodies
          // but the x402 GatewayClient.pay() works with URL-based requests
          const queryParams = Object.entries(inputObj)
            .filter(([, v]) => v !== undefined && v !== null && v !== "")
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join("&");

          if (queryParams) {
            url += (url.includes("?") ? "&" : "?") + queryParams;
          }

          console.log(`[premium-proxy] calling ${service.name}.${def.name} ($${service.pricePerCall}/call) for user ${proxyCtx.userId}`);

          // Pay and fetch
          const result = await payAndFetchWithPrice(url, service.pricePerCall);

          if (result.error) {
            console.error(`[premium-proxy] ${service.name}.${def.name} failed: ${result.error}`);
            return `[ERROR] Premium API ${service.name}.${def.name} failed: ${result.error}`;
          }

          if (result.status !== 200) {
            console.error(`[premium-proxy] ${service.name}.${def.name} returned status ${result.status}`);
            return `[ERROR] Premium API ${service.name}.${def.name} returned HTTP ${result.status}`;
          }

          // Record the cost to api_usage_records via the callback
          if (proxyCtx.onPremiumUsage && result.cost > 0) {
            proxyCtx.onPremiumUsage({
              userId: proxyCtx.userId,
              agentId: proxyCtx.agentId,
              agentName: proxyCtx.agentName,
              serviceName: service.name,
              cost: result.cost,
            });
          }

          // Format the response for the agent
          if (typeof result.data === "string") {
            return result.data;
          }
          try {
            return JSON.stringify(result.data, null, 2);
          } catch {
            return String(result.data);
          }
        },
      });
    }
  }

  console.log(`[premium-proxy] loaded ${allTools.length} premium tools from ${services.length} service(s) for agent ${proxyCtx.agentId}`);
  return allTools;
}
