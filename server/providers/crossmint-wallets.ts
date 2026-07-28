import type { AgentTool } from "@cline/sdk";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Crossmint wallet provider — gives agents a multi-chain smart wallet
 * via Crossmint's wallet infrastructure. No user credentials needed — the
 * server holds one Crossmint API key + server signer secret and creates
 * per-agent wallets on demand.
 *
 * Supports EVM chains (Base, Ethereum, Polygon, etc.) and Solana.
 * Gas fees are sponsored by Crossmint's paymaster — agents don't need
 * native tokens for gas.
 *
 * Required env vars:
 *   CROSSMINT_API_KEY          — server API key from Crossmint console
 *   CROSSMINT_SERVER_SIGNER_SECRET — signer secret for server-side signing
 *
 * Optional env vars:
 *   CROSSMINT_CHAIN            — default chain (default: "base-sepolia")
 *   CROSSMINT_ENVIRONMENT      — "staging" or "production" (default: "staging")
 */

const API_VERSION = "2025-06-09";

function getBaseUrl(): string {
  const env = process.env.CROSSMINT_ENVIRONMENT ?? "staging";
  return env === "production"
    ? "https://www.crossmint.com/api"
    : "https://staging.crossmint.com/api";
}

function getApiKey(): string | null {
  return process.env.CROSSMINT_API_KEY ?? null;
}

function getSignerSecret(): string | null {
  return process.env.CROSSMINT_SERVER_SIGNER_SECRET ?? null;
}

function getDefaultChain(): string {
  return process.env.CROSSMINT_CHAIN ?? "base-sepolia";
}

export function isCrossmintConfigured(): boolean {
  return !!(getApiKey() && getSignerSecret());
}

/** Cache of wallet addresses per agentId. */
const walletCache = new Map<string, { address: string; chainType: string }>();

/** Derive the server signer's EVM address from the secret. */
function getSignerAddress(): string {
  const secret = getSignerSecret();
  if (!secret) throw new Error("CROSSMINT_SERVER_SIGNER_SECRET not set");
  const pk = secret.startsWith("0x") ? secret : `0x${secret}`;
  const account = privateKeyToAccount(pk as `0x${string}`);
  return account.address;
}

/** Get the chain type from a chain identifier. */
function chainToType(chain: string): "evm" | "solana" {
  return chain.includes("solana") ? "solana" : "evm";
}

/** Build the wallet locator for an agent. */
function agentWalletLocator(agentId: string, chain: string): string {
  const chainType = chainToType(chain);
  return `userId:agent-${agentId}:${chainType}:smart`;
}

