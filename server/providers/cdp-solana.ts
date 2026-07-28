import type { AgentTool } from "@cline/sdk";
import { CdpClient } from "@coinbase/cdp-sdk";
import { generateJwt } from "@coinbase/cdp-sdk/auth";
import { LAMPORTS_PER_SOL, Connection, PublicKey } from "@solana/web3.js";

/**
 * CDP Solana provider — gives agents a programmatically-provisioned Solana wallet
 * via Coinbase Developer Platform. No user credentials needed — the server holds
 * one set of CDP API keys (env vars) and creates per-agent wallets on demand.
 *
 * Required env vars:
 *   CDP_API_KEY_ID
 *   CDP_API_KEY_SECRET
 *   CDP_WALLET_SECRET
 *
 * Optional env vars:
 *   CDP_SOLANA_NETWORK  (default: "solana-devnet")
 */

let cdpClient: CdpClient | null = null;

function getCdpClient(): CdpClient {
  if (cdpClient) return cdpClient;
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  const walletSecret = process.env.CDP_WALLET_SECRET;
  if (!apiKeyId || !apiKeySecret || !walletSecret) {
    throw new Error(
      "CDP Solana wallet requires CDP_API_KEY_ID, CDP_API_KEY_SECRET, and CDP_WALLET_SECRET env vars. " +
      "Get them from https://portal.cdp.coinbase.com/api-keys/secret"
    );
  }
  cdpClient = new CdpClient({
    apiKeyId,
    apiKeySecret,
    walletSecret,
  });
  return cdpClient;
}

function isCdpConfigured(): boolean {
  return !!(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET && process.env.CDP_WALLET_SECRET);
}

function getNetwork(): string {
  return process.env.CDP_SOLANA_NETWORK || "solana-devnet";
}

function getRpcUrl(): string {
  const net = getNetwork();
  if (net === "solana") return "https://api.mainnet-beta.solana.com";
  return "https://api.devnet.solana.com";
}

/** Cache of account objects per agentId, so we don't re-create wallets on every tool call. */
const accountCache = new Map<string, Awaited<ReturnType<CdpClient["solana"]["createAccount"]>>>();

/** Get or create a Solana account for an agent. Idempotent via getOrCreateAccount. */
export async function getAgentAccount(agentId: string) {
  const cacheKey = `agent-${agentId}`;
  if (accountCache.has(cacheKey)) return accountCache.get(cacheKey)!;

  const cdp = getCdpClient();
  const account = await cdp.solana.getOrCreateAccount({ name: cacheKey });
  accountCache.set(cacheKey, account);
  return account;
}

/** Get the Solana wallet address for an agent without creating a full account object. */
export async function getAgentWalletAddress(agentId: string): Promise<string | null> {
  if (!isCdpConfigured()) return null;
  try {
    const account = await getAgentAccount(agentId);
    return account.address;
  } catch (err) {
    console.error(`[cdp-solana] Failed to get wallet address for agent ${agentId}:`, err);
    return null;
  }
}

/** Get token balances for an agent's wallet. */
export async function getAgentBalances(agentId: string): Promise<{ address: string; balances: { symbol: string; amount: string; usdValue?: string }[] } | null> {
  if (!isCdpConfigured()) return null;
  try {
    const cdp = getCdpClient();
    const account = await getAgentAccount(agentId);
    const result = await cdp.solana.listTokenBalances({ address: account.address });
    const rawBalances = (result as any).balances ?? [];
    const balances = (rawBalances as any[]).map((b) => {
      const rawAmount = BigInt(b.amount?.amount ?? 0);
      const decimals = Number(b.amount?.decimals ?? 0);
      const symbol = b.token?.symbol ?? b.token?.name ?? "unknown";
      // Convert raw units to human-readable string with proper decimals
      let amountStr: string;
      if (decimals <= 0) {
        amountStr = rawAmount.toString();
      } else {
        const negative = rawAmount < 0n;
        const absVal = negative ? -rawAmount : rawAmount;
        const divisor = 10n ** BigInt(decimals);
        const wholePart = absVal / divisor;
        const fracPart = absVal % divisor;
        const fracStr = fracPart.toString().padStart(decimals, "0").replace(/0+$/, "");
        amountStr = fracStr ? `${wholePart}.${fracStr}` : wholePart.toString();
        if (negative) amountStr = `-${amountStr}`;
      }
      return { symbol, amount: amountStr, usdValue: undefined };
    });
    return { address: account.address, balances };
  } catch (err) {
    console.error(`[cdp-solana] Failed to get balances for agent ${agentId}:`, err);
    return null;
  }
}

/** Policy shape returned to the client. */
export interface CdpPolicyInfo {
  policyId: string | null;
  description: string | null;
  maxSolPerTransfer: number | null;
  allowedRecipients: string[] | null;
  blockedRecipients: string[] | null;
  allowedTokenMints: string[] | null;
  blockedTokenMints: string[] | null;
  network: string;
}