/** Get or create a Crossmint wallet for an agent. */
export async function getOrCreateAgentWallet(
  agentId: string,
  chain?: string,
): Promise<{ address: string; chainType: string } | null> {
  if (!isCrossmintConfigured()) return null;

  const useChain = chain ?? getDefaultChain();
  const cacheKey = `agent-${agentId}-${useChain}`;
  if (walletCache.has(cacheKey)) return walletCache.get(cacheKey)!;

  const apiKey = getApiKey()!;
  const baseUrl = getBaseUrl();
  const chainType = chainToType(useChain);
  const locator = agentWalletLocator(agentId, useChain);

  // Try to fetch existing wallet first
  try {
    const res = await fetch(`${baseUrl}/${API_VERSION}/wallets/${locator}`, {
      headers: { "X-API-KEY": apiKey },
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const wallet = { address: data.address, chainType };
      walletCache.set(cacheKey, wallet);
      return wallet;
    }
  } catch {
    // Wallet doesn't exist yet — create it
  }

  // Create new wallet
  const signerAddress = getSignerAddress();
  const body: Record<string, unknown> = {
    chainType,
    type: "smart",
    config: {
      adminSigner: {
        type: "server",
        address: signerAddress,
      },
    },
    owner: `userId:agent-${agentId}`,
  };

  const res = await fetch(`${baseUrl}/${API_VERSION}/wallets`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Crossmint wallet creation failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const wallet = { address: data.address, chainType };
  walletCache.set(cacheKey, wallet);
  return wallet;
}

/** Get the wallet address for an agent without creating a full wallet object. */
export async function getAgentWalletAddress(agentId: string): Promise<string | null> {
  if (!isCrossmintConfigured()) return null;
  try {
    const wallet = await getOrCreateAgentWallet(agentId);
    return wallet?.address ?? null;
  } catch (err) {
    console.error(`[crossmint] Failed to get wallet address for agent ${agentId}:`, err);
    return null;
  }
}

/** Get token balances for an agent's wallet. */
export async function getAgentBalances(
  agentId: string,
  tokens?: string[],
): Promise<{ address: string; balances: any[] } | null> {
  if (!isCrossmintConfigured()) return null;
  try {
    const apiKey = getApiKey()!;
    const baseUrl = getBaseUrl();
    const wallet = await getOrCreateAgentWallet(agentId);
    if (!wallet) return null;

    const chain = getDefaultChain();
    const tokenList = tokens ?? ["usdc", "eth", "sol"];
    const locator = agentWalletLocator(agentId, chain);

    const url = new URL(
      `${baseUrl}/${API_VERSION}/wallets/${locator}/balances`,
    );
    url.searchParams.set("tokens", tokenList.join(","));
    if (wallet.chainType === "evm") {
      url.searchParams.set("chains", chain);
    }

    const res = await fetch(url.toString(), {
      headers: { "X-API-KEY": apiKey },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[crossmint] Balance request failed (${res.status}): ${errText}`);
      return { address: wallet.address, balances: [] };
    }

    const data = (await res.json()) as any;
    const balances: any[] = [];

    if (data.nativeToken) {
      balances.push({
        symbol: data.nativeToken.symbol ?? "NATIVE",
        amount: data.nativeToken.balance ?? "0",
        usdValue: data.nativeToken.balanceUSD,
        decimals: data.nativeToken.decimals,
      });
    }

    if (data.tokens && Array.isArray(data.tokens)) {
      for (const t of data.tokens) {
        balances.push({
          symbol: t.symbol ?? "unknown",
          amount: t.balance ?? "0",
          usdValue: t.balanceUSD,
          decimals: t.decimals,
          address: t.address,
        });
      }
    }

    return { address: wallet.address, balances };
  } catch (err) {
    console.error(`[crossmint] Failed to get balances for agent ${agentId}:`, err);
    return null;
  }
}

/** Sign an EVM message with the server signer key. */
async function signApprovalMessage(message: string): Promise<string> {
  const secret = getSignerSecret()!;
  const pk = secret.startsWith("0x") ? secret : `0x${secret}`;
  const account = privateKeyToAccount(pk as `0x${string}`);
  const signature = await account.signMessage({
    message: { raw: message as `0x${string}` },
  });
  return signature;
}

/** Transfer tokens from an agent's wallet to a recipient. */
export async function transferAgentTokens(
  agentId: string,
  to: string,
  amount: string,
  tokenSymbol: string,
  chain?: string,
): Promise<{ txId: string; hash?: string; explorerLink?: string } | null> {
  if (!isCrossmintConfigured()) return null;
  try {
    const apiKey = getApiKey()!;
    const baseUrl = getBaseUrl();
    const useChain = chain ?? getDefaultChain();
    const wallet = await getOrCreateAgentWallet(agentId, useChain);
    if (!wallet) return null;

    const signerAddress = getSignerAddress();
    const tokenLocator = `${useChain}:${tokenSymbol}`;
    const walletLocator = wallet.address;

    // Step 1: Create the transfer transaction
    const createRes = await fetch(
      `${baseUrl}/${API_VERSION}/wallets/${walletLocator}/tokens/${tokenLocator}/transfers`,
      {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: to,
          amount: String(amount),
          signer: `server:${signerAddress}`,
        }),
      },
    );

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Transfer creation failed (${createRes.status}): ${errText}`);
    }

    const txData = (await createRes.json()) as any;
    const txId = txData.id;

    // Step 2: Sign the approval message
    const pendingApproval = txData.approvals?.pending?.[0];
    if (!pendingApproval) {
      // No approval needed — transaction may already be submitted
      return {
        txId,
        hash: txData.transactionHash,
        explorerLink: txData.explorerLink,
      };
    }

    const messageToSign = pendingApproval.message;
    const signature = await signApprovalMessage(messageToSign);

    // Step 3: Submit the approval
    const approveRes = await fetch(
      `${baseUrl}/${API_VERSION}/wallets/${walletLocator}/transactions/${txId}/approvals`,
      {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          approvals: [
            {
              signer: `server:${signerAddress}`,
              signature,
            },
          ],
        }),
      },
    );

    if (!approveRes.ok) {
      const errText = await approveRes.text();
      throw new Error(`Approval submission failed (${approveRes.status}): ${errText}`);
    }

    const approvedData = (await approveRes.json()) as any;
    return {
      txId,
      hash: approvedData.transactionHash ?? approvedData.hash,
      explorerLink: approvedData.explorerLink,
    };
  } catch (err) {
    console.error(`[crossmint] Transfer failed for agent ${agentId}:`, err);
    throw err;
  }
}