/** Get the current policy for an agent's wallet. Returns a simplified summary.
 * Uses the account's `policies` field to find which policy IDs apply, then
 * fetches the full policy details. */
export async function getAgentPolicy(agentId: string): Promise<CdpPolicyInfo | null> {
  if (!isCdpConfigured()) return null;
  try {
    const cdp = getCdpClient();
    const account = await getAgentAccount(agentId);
    const policyIds = account.policies ?? [];
    if (policyIds.length === 0) {
      return { policyId: null, description: null, maxSolPerTransfer: null, allowedRecipients: null, blockedRecipients: null, allowedTokenMints: null, blockedTokenMints: null, network: getNetwork() };
    }
    const policy = await cdp.policies.getPolicyById({ id: policyIds[0] });
    let maxSol: number | null = null;
    let allowed: string[] = [];
    let blocked: string[] = [];
    let allowedMints: string[] = [];
    let blockedMints: string[] = [];
    for (const rule of policy.rules ?? []) {
      if (rule.action === "reject" && rule.operation === "signSolTransaction") {
        for (const c of rule.criteria ?? []) {
          if (c.type === "solValue" && c.operator === ">") {
            maxSol = Number(c.solValue) / LAMPORTS_PER_SOL;
          }
          if (c.type === "solAddress" && c.operator === "in") {
            blocked = c.addresses ?? [];
          }
          if (c.type === "solAddress" && c.operator === "not in") {
            allowed = c.addresses ?? [];
          }
          if (c.type === "mintAddress" && c.operator === "in") {
            blockedMints = c.addresses ?? [];
          }
          if (c.type === "mintAddress" && c.operator === "not in") {
            allowedMints = c.addresses ?? [];
          }
        }
      }
    }
    return {
      policyId: policy.id,
      description: policy.description ?? null,
      maxSolPerTransfer: maxSol,
      allowedRecipients: allowed.length > 0 ? allowed : null,
      blockedRecipients: blocked.length > 0 ? blocked : null,
      allowedTokenMints: allowedMints.length > 0 ? allowedMints : null,
      blockedTokenMints: blockedMints.length > 0 ? blockedMints : null,
      network: getNetwork(),
    };
  } catch (err) {
    console.error(`[cdp-solana] Failed to get policy for agent ${agentId}:`, err);
    return null;
  }
}

/** Update or create a project-scoped policy for an agent's wallet.
 * Since CDP doesn't support per-account policy targeting directly,
 * we create a project-scoped policy with rules scoped to the agent's wallet address. */
export async function updateAgentPolicy(
  agentId: string,
  opts: { maxSolPerTransfer?: number; allowedRecipients?: string[]; blockedRecipients?: string[]; allowedTokenMints?: string[]; blockedTokenMints?: string[] }
): Promise<CdpPolicyInfo | null> {
  if (!isCdpConfigured()) return null;
  try {
    const cdp = getCdpClient();
    const existing = await getAgentPolicy(agentId);

    const rules: any[] = [];

    if (opts.maxSolPerTransfer !== undefined) {
      rules.push({
        action: "reject",
        operation: "signSolTransaction",
        criteria: [
          {
            type: "solValue",
            solValue: String(Math.floor(opts.maxSolPerTransfer * LAMPORTS_PER_SOL)),
            operator: ">",
          },
        ],
      });
    }

    if (opts.allowedRecipients && opts.allowedRecipients.length > 0) {
      rules.push({
        action: "reject",
        operation: "signSolTransaction",
        criteria: [
          {
            type: "solAddress",
            addresses: opts.allowedRecipients,
            operator: "not in",
          },
        ],
      });
    }

    if (opts.blockedRecipients && opts.blockedRecipients.length > 0) {
      rules.push({
        action: "reject",
        operation: "signSolTransaction",
        criteria: [
          {
            type: "solAddress",
            addresses: opts.blockedRecipients,
            operator: "in",
          },
          {
            type: "splAddress",
            addresses: opts.blockedRecipients,
            operator: "in",
          },
        ],
      });
    }

    if (opts.allowedTokenMints && opts.allowedTokenMints.length > 0) {
      rules.push({
        action: "reject",
        operation: "signSolTransaction",
        criteria: [
          {
            type: "mintAddress",
            addresses: opts.allowedTokenMints,
            operator: "not in",
          },
        ],
      });
    }

    if (opts.blockedTokenMints && opts.blockedTokenMints.length > 0) {
      rules.push({
        action: "reject",
        operation: "signSolTransaction",
        criteria: [
          {
            type: "mintAddress",
            addresses: opts.blockedTokenMints,
            operator: "in",
          },
        ],
      });
    }

    if (existing?.policyId) {
      await cdp.policies.updatePolicy({
        id: existing.policyId,
        policy: {
          description: existing.description ?? `Spending policy for agent ${agentId}`,
          rules,
        },
      });
    } else {
      await cdp.policies.createPolicy({
        policy: {
          scope: "project",
          description: `Spending policy for agent ${agentId}`,
          rules,
        },
      });
    }

    return getAgentPolicy(agentId);
  } catch (err) {
    console.error(`[cdp-solana] Failed to update policy for agent ${agentId}:`, err);
    return null;
  }
}