/** Check the status of a Crossmint transaction. */
export async function getTransactionStatus(
  agentId: string,
  txId: string,
): Promise<any | null> {
  if (!isCrossmintConfigured()) return null;
  try {
    const apiKey = getApiKey()!;
    const baseUrl = getBaseUrl();
    const wallet = await getOrCreateAgentWallet(agentId);
    if (!wallet) return null;

    const res = await fetch(
      `${baseUrl}/${API_VERSION}/wallets/${wallet.address}/transactions/${txId}`,
      {
        headers: { "X-API-KEY": apiKey },
      },
    );

    if (!res.ok) return null;
    return (await res.json()) as any;
  } catch (err) {
    console.error(`[crossmint] Failed to get tx status for agent ${agentId}:`, err);
    return null;
  }
}

/** Policy shape returned to the client. */
export interface CrossmintPolicyInfo {
  chain: string;
  description: string;
  spendingLimitUsd: number | null;
  allowedRecipients: string[] | null;
  blockedRecipients: string[] | null;
}

/**
 * Get the current policy for an agent's wallet.
 * Crossmint smart wallets enforce policies onchain via the smart contract.
 * For now, we return a description of the wallet's capabilities.
 * Full policy management requires Crossmint's policy API (coming soon).
 */
export async function getAgentPolicy(agentId: string): Promise<CrossmintPolicyInfo | null> {
  if (!isCrossmintConfigured()) return null;
  try {
    const wallet = await getOrCreateAgentWallet(agentId);
    if (!wallet) return null;
    const chain = getDefaultChain();
    return {
      chain,
      description: `Crossmint smart wallet on ${chain}. Policies are enforced onchain via the smart contract.`,
      spendingLimitUsd: null,
      allowedRecipients: null,
      blockedRecipients: null,
    };
  } catch (err) {
    console.error(`[crossmint] Failed to get policy for agent ${agentId}:`, err);
    return null;
  }
}

/** Get recent transaction history for an agent's wallet. */
export async function getAgentTxHistory(
  agentId: string,
  limit: number = 10,
): Promise<any[] | null> {
  if (!isCrossmintConfigured()) return null;
  try {
    const apiKey = getApiKey()!;
    const baseUrl = getBaseUrl();
    const wallet = await getOrCreateAgentWallet(agentId);
    if (!wallet) return null;

    const res = await fetch(
      `${baseUrl}/${API_VERSION}/wallets/${wallet.address}/transactions?limit=${limit}`,
      {
        headers: { "X-API-KEY": apiKey },
      },
    );

    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const txs = Array.isArray(data) ? data : data.transactions ?? data.data ?? [];
    return txs.slice(0, limit);
  } catch (err) {
    console.error(`[crossmint] Failed to get tx history for agent ${agentId}:`, err);
    return null;
  }
}