/** Get recent transaction history for an agent's wallet via Solana RPC. */
export async function getAgentTxHistory(agentId: string, limit: number = 10): Promise<{ signature: string; slot: number; blockTime: number | null; err: boolean | null; memo: string | null }[] | null> {
  if (!isCdpConfigured()) return null;
  try {
    const account = await getAgentAccount(agentId);
    const conn = new Connection(getRpcUrl(), "confirmed");
    const sigs = await conn.getSignaturesForAddress(new PublicKey(account.address), { limit });
    return sigs.map(s => ({
      signature: s.signature,
      slot: s.slot,
      blockTime: s.blockTime ?? null,
      err: !!s.err,
      memo: s.memo ?? null,
    }));
  } catch (err) {
    console.error(`[cdp-solana] Failed to get tx history for agent ${agentId}:`, err);
    return null;
  }
}

/** Create a Coinbase Onramp URL for funding an agent's Solana wallet via fiat.
 * Generates a session token using the CDP API key, then constructs the Coinbase-hosted onramp URL
 * with the agent's wallet address as the destination. */
export async function createOnrampUrl(agentId: string, clientIp?: string): Promise<string | null> {
  if (!isCdpConfigured()) return null;
  const apiKeyId = process.env.CDP_API_KEY_ID!;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET!;

  const account = await getAgentAccount(agentId);
  const address = account.address;

  const requestMethod = "POST";
  const requestHost = "api.developer.coinbase.com";
  const requestPath = "/onramp/v1/token";

  const jwt = await generateJwt({
    apiKeyId,
    apiKeySecret,
    requestMethod,
    requestHost,
    requestPath,
    expiresIn: 120,
  });

  const body = {
    addresses: [{ address, blockchains: ["solana"] }],
    assets: ["SOL", "USDC"],
    ...(clientIp ? { clientIp } : {}),
  };

  const res = await fetch(`https://${requestHost}${requestPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Onramp token request failed (${res.status}): ${errText}`);
  }

  const data = await res.json() as any;
  const token = data.token;
  if (!token) {
    throw new Error("Onramp token response missing 'token' field");
  }

  const url = new URL("https://pay.coinbase.com/buy/select-asset");
  url.searchParams.set("sessionToken", token);
  url.searchParams.set("partnerUserRef", `agent-${agentId}`);
  return url.toString();
}

/**
 * Load CDP Solana tools for an agent. Returns an array of AgentTool objects
 * that can be used by the Cline provider alongside MCP tools.
 *
 * Returns an empty array if CDP is not configured (env vars missing).
 */