/** Fund an agent's wallet with USDXM testnet tokens (staging only). */
export async function fundAgentWallet(
  agentId: string,
  amount: number = 10,
): Promise<{ success: boolean; message: string } | null> {
  if (!isCrossmintConfigured()) return null;
  try {
    const apiKey = getApiKey()!;
    const baseUrl = getBaseUrl();
    const chain = getDefaultChain();
    const wallet = await getOrCreateAgentWallet(agentId);
    if (!wallet) return { success: false, message: "Wallet not found" };

    const res = await fetch(
      `${baseUrl}/v1-alpha2/wallets/${wallet.address}/balances`,
      {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Math.min(Math.max(amount, 1), 100),
          token: "usdxm",
          chain,
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, message: `Funding failed (${res.status}): ${errText}` };
    }

    return { success: true, message: `Funded ${amount} USDXM on ${chain}` };
  } catch (err) {
    console.error(`[crossmint] Failed to fund wallet for agent ${agentId}:`, err);
    return { success: false, message: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** Create a Crossmint onramp order and return the payment URL. */
export async function createCrossmintOnrampUrl(
  agentId: string,
): Promise<string | null> {
  if (!isCrossmintConfigured()) return null;
  try {
    const apiKey = getApiKey()!;
    const baseUrl = getBaseUrl();
    const chain = getDefaultChain();
    const wallet = await getOrCreateAgentWallet(agentId);
    if (!wallet) return null;

    const body: Record<string, unknown> = {
      payment: {
        method: "card",
      },
      lineItems: [
        {
          chain,
          token: "usdc",
          quantity: 10,
        },
      ],
      recipient: {
        address: wallet.address,
        chain,
      },
    };

    const res = await fetch(`${baseUrl}/2022-06-09/orders`, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[crossmint] Onramp order failed (${res.status}): ${errText}`);
      return null;
    }

    const data = (await res.json()) as any;
    const url = data?.paymentIntent?.url ?? data?.url ?? data?.order?.url ?? null;
    return url;
  } catch (err) {
    console.error(`[crossmint] Failed to create onramp order for agent ${agentId}:`, err);
    return null;
  }
}

/**
 * Load Crossmint wallet tools for an agent. Returns an array of AgentTool objects
 * that can be used by the Cline provider alongside MCP tools.
 *
 * Returns an empty array if Crossmint is not configured (env vars missing).
 */
export async function loadCrossmintWalletTools(
  agentId: string,
): Promise<AgentTool<any, any>[]> {
  if (!isCrossmintConfigured()) {
    console.warn("[crossmint] Env vars not set — Crossmint wallet tools disabled.");
    return [];
  }

  const chain = getDefaultChain();

  const getWalletTool: AgentTool<any, any> = {
    name: "crossmint_get_wallet",
    description:
      "Get or create your multi-chain smart wallet. Returns the wallet address. " +
      "This wallet is auto-provisioned for you — no setup needed. " +
      `Current chain: ${chain}. Gas fees are sponsored by Crossmint.`,
    inputSchema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description: `Chain to use (default: ${chain}). Examples: base-sepolia, base, ethereum, polygon, solana, solana-devnet`,
        },
      },
    },
    async execute(input: any) {
      try {
        const useChain = input.chain ?? chain;
        const wallet = await getOrCreateAgentWallet(agentId, useChain);
        if (!wallet) return "Error: Could not create wallet.";
        return `Your Crossmint smart wallet address: ${wallet.address}\n` +
          `Chain: ${useChain}\nChain type: ${wallet.chainType}\n` +
          `Gas is sponsored — you don't need native tokens for gas fees.`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error getting wallet: ${msg}`;
      }
    },
  };

  const getBalanceTool: AgentTool<any, any> = {
    name: "crossmint_get_balance",
    description:
      "Get token balances for your wallet. Returns native token and ERC-20/SPL token balances " +
      "with amounts and USD values where available. Gas is sponsored so you don't need " +
      "native tokens to transact.",
    inputSchema: {
      type: "object",
      properties: {
        tokens: {
          type: "string",
          description: "Comma-separated token symbols to check (e.g. 'usdc,eth'). Default: 'usdc,eth,sol'",
        },
      },
    },
    async execute(input: any) {
      try {
        const tokens = input.tokens ? input.tokens.split(",").map((s: string) => s.trim()) : undefined;
        const balData = await getAgentBalances(agentId, tokens);
        if (!balData) return "Error: Could not fetch balances.";
        if (balData.balances.length === 0) {
          return `Wallet ${balData.address} has no token balances. The wallet may need to be funded.`;
        }
        const formatted = balData.balances.map((b: any) => {
          const amount = b.amount ?? "0";
          const symbol = b.symbol ?? "unknown";
          const usd = b.usdValue ? ` ($${b.usdValue})` : "";
          return `${symbol}: ${amount}${usd}`;
        });
        return `Balances for ${balData.address}:\n${formatted.join("\n")}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error getting balances: ${msg}`;
      }
    },
  };

  const transferTool: AgentTool<any, any> = {
    name: "crossmint_transfer",
    description:
      "Transfer tokens from your wallet to a recipient address. " +
      "Always confirm the transfer details with the user before calling this tool. " +
      `Chain: ${chain}. Gas is sponsored by Crossmint.`,
    inputSchema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient wallet address",
        },
        amount: {
          type: "string",
          description: "Amount to transfer (in human-readable units, e.g. '0.5' for 0.5 USDC)",
        },
        token: {
          type: "string",
          description: 'Token symbol to transfer (e.g. "usdc", "eth", "sol"). Default: "usdc"',
          default: "usdc",
        },
        chain: {
          type: "string",
          description: `Chain to use (default: ${chain}). Examples: base-sepolia, base, ethereum, polygon`,
        },
      },
      required: ["to", "amount"],
    },
    async execute(input: any) {
      try {
        const token = input.token ?? "usdc";
        const useChain = input.chain ?? chain;
        const result = await transferAgentTokens(agentId, input.to, input.amount, token, useChain);
        if (!result) return "Transfer failed: could not complete transaction.";
        return `Transfer successful!\n` +
          `Amount: ${input.amount} ${token}\n` +
          `To: ${input.to}\n` +
          `Chain: ${useChain}\n` +
          `Transaction ID: ${result.txId}` +
          (result.hash ? `\nHash: ${result.hash}` : "") +
          (result.explorerLink ? `\nExplorer: ${result.explorerLink}` : "");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Transfer failed: ${msg}`;
      }
    },
  };

  const getPolicyTool: AgentTool<any, any> = {
    name: "crossmint_get_policy",
    description:
      "Check your wallet's spending policy and capabilities. " +
      "Crossmint smart wallets enforce policies onchain via the smart contract. " +
      "Gas is sponsored — you don't need native tokens for transactions.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      try {
        const policy = await getAgentPolicy(agentId);
        if (!policy) return "Error: Could not fetch policy.";
        const lines = [`Wallet policy for your Crossmint smart wallet:`];
        lines.push(`Chain: ${policy.chain}`);
        lines.push(`Description: ${policy.description}`);
        if (policy.spendingLimitUsd) {
          lines.push(`Spending limit: $${policy.spendingLimitUsd}`);
        } else {
          lines.push(`Spending limit: none set (unlimited)`);
        }
        if (policy.allowedRecipients && policy.allowedRecipients.length > 0) {
          lines.push(`Allowed recipients only: ${policy.allowedRecipients.join(", ")}`);
        }
        if (policy.blockedRecipients && policy.blockedRecipients.length > 0) {
          lines.push(`Blocked recipients: ${policy.blockedRecipients.join(", ")}`);
        }
        lines.push(`Gas: sponsored by Crossmint paymaster (no native tokens needed)`);
        return lines.join("\n");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error getting policy: ${msg}`;
      }
    },
  };

  const getTxHistoryTool: AgentTool<any, any> = {
    name: "crossmint_get_tx_history",
    description:
      "Get recent transaction history for your wallet. Returns up to 10 recent transactions " +
      "with transaction ID, status, and details. " +
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
          return `Unable to fetch transaction history. Crossmint may not be configured.`;
        }
        if (history.length === 0) {
          return `No transactions found for your wallet yet. This wallet may be new.`;
        }
        const lines = history.map((tx: any) => {
          const id = tx.id ?? tx.txId ?? "unknown";
          const status = tx.status ?? "unknown";
          const hash = tx.transactionHash ?? tx.hash ?? "";
          const amount = tx.amount ?? "";
          const token = tx.token ?? tx.symbol ?? "";
          const recipient = tx.recipient ?? tx.to ?? "";
          const shortId = id.length > 16 ? id.slice(0, 12) + "..." + id.slice(-4) : id;
          const parts = [`${shortId} | ${status}`];
          if (amount) parts.push(`${amount} ${token}`);
          if (recipient) parts.push(`→ ${recipient.slice(0, 10)}...`);
          if (hash) parts.push(`hash: ${hash.slice(0, 18)}...`);
          return parts.join(" | ");
        });
        return `Recent transactions (${history.length}):\n${lines.join("\n")}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Failed to get transaction history: ${msg}`;
      }
    },
  };

  const checkTxStatusTool: AgentTool<any, any> = {
    name: "crossmint_check_tx_status",
    description:
      "Check the status of a specific transaction by its ID. " +
      "Use this after a transfer to verify it was confirmed onchain.",
    inputSchema: {
      type: "object",
      properties: {
        txId: {
          type: "string",
          description: "Transaction ID returned from a transfer or other operation",
        },
      },
      required: ["txId"],
    },
    async execute(input: any) {
      try {
        const tx = await getTransactionStatus(agentId, input.txId);
        if (!tx) return `Transaction ${input.txId} not found.`;
        const lines = [`Transaction ${input.txId}:`];
        lines.push(`Status: ${tx.status ?? "unknown"}`);
        if (tx.transactionHash) lines.push(`Hash: ${tx.transactionHash}`);
        if (tx.explorerLink) lines.push(`Explorer: ${tx.explorerLink}`);
        if (tx.amount) lines.push(`Amount: ${tx.amount}`);
        if (tx.recipient) lines.push(`Recipient: ${tx.recipient}`);
        return lines.join("\n");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Failed to check tx status: ${msg}`;
      }
    },
  };

  return [
    getWalletTool,
    getBalanceTool,
    transferTool,
    getPolicyTool,
    getTxHistoryTool,
    checkTxStatusTool,
  ];
}