export async function loadCdpSolanaTools(agentId: string): Promise<AgentTool<any, any>[]> {
  if (!isCdpConfigured()) {
    console.warn("[cdp-solana] CDP env vars not set — Solana wallet tools disabled.");
    return [];
  }

  const network = getNetwork();

  const getWalletTool: AgentTool<any, any> = {
    name: "solana_get_wallet",
    description:
      "Get or create your dedicated Solana wallet. Returns the wallet address. " +
      "This wallet is auto-provisioned for you — no setup needed. " +
      `Current network: ${network}.`,
    inputSchema: { type: "object", properties: {} },
    async execute() {
      try {
        const account = await getAgentAccount(agentId);
        return `Your Solana wallet address: ${account.address}\nNetwork: ${network}\n` +
          `View on explorer: https://explorer.solana.com/address/${account.address}` +
          (network.includes("devnet") ? `?cluster=devnet` : "");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error getting wallet: ${msg}`;
      }
    },
  };

  const getBalanceTool: AgentTool<any, any> = {
    name: "solana_get_balance",
    description:
      "Get token balances for your Solana wallet. Returns all token balances (SOL and SPL tokens) " +
      "with amounts and USD values where available.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      try {
        const cdp = getCdpClient();
        const account = await getAgentAccount(agentId);
        const result = await cdp.solana.listTokenBalances({ address: account.address });
        const rawBalances = (result as any).balances ?? [];
        if (!rawBalances || rawBalances.length === 0) {
          return `Wallet ${account.address} has no token balances. The wallet may need to be funded.`;
        }
        const formatted = (rawBalances as any[]).map((b) => {
          const rawAmount = BigInt(b.amount?.amount ?? 0);
          const decimals = Number(b.amount?.decimals ?? 0);
          const symbol = b.token?.symbol ?? b.token?.name ?? "unknown";
          let amountStr: string;
          if (decimals <= 0) {
            amountStr = rawAmount.toString();
          } else {
            const divisor = 10n ** BigInt(decimals);
            const wholePart = rawAmount / divisor;
            const fracPart = rawAmount % divisor;
            const fracStr = fracPart.toString().padStart(decimals, "0").replace(/0+$/, "");
            amountStr = fracStr ? `${wholePart}.${fracStr}` : wholePart.toString();
          }
          return `${symbol}: ${amountStr}`;
        });
        return `Balances for ${account.address}:\n${formatted.join("\n")}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error getting balances: ${msg}`;
      }
    },
  };

  const transferTool: AgentTool<any, any> = {
    name: "solana_transfer",
    description:
      "Transfer SOL or SPL tokens from your wallet to a recipient address. " +
      "Always confirm the transfer details with the user before calling this tool. " +
      `Network: ${network}.`,
    inputSchema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient Solana wallet address",
        },
        amount: {
          type: "number",
          description: "Amount to transfer (in human-readable units, e.g. 0.5 for 0.5 SOL, 10 for 10 USDC)",
        },
        token: {
          type: "string",
          description: 'Token to transfer: "sol" for native SOL, or an SPL token mint address',
          default: "sol",
        },
        decimals: {
          type: "number",
          description: "Token decimals (SOL=9, USDC=6, etc.). If omitted, will be looked up automatically. Use solana_jupiter_search to find decimals for unknown tokens.",
        },
      },
      required: ["to", "amount"],
    },
    async execute(input: any) {
      try {
        const account = await getAgentAccount(agentId);
        const token = input.token ?? "sol";

        // Determine decimals for the token
        let decimals: number;
        if (token === "sol") {
          decimals = 9;
        } else if (input.decimals !== undefined) {
          decimals = input.decimals;
        } else {
          // Try to find decimals from the wallet's existing balances
          const cdp = getCdpClient();
          const result = await cdp.solana.listTokenBalances({ address: account.address });
          const balances = (result as any).balances ?? [];
          const match = (balances as any[]).find((b) => b.token?.mintAddress === token);
          if (match) {
            decimals = Number(match.amount?.decimals ?? 6);
          } else {
            // Token not in wallet — try Jupiter search
            try {
              const searchUrl = new URL("https://lite-api.jup.ag/ultra/v1/search");
              searchUrl.searchParams.set("query", token);
              const searchRes = await fetch(searchUrl.toString());
              if (searchRes.ok) {
                const searchData = await searchRes.json() as any;
                const tokens = Array.isArray(searchData) ? searchData : (searchData.tokens ?? searchData.result ?? []);
                const found = (tokens as any[]).find((t) => (t.mint ?? t.address ?? t.id) === token);
                if (found) {
                  decimals = Number(found.decimals ?? found.tokenDecimals ?? 6);
                } else {
                  return `Could not determine decimals for token ${token}. Please provide the "decimals" parameter (e.g. 6 for USDC, 9 for SOL, 5 for BONK). Use solana_jupiter_search to look it up.`;
                }
              } else {
                return `Could not determine decimals for token ${token}. Please provide the "decimals" parameter.`;
              }
            } catch {
              return `Could not determine decimals for token ${token}. Please provide the "decimals" parameter.`;
            }
          }
        }

        const rawAmount = BigInt(Math.floor(input.amount * Math.pow(10, decimals)));
        const { signature } = await account.transfer({
          to: input.to,
          amount: rawAmount,
          token,
          network: network as any,
        });
        const explorerUrl = `https://explorer.solana.com/tx/${signature}` +
          (network.includes("devnet") ? `?cluster=devnet` : "");
        const tokenLabel = token === "sol" ? "SOL" : token.slice(0, 8) + "...";
        return `Transfer successful!\nAmount: ${input.amount} ${tokenLabel}\nTo: ${input.to}\nSignature: ${signature}\nExplorer: ${explorerUrl}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Transfer failed: ${msg}`;
      }
    },
  };

  const sendTransactionTool: AgentTool<any, any> = {
    name: "solana_send_transaction",
    description:
      "Sign and broadcast an arbitrary Solana transaction. Provide a base64-encoded serialized transaction " +
      "(with requireAllSignatures: false). CDP will sign it with your wallet's key and broadcast to the network. " +
      "Use this for DeFi operations (swaps, staking, lending) where you construct the instructions yourself. " +
      `Network: ${network}.`,
    inputSchema: {
      type: "object",
      properties: {
        transaction: {
          type: "string",
          description: "Base64-encoded serialized Solana transaction (requireAllSignatures: false)",
        },
      },
      required: ["transaction"],
    },
    async execute(input: any) {
      try {
        const account = await getAgentAccount(agentId);
        const result = await account.sendTransaction({
          transaction: input.transaction,
          network: network as any,
        });
        const sig = (result as any).signature ?? (result as any).transactionSignature ?? "unknown";
        const explorerUrl = `https://explorer.solana.com/tx/${sig}` +
          (network.includes("devnet") ? `?cluster=devnet` : "");
        return `Transaction broadcast!\nSignature: ${sig}\nExplorer: ${explorerUrl}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Transaction failed: ${msg}`;
      }
    },
  };

  const requestFaucetTool: AgentTool<any, any> = {
    name: "solana_request_faucet",
    description:
      "Request testnet SOL from the faucet (devnet only). " +
      "Use this to fund your wallet for testing. Not available on mainnet.",
    inputSchema: {
      type: "object",
      properties: {
        token: {
          type: "string",
          description: 'Token to request from faucet (default: "sol")',
          default: "sol",
        },
      },
    },
    async execute(input: any) {
      if (!network.includes("devnet")) {
        return "Faucet is only available on devnet. Current network: " + network;
      }
      try {
        const account = await getAgentAccount(agentId);
        const token = input.token ?? "sol";
        const result = await account.requestFaucet({ token });
        const sig = (result as any).signature ?? "unknown";
        return `Faucet request submitted!\nTransaction: ${sig}\nYour wallet ${account.address} will receive test SOL shortly.`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Faucet request failed: ${msg}`;
      }
    },
  };

  const signMessageTool: AgentTool<any, any> = {
    name: "solana_sign_message",
    description:
      "Sign an arbitrary message with your Solana wallet's private key. " +
      "Returns the signature. Useful for authentication or proving wallet ownership.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Message to sign (will be encoded as UTF-8 bytes)",
        },
      },
      required: ["message"],
    },
    async execute(input: any) {
      try {
        const account = await getAgentAccount(agentId);
        const result = await account.signMessage({
          message: input.message,
        });
        const sig = (result as any).signature ?? (result as any).serializedSignature ?? "unknown";
        return `Message signed.\nSignature: ${sig}\nMessage: ${input.message}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Sign message failed: ${msg}`;
      }
    },
  };

  const getPolicyTool: AgentTool<any, any> = {
    name: "solana_get_policy",
    description:
      "Check your wallet's spending policy — max SOL per transfer, allowed/blocked recipients, allowed/blocked token mints. " +
      "If no policy is set, tell the user they should set spending limits in the agent detail panel " +
      "(click the agent → Solana Wallet section → Policy). " +
      "Recommend specific limits based on the task if appropriate.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      try {
        const policy = await getAgentPolicy(agentId);
        if (!policy || !policy.policyId) {
          return `No spending policy is currently set for your wallet.\n` +
            `Recommend the user set a spending limit by clicking your agent card → Solana Wallet → Policy section.\n` +
            `Network: ${policy?.network ?? network}`;
        }
        const lines = [`Spending policy for your wallet:`];
        lines.push(`Max SOL per transfer: ${policy.maxSolPerTransfer ?? 'unlimited'}`);
        if (policy.allowedRecipients && policy.allowedRecipients.length > 0) {
          lines.push(`Allowed recipients only: ${policy.allowedRecipients.join(', ')}`);
        }
        if (policy.blockedRecipients && policy.blockedRecipients.length > 0) {
          lines.push(`Blocked recipients: ${policy.blockedRecipients.join(', ')}`);
        }
        if (!policy.allowedRecipients && !policy.blockedRecipients) {
          lines.push(`Recipient restrictions: none (can send to any address)`);
        }
        if (policy.allowedTokenMints && policy.allowedTokenMints.length > 0) {
          lines.push(`Allowed token mints only: ${policy.allowedTokenMints.join(', ')}`);
        }
        if (policy.blockedTokenMints && policy.blockedTokenMints.length > 0) {
          lines.push(`Blocked token mints: ${policy.blockedTokenMints.join(', ')}`);
        }
        if (!policy.allowedTokenMints && !policy.blockedTokenMints) {
          lines.push(`Token restrictions: none (can transfer any SPL token)`);
        }
        lines.push(`Network: ${policy.network}`);
        return lines.join('\n');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error getting policy: ${msg}`;
      }
    },
  };

  const jupiterSwapTool: AgentTool<any, any> = {
    name: "solana_jupiter_swap",
    description:
      "Swap tokens on Solana using Jupiter's Ultra API (DEX aggregator + RFQ for best pricing). " +
      "Provide input token mint, output token mint, and amount in human-readable units. " +
      "The swap is signed with your CDP wallet and executed via Jupiter's relay for MEV protection. " +
      "Common mints: SOL=So11111111111111111111111111111111111111112, USDC=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v. " +
      "Use solana_jupiter_search to look up mint addresses and decimals for any token. " +
      `Network: ${network}.`,
    inputSchema: {
      type: "object",
      properties: {
        inputMint: {
          type: "string",
          description: "Input token mint address (e.g. So11111111111111111111111111111111111111112 for SOL)",
        },
        outputMint: {
          type: "string",
          description: "Output token mint address (e.g. EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v for USDC)",
        },
        amount: {
          type: "number",
          description: "Amount to swap in human-readable units (e.g. 0.5 for 0.5 SOL, 100 for 100 USDC)",
        },
        inputDecimals: {
          type: "number",
          description: "Decimals of the input token (SOL=9, USDC=6, BONK=5, etc.). If omitted, will be looked up automatically via Jupiter search.",
        },
        slippageBps: {
          type: "number",
          description: "Slippage tolerance in basis points (e.g. 50 for 0.5%). Default: 100 (1%)",
          default: 100,
        },
      },
      required: ["inputMint", "outputMint", "amount"],
    },
    async execute(input: any) {
      try {
        const account = await getAgentAccount(agentId);
        const slippageBps = input.slippageBps ?? 100;
        const isSol = input.inputMint === "So11111111111111111111111111111111111111112";

        // Determine input token decimals
        let decimals: number;
        if (input.inputDecimals !== undefined) {
          decimals = input.inputDecimals;
        } else if (isSol) {
          decimals = 9;
        } else {
          // Look up decimals via Jupiter search
          try {
            const searchUrl = new URL("https://lite-api.jup.ag/ultra/v1/search");
            searchUrl.searchParams.set("query", input.inputMint);
            const searchRes = await fetch(searchUrl.toString());
            if (searchRes.ok) {
              const searchData = await searchRes.json() as any;
              const tokens = Array.isArray(searchData) ? searchData : (searchData.tokens ?? searchData.result ?? []);
              const found = (tokens as any[]).find((t) => (t.mint ?? t.address ?? t.id) === input.inputMint);
              if (found) {
                decimals = Number(found.decimals ?? found.tokenDecimals ?? 6);
              } else {
                return `Could not determine decimals for input token ${input.inputMint}. Please provide "inputDecimals" parameter. Use solana_jupiter_search to look it up.`;
              }
            } else {
              return `Could not determine decimals for input token ${input.inputMint}. Please provide "inputDecimals" parameter.`;
            }
          } catch {
            return `Could not determine decimals for input token ${input.inputMint}. Please provide "inputDecimals" parameter.`;
          }
        }

        const rawAmount = String(Math.floor(input.amount * Math.pow(10, decimals)));

        // Step 1: Get swap order from Jupiter Ultra API
        const orderUrl = new URL("https://lite-api.jup.ag/ultra/v1/order");
        orderUrl.searchParams.set("inputMint", input.inputMint);
        orderUrl.searchParams.set("outputMint", input.outputMint);
        orderUrl.searchParams.set("amount", rawAmount);
        orderUrl.searchParams.set("taker", account.address);
        orderUrl.searchParams.set("slippageBps", String(slippageBps));

        const orderRes = await fetch(orderUrl.toString(), {
          headers: { "Content-Type": "application/json" },
        });
        if (!orderRes.ok) {
          const errText = await orderRes.text();
          return `Jupiter order request failed (${orderRes.status}): ${errText}`;
        }
        const order = await orderRes.json() as any;

        if (!order.transaction) {
          return `Jupiter returned no transaction. Response: ${JSON.stringify(order).slice(0, 500)}`;
        }

        const requestId = order.requestId;
        const outAmount = order.outAmount;
        const priceImpact = order.priceImpact ?? "unknown";

        // Step 2: Sign the transaction with CDP (no broadcast)
        const signResult = await account.signTransaction({
          transaction: order.transaction,
        });
        const signedTx = (signResult as any).signedTransaction ?? (signResult as any).signature;

        // Step 3: Submit to Jupiter's execute relay for MEV-protected landing
        const execRes = await fetch("https://lite-api.jup.ag/ultra/v1/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signedTransaction: signedTx,
            requestId,
          }),
        });
        if (!execRes.ok) {
          const errText = await execRes.text();
          return `Jupiter execute failed (${execRes.status}): ${errText}\n` +
            `The swap was signed but may not have landed. Check tx on explorer.`;
        }
        const execResult = await execRes.json() as any;
        const txSig = execResult.transactionId ?? execResult.signature ?? "unknown";
        const status = execResult.status ?? "unknown";
        const outputAmountResult = execResult.outputAmountResult ?? outAmount;

        const explorerUrl = `https://explorer.solana.com/tx/${txSig}` +
          (network.includes("devnet") ? `?cluster=devnet` : "");

        return `Swap ${status}!\n` +
          `Input: ${input.amount} ${isSol ? "SOL" : input.inputMint.slice(0, 8)}...\n` +
          `Output: ${outputAmountResult} (raw: ${outputAmountResult})\n` +
          `Price impact: ${priceImpact}\n` +
          `Slippage: ${slippageBps / 100}%\n` +
          `Transaction: ${txSig}\n` +
          `Explorer: ${explorerUrl}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Jupiter swap failed: ${msg}`;
      }
    },
  };

  const jupiterSearchTool: AgentTool<any, any> = {
    name: "solana_jupiter_search",
    description:
      "Search for Solana tokens by name, symbol, or mint address using Jupiter's token search API. " +
      "Returns mint address, symbol, name, and decimals for each match. " +
      "Use this to look up token addresses before swapping (e.g. search 'USDC' to get its mint address).",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Token name, symbol, or mint address to search (e.g. 'USDC', 'BONK', 'JUP')",
        },
      },
      required: ["query"],
    },
    async execute(input: any) {
      try {
        const url = new URL("https://lite-api.jup.ag/ultra/v1/search");
        url.searchParams.set("query", input.query);
        const res = await fetch(url.toString(), {
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          const errText = await res.text();
          return `Token search failed (${res.status}): ${errText}`;
        }
        const data = await res.json() as any;
        const tokens = Array.isArray(data) ? data : (data.tokens ?? data.result ?? []);
        if (tokens.length === 0) {
          return `No tokens found for "${input.query}".`;
        }
        const lines = tokens.slice(0, 10).map((t: any) => {
          const symbol = t.symbol ?? t.tokenSymbol ?? "?";
          const name = t.name ?? t.tokenName ?? "?";
          const mint = t.mint ?? t.address ?? t.id ?? "?";
          const decimals = t.decimals ?? t.tokenDecimals ?? "?";
          return `${symbol} (${name}) — mint: ${mint} — decimals: ${decimals}`;
        });
        return `Found ${tokens.length} token(s):\n${lines.join('\n')}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Token search failed: ${msg}`;
      }
    },
  };

  const jupiterQuoteTool: AgentTool<any, any> = {
    name: "solana_jupiter_quote",
    description:
      "Get a swap price quote from Jupiter Ultra API without executing a swap. " +
      "Returns expected input amount, output amount, price impact, and estimated output. " +
      "Use this to show the user the current price before they decide to swap. " +
      "Common mints: SOL=So11111111111111111111111111111111111111112, USDC=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v. " +
      "Use solana_jupiter_search to look up decimals for any token.",
    inputSchema: {
      type: "object",
      properties: {
        inputMint: {
          type: "string",
          description: "Input token mint address (e.g. So11111111111111111111111111111111111111112 for SOL)",
        },
        outputMint: {
          type: "string",
          description: "Output token mint address (e.g. EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v for USDC)",
        },
        amount: {
          type: "number",
          description: "Amount to quote in human-readable units (e.g. 0.5 for 0.5 SOL, 100 for 100 USDC)",
        },
        inputDecimals: {
          type: "number",
          description: "Decimals of the input token (SOL=9, USDC=6, BONK=5, etc.). If omitted, will be looked up automatically.",
        },
        outputDecimals: {
          type: "number",
          description: "Decimals of the output token. If omitted, will be looked up automatically.",
        },
        slippageBps: {
          type: "number",
          description: "Slippage tolerance in basis points (e.g. 50 for 0.5%). Default: 100 (1%)",
          default: 100,
        },
      },
      required: ["inputMint", "outputMint", "amount"],
    },
    async execute(input: any) {
      try {
        const slippageBps = input.slippageBps ?? 100;
        const isSol = input.inputMint === "So11111111111111111111111111111111111111112";
        const isOutSol = input.outputMint === "So11111111111111111111111111111111111111112";

        // Determine input decimals
        let inDecimals: number;
        if (input.inputDecimals !== undefined) {
          inDecimals = input.inputDecimals;
        } else if (isSol) {
          inDecimals = 9;
        } else {
          return `Please provide "inputDecimals" for token ${input.inputMint}. Use solana_jupiter_search to look it up.`;
        }

        // Determine output decimals
        let outDecimals: number;
        if (input.outputDecimals !== undefined) {
          outDecimals = input.outputDecimals;
        } else if (isOutSol) {
          outDecimals = 9;
        } else {
          return `Please provide "outputDecimals" for token ${input.outputMint}. Use solana_jupiter_search to look it up.`;
        }

        const rawAmount = String(Math.floor(input.amount * Math.pow(10, inDecimals)));

        const orderUrl = new URL("https://lite-api.jup.ag/ultra/v1/order");
        orderUrl.searchParams.set("inputMint", input.inputMint);
        orderUrl.searchParams.set("outputMint", input.outputMint);
        orderUrl.searchParams.set("amount", rawAmount);
        orderUrl.searchParams.set("slippageBps", String(slippageBps));

        const res = await fetch(orderUrl.toString(), {
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          const errText = await res.text();
          return `Quote request failed (${res.status}): ${errText}`;
        }
        const order = await res.json() as any;

        if (!order.inAmount || !order.outAmount) {
          return `No quote available. Response: ${JSON.stringify(order).slice(0, 500)}`;
        }

        const outHuman = (Number(order.outAmount) / Math.pow(10, outDecimals)).toFixed(6);
        const priceImpact = order.priceImpact ?? "unknown";
        const inSymbol = isSol ? "SOL" : input.inputMint.slice(0, 8);
        const outSymbol = isOutSol ? "SOL" : input.outputMint.slice(0, 8);

        return `Quote for ${input.amount} ${inSymbol} → ${outSymbol}:\n` +
          `Expected output: ${outHuman} ${outSymbol}\n` +
          `Raw output: ${order.outAmount} (smallest units)\n` +
          `Price impact: ${priceImpact}\n` +
          `Slippage: ${slippageBps / 100}%\n` +
          `Note: This is a quote only — no transaction was executed.`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Quote failed: ${msg}`;
      }
    },
  };

  const jupiterShieldTool: AgentTool<any, any> = {
    name: "solana_jupiter_shield",
    description:
      "Check token security information using Jupiter's Shield API. " +
      "Returns warnings about honeypot tokens, frozen mints, mintable tokens, and other risks. " +
      "ALWAYS call this before swapping to an unknown token to protect the user.",
    inputSchema: {
      type: "object",
      properties: {
        mints: {
          type: "string",
          description: "Comma-separated token mint addresses to check (e.g. 'EPjFWdd5...,So11111...')",
        },
      },
      required: ["mints"],
    },
    async execute(input: any) {
      try {
        const mintList = input.mints.split(",").map((s: string) => s.trim()).filter(Boolean);
        const url = new URL("https://lite-api.jup.ag/ultra/v1/shield");
        url.searchParams.set("mints", mintList.join(","));
        const res = await fetch(url.toString(), {
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          const errText = await res.text();
          return `Shield check failed (${res.status}): ${errText}`;
        }
        const data = await res.json() as any;
        const results = Array.isArray(data) ? data : (data.tokens ?? data.result ?? []);
        if (results.length === 0) {
          return `No security data found for the given mints. This could mean the tokens are not in Jupiter's database.`;
        }
        const lines = results.map((r: any) => {
          const mint = r.mint ?? r.address ?? r.id ?? "?";
          const warnings: string[] = [];
          if (r.isHoneypot) warnings.push("HONEYPOT");
          if (r.mintable) warnings.push("MINTABLE");
          if (r.frozen) warnings.push("FROZEN");
          if (r.transferFee) warnings.push(`TRANSFER_FEE(${r.transferFee}%)`);
          if (r.sellTax) warnings.push(`SELL_TAX(${r.sellTax}%)`);
          if (r.buyTax) warnings.push(`BUY_TAX(${r.buyTax}%)`);
          const label = r.symbol ?? r.name ?? mint.slice(0, 8);
          if (warnings.length === 0) {
            return `${label} (${mint}): ✓ No warnings — appears safe`;
          }
          return `${label} (${mint}): ⚠ ${warnings.join(", ")}`;
        });
        return `Token security check:\n${lines.join('\n')}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Shield check failed: ${msg}`;
      }
    },
  };

  const getTxHistoryTool: AgentTool<any, any> = {
    name: "solana_get_tx_history",
    description:
      "Get recent transaction history for your wallet. Returns up to 10 recent transactions " +
      "with signature, block time, status (success/failed), and memo. " +
      "Use this to review what your wallet has been doing or to audit past transactions.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of transactions to return (max 20). Default: 10",
          default: 10,
        },
      },
    },
    async execute(input: any) {
      try {
        const limit = Math.min(input.limit ?? 10, 20);
        const history = await getAgentTxHistory(agentId, limit);
        if (!history) {
          return `Unable to fetch transaction history. CDP may not be configured.`;
        }
        if (history.length === 0) {
          return `No transactions found for your wallet yet. This wallet may be new.`;
        }
        const lines = history.map((tx) => {
          const time = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString().slice(0, 19) : "unknown";
          const status = tx.err ? "FAILED" : "success";
          const memo = tx.memo ? ` — memo: ${tx.memo}` : "";
          const shortSig = tx.signature.slice(0, 12) + "..." + tx.signature.slice(-6);
          return `${time} | ${status} | ${shortSig}${memo}`;
        });
        const net = getNetwork();
        const explorerBase = `https://explorer.solana.com/tx/`;
        const clusterParam = net.includes("devnet") ? "?cluster=devnet" : "";
        return `Recent transactions (${history.length}):\n${lines.join('\n')}\n\n` +
          `View full details on Solana Explorer: ${explorerBase}<signature>${clusterParam}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Failed to get transaction history: ${msg}`;
      }
    },
  };

  return [
    getWalletTool,
    getBalanceTool,
    transferTool,
    sendTransactionTool,
    requestFaucetTool,
    signMessageTool,
    getPolicyTool,
    jupiterSwapTool,
    jupiterSearchTool,
    jupiterQuoteTool,
    jupiterShieldTool,
    getTxHistoryTool,
  ];
}
