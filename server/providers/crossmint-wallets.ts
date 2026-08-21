import type { AgentTool } from "@cline/sdk";
import { privateKeyToAccount } from "viem/accounts";
import { Keypair } from "@solana/web3.js";
import { createPrivateKey, sign as cryptoSign } from "crypto";

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
  return process.env.CROSSMINT_CHAIN ?? "solana";
}

export function isCrossmintConfigured(): boolean {
  return !!(getApiKey() && getSignerSecret());
}

/** Cache of wallet addresses per agentId. */
const walletCache = new Map<string, { address: string; chainType: string }>();

/** Derive the server signer's EVM address from the secret. */
function getEvmSignerAddress(): string {
  const secret = getSignerSecret();
  if (!secret) throw new Error("CROSSMINT_SERVER_SIGNER_SECRET not set");
  const pk = secret.startsWith("0x") ? secret : `0x${secret}`;
  const account = privateKeyToAccount(pk as `0x${string}`);
  return account.address;
}

/** Derive the server signer's Solana address from the secret. */
function getSolanaSignerAddress(): string {
  const secret = getSignerSecret();
  if (!secret) throw new Error("CROSSMINT_SERVER_SIGNER_SECRET not set");
  const hex = secret.startsWith("0x") ? secret.slice(2) : secret;
  const seed = Buffer.from(hex, "hex");
  if (seed.length !== 32) throw new Error("Signer secret must be 32 bytes (64 hex chars)");
  const kp = Keypair.fromSeed(seed);
  return kp.publicKey.toBase58();
}

/** Get the signer address for the current default chain. */
function getSignerAddress(): string {
  const chain = getDefaultChain();
  return chainToType(chain) === "solana" ? getSolanaSignerAddress() : getEvmSignerAddress();
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
    const tokenList = tokens ?? ["sol", "usdc", "usdxm"];

    const url = new URL(
      `${baseUrl}/${API_VERSION}/wallets/${wallet.address}/balances`,
    );
    url.searchParams.set("tokens", tokenList.join(","));
    url.searchParams.set("chains", chain);

    const res = await fetch(url.toString(), {
      headers: { "X-API-KEY": apiKey },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[crossmint] Balance request failed (${res.status}): ${errText}`);
      return { address: wallet.address, balances: [] };
    }

    const data = (await res.json()) as any;
    console.log(`[crossmint] Balance response for ${agentId}:`, JSON.stringify(data).slice(0, 500));
    const balances: any[] = [];

    // Handle native token (SOL, ETH, etc.)
    const native = data.nativeToken ?? data.native ?? data.nativeBalance;
    if (native) {
      balances.push({
        symbol: native.symbol ?? (chainToType(chain) === "solana" ? "SOL" : "ETH"),
        amount: native.balance ?? native.amount ?? "0",
        usdValue: native.balanceUSD ?? native.usdValue,
        decimals: native.decimals,
      });
    }

    // Handle token array (various possible response shapes)
    const tokenArr = data.tokens ?? data.tokenBalances ?? data.balances;
    if (tokenArr && Array.isArray(tokenArr)) {
      for (const t of tokenArr) {
        balances.push({
          symbol: t.symbol ?? "unknown",
          amount: t.balance ?? t.amount ?? "0",
          usdValue: t.balanceUSD ?? t.usdValue,
          decimals: t.decimals,
          address: t.address ?? t.mint,
        });
      }
    }

    // If no native token was in the response but balance > 0 in a top-level field, handle that
    if (balances.length === 0 && data.balance) {
      balances.push({
        symbol: data.symbol ?? (chainToType(chain) === "solana" ? "SOL" : "ETH"),
        amount: String(data.balance),
        usdValue: data.balanceUSD,
      });
    }

    return { address: wallet.address, balances };
  } catch (err) {
    console.error(`[crossmint] Failed to get balances for agent ${agentId}:`, err);
    return null;
  }
}

/** Sign an approval message with the server signer key (EVM or Solana). */
async function signApprovalMessage(message: string): Promise<string> {
  const chain = getDefaultChain();
  const secret = getSignerSecret()!;

  if (chainToType(chain) === "solana") {
    // Solana: Ed25519 sign the raw message bytes using Node.js built-in crypto
    const hex = secret.startsWith("0x") ? secret.slice(2) : secret;
    const seed = Buffer.from(hex, "hex");
    const kp = Keypair.fromSeed(seed);
    const msgBytes = Buffer.from(message, "utf-8");
    // Build PKCS8 Ed25519 private key from the 32-byte seed
    const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
    const pkcs8Key = Buffer.concat([pkcs8Prefix, kp.secretKey.slice(0, 32)]);
    const keyObj = createPrivateKey({ key: pkcs8Key, format: "der", type: "pkcs8" });
    const sig = cryptoSign(null, msgBytes, keyObj);
    return sig.toString("base64");
  }

  // EVM: personal_sign on raw hex message
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

/** Submit a raw transaction through Crossmint's wallet API.
 * For EVM: provides tx data, to address, and value.
 * For Solana: provides base64-encoded transaction. */
async function submitCrossmintTransaction(
  agentId: string,
  txData: string,
  chainType: "solana" | "evm",
  to?: string,
  value?: string,
): Promise<{ id: string; status: string } | null> {
  if (!isCrossmintConfigured()) return null;
  try {
    const apiKey = getApiKey()!;
    const baseUrl = getBaseUrl();
    const chain = getDefaultChain();
    const wallet = await getOrCreateAgentWallet(agentId, chain);
    if (!wallet) return null;
    const signerAddress = getSignerAddress();
    const walletLocator = wallet.address;

    // Create the transaction
    const body: any = {
      signer: `server:${signerAddress}`,
    };
    if (chainType === "evm") {
      body.data = txData;
      body.to = to;
      body.value = value ?? "0";
    } else {
      body.transaction = txData;
    }

    const createRes = await fetch(
      `${baseUrl}/${API_VERSION}/wallets/${walletLocator}/transactions`,
      {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Transaction creation failed (${createRes.status}): ${errText}`);
    }

    const created = (await createRes.json()) as any;
    const txId = created.id;

    // Sign approval if needed
    const pendingApproval = created.approvals?.pending?.[0];
    if (pendingApproval) {
      const signature = await signApprovalMessage(pendingApproval.message);
      const approveRes = await fetch(
        `${baseUrl}/${API_VERSION}/wallets/${walletLocator}/transactions/${txId}/approvals`,
        {
          method: "POST",
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            approvals: [{ signer: `server:${signerAddress}`, signature }],
          }),
        },
      );
      if (!approveRes.ok) {
        const errText = await approveRes.text();
        throw new Error(`Approval failed (${approveRes.status}): ${errText}`);
      }
      const approved = (await approveRes.json()) as any;
      return { id: txId, status: approved.status ?? "submitted" };
    }

    return { id: txId, status: created.status ?? "submitted" };
  } catch (err) {
    console.error(`[crossmint] Transaction submission failed for agent ${agentId}:`, err);
    return null;
  }
}

/** Transfer tokens from an agent's wallet. Wraps transferAgentTokens with a simpler interface. */
async function transferTokens(
  agentId: string,
  to: string,
  amount: bigint,
  token: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await transferAgentTokens(agentId, to, amount.toString(), token);
    if (result) {
      return { success: true, message: result.txId };
    }
    return { success: false, message: "Transfer returned null" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg };
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
          token: "sol",
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
      throw new Error(`Onramp order failed (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as any;
    const url = data?.paymentIntent?.url ?? data?.url ?? data?.order?.url ?? null;
    if (!url) {
      console.error(`[crossmint] Onramp order response missing URL:`, JSON.stringify(data));
      throw new Error("Onramp order response missing payment URL");
    }
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
          description: "Comma-separated token symbols to check (e.g. 'sol,usdc,usdxm'). Default: 'sol,usdc,usdxm'",
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
          description: 'Token symbol to transfer (e.g. "sol", "usdc"). Default: "sol"',
          default: "sol",
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
        const token = input.token ?? "sol";
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

  const tokenSearchTool: AgentTool<any, any> = {
    name: "crossmint_token_search",
    description:
      "Search for Solana tokens by name, symbol, or mint address. " +
      "Returns mint address, symbol, decimals, and daily volume. " +
      "Use this to look up token mint addresses before swapping or transferring. " +
      "Works for Solana chain tokens (uses Jupiter search API).",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Token name, symbol, or mint address (e.g. 'BONK', 'USDC', or a mint address)",
        },
      },
      required: ["query"],
    },
    async execute(input: any) {
      try {
        const url = new URL("https://lite-api.jup.ag/ultra/v1/search");
        url.searchParams.set("query", input.query);
        const res = await fetch(url.toString());
        if (!res.ok) return `Token search failed (${res.status}).`;
        const data = await res.json() as any;
        const tokens = Array.isArray(data) ? data : (data.tokens ?? data.result ?? []);
        if (tokens.length === 0) return `No tokens found for "${input.query}".`;
        const lines = [`Search results for "${input.query}" (${tokens.length} found):`];
        for (const t of tokens.slice(0, 10)) {
          const symbol = t.symbol ?? t.tokenSymbol ?? "?";
          const mint = t.mint ?? t.address ?? t.id ?? "?";
          const decimals = t.decimals ?? t.tokenDecimals ?? "?";
          const volume = t.dailyVolume ?? t.volume24h ?? "?";
          lines.push(`  ${symbol} — mint: ${mint} — decimals: ${decimals} — 24h vol: ${volume}`);
        }
        return lines.join("\n");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Token search failed: ${msg}`;
      }
    },
  };

  const swapQuoteTool: AgentTool<any, any> = {
    name: "crossmint_swap_quote",
    description:
      "Get a swap quote without executing. Returns expected output amount, price impact, and route. " +
      "For Solana: uses Jupiter Ultra API. For EVM: uses 1inch aggregator API. " +
      "Use this to check prices before executing a swap with crossmint_swap.",
    inputSchema: {
      type: "object",
      properties: {
        inputMint: {
          type: "string",
          description: "Input token contract/mint address (e.g. So11111111111111111111111111111111111111112 for SOL, or ERC-20 contract address)",
        },
        outputMint: {
          type: "string",
          description: "Output token contract/mint address",
        },
        amount: {
          type: "number",
          description: "Amount to swap in human-readable units",
        },
        inputDecimals: {
          type: "number",
          description: "Decimals of input token (SOL=9, USDC=6, most ERC-20=18). If omitted, auto-detected for SOL.",
        },
        slippageBps: {
          type: "number",
          description: "Slippage tolerance in basis points (50 = 0.5%). Default: 100",
          default: 100,
        },
      },
      required: ["inputMint", "outputMint", "amount"],
    },
    async execute(input: any) {
      try {
        const chain = getDefaultChain();
        const isSol = chainToType(chain) === "solana";
        const isSolToken = input.inputMint === "So11111111111111111111111111111111111111112";
        let decimals: number;
        if (input.inputDecimals !== undefined) {
          decimals = input.inputDecimals;
        } else if (isSol && isSolToken) {
          decimals = 9;
        } else {
          return `Please provide inputDecimals for token ${input.inputMint}. Use crossmint_token_search to look it up.`;
        }
        const rawAmount = String(Math.floor(input.amount * Math.pow(10, decimals)));
        const slippageBps = input.slippageBps ?? 100;

        if (isSol) {
          const url = new URL("https://lite-api.jup.ag/ultra/v1/quote");
          url.searchParams.set("inputMint", input.inputMint);
          url.searchParams.set("outputMint", input.outputMint);
          url.searchParams.set("amount", rawAmount);
          url.searchParams.set("slippageBps", String(slippageBps));
          const res = await fetch(url.toString());
          if (!res.ok) return `Jupiter quote failed (${res.status}).`;
          const data = await res.json() as any;
          return `Quote (Jupiter, Solana):\n` +
            `Input: ${input.amount} (${input.inputMint.slice(0, 12)}...)\n` +
            `Expected output: ${data.outAmount ?? "unknown"} (raw)\n` +
            `Price impact: ${data.priceImpact ?? "unknown"}\n` +
            `Slippage: ${slippageBps / 100}%`;
        } else {
          const chainId = chain.includes("base") ? "base" : "ethereum";
          const url = new URL(`https://api.1inch.dev/swap/v6.0/${chainId}/quote`);
          url.searchParams.set("src", input.inputMint);
          url.searchParams.set("dst", input.outputMint);
          url.searchParams.set("amount", rawAmount);
          const res = await fetch(url.toString());
          if (!res.ok) return `1inch quote failed (${res.status}).`;
          const data = await res.json() as any;
          return `Quote (1inch, ${chainId}):\n` +
            `Input: ${input.amount} (${input.inputMint.slice(0, 12)}...)\n` +
            `Expected output: ${data.toAmount ?? "unknown"} (raw)\n` +
            `Slippage: ${slippageBps / 100}%`;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Swap quote failed: ${msg}`;
      }
    },
  };

  const swapTool: AgentTool<any, any> = {
    name: "crossmint_swap",
    description:
      "Swap tokens using your Crossmint wallet. For Solana: uses Jupiter Ultra API. For EVM: uses 1inch aggregator. " +
      "Gas is sponsored by Crossmint paymaster. " +
      "Use crossmint_swap_quote first to check expected output, then execute with crossmint_swap. " +
      "Common Solana mints: SOL=So11111111111111111111111111111111111111112, USDC=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v.",
    inputSchema: {
      type: "object",
      properties: {
        inputMint: {
          type: "string",
          description: "Input token contract/mint address",
        },
        outputMint: {
          type: "string",
          description: "Output token contract/mint address",
        },
        amount: {
          type: "number",
          description: "Amount to swap in human-readable units",
        },
        inputDecimals: {
          type: "number",
          description: "Decimals of input token (SOL=9, USDC=6, most ERC-20=18). If omitted, auto-detected for SOL.",
        },
        slippageBps: {
          type: "number",
          description: "Slippage tolerance in basis points (50 = 0.5%). Default: 100",
          default: 100,
        },
      },
      required: ["inputMint", "outputMint", "amount"],
    },
    async execute(input: any) {
      try {
        const chain = getDefaultChain();
        const isSol = chainToType(chain) === "solana";
        const isSolToken = input.inputMint === "So11111111111111111111111111111111111111112";
        let decimals: number;
        if (input.inputDecimals !== undefined) {
          decimals = input.inputDecimals;
        } else if (isSol && isSolToken) {
          decimals = 9;
        } else {
          return `Please provide inputDecimals for token ${input.inputMint}. Use crossmint_token_search to look it up.`;
        }
        const rawAmount = String(Math.floor(input.amount * Math.pow(10, decimals)));
        const slippageBps = input.slippageBps ?? 100;
        const wallet = await getOrCreateAgentWallet(agentId);
        if (!wallet) return `Wallet not found. Crossmint may not be configured.`;

        if (isSol) {
          // Jupiter Ultra API for Solana swaps
          const orderUrl = new URL("https://lite-api.jup.ag/ultra/v1/order");
          orderUrl.searchParams.set("inputMint", input.inputMint);
          orderUrl.searchParams.set("outputMint", input.outputMint);
          orderUrl.searchParams.set("amount", rawAmount);
          orderUrl.searchParams.set("taker", wallet.address);
          orderUrl.searchParams.set("slippageBps", String(slippageBps));
          const orderRes = await fetch(orderUrl.toString());
          if (!orderRes.ok) return `Jupiter order failed (${orderRes.status}).`;
          const order = await orderRes.json() as any;
          if (!order.transaction) return `Jupiter returned no transaction.`;

          // Submit via Crossmint transaction API
          const txResult = await submitCrossmintTransaction(agentId, order.transaction, "solana");
          if (!txResult) return `Swap submission failed. Crossmint may not be configured.`;

          return `Swap submitted via Jupiter + Crossmint!\n` +
            `Input: ${input.amount} ${isSolToken ? "SOL" : input.inputMint.slice(0, 8)}...\n` +
            `Expected output: ${order.outAmount ?? "unknown"} (raw)\n` +
            `Transaction ID: ${txResult.id ?? "unknown"}\n` +
            `Status: ${txResult.status ?? "pending"}\n` +
            `Use crossmint_check_tx_status to verify confirmation.`;
        } else {
          // 1inch for EVM swaps — build the swap data, then submit via Crossmint
          const chainId = chain.includes("base") ? "base" : "ethereum";
          const swapUrl = new URL(`https://api.1inch.dev/swap/v6.0/${chainId}/swap`);
          swapUrl.searchParams.set("src", input.inputMint);
          swapUrl.searchParams.set("dst", input.outputMint);
          swapUrl.searchParams.set("amount", rawAmount);
          swapUrl.searchParams.set("from", wallet.address);
          swapUrl.searchParams.set("slippage", String(slippageBps / 100));
          const swapRes = await fetch(swapUrl.toString());
          if (!swapRes.ok) return `1inch swap data fetch failed (${swapRes.status}).`;
          const swapData = await swapRes.json() as any;
          if (!swapData.tx?.data) return `1inch returned no swap data.`;

          // Submit the swap transaction via Crossmint
          const txResult = await submitCrossmintTransaction(agentId, swapData.tx.data, "evm", swapData.tx.to, swapData.tx.value ?? "0");
          if (!txResult) return `Swap submission failed. Crossmint may not be configured.`;

          return `Swap submitted via 1inch + Crossmint!\n` +
            `Input: ${input.amount} (${input.inputMint.slice(0, 12)}...)\n` +
            `Expected output: ${swapData.toAmount ?? "unknown"} (raw)\n` +
            `Transaction ID: ${txResult.id ?? "unknown"}\n` +
            `Status: ${txResult.status ?? "pending"}\n` +
            `Use crossmint_check_tx_status to verify confirmation.`;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Swap failed: ${msg}`;
      }
    },
  };

  const signMessageTool: AgentTool<any, any> = {
    name: "crossmint_sign_message",
    description:
      "Sign an arbitrary message with the server signer key. " +
      "For EVM: uses personal_sign (EIP-191). For Solana: uses Ed25519 signing. " +
      "Use this for authentication, identity verification, or off-chain message signing.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Message to sign (plain text)",
        },
      },
      required: ["message"],
    },
    async execute(input: any) {
      try {
        const signature = await signApprovalMessage(input.message);
        const chain = getDefaultChain();
        const signerAddr = getSignerAddress();
        return `Message signed successfully.\n` +
          `Chain: ${chain}\n` +
          `Signer: ${signerAddr}\n` +
          `Signature: ${signature}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Message signing failed: ${msg}`;
      }
    },
  };

  const portfolioTool: AgentTool<any, any> = {
    name: "crossmint_portfolio",
    description:
      "Get a portfolio overview for your Crossmint wallet. Returns token allocations, " +
      "USD values where available, and diversification suggestions. " +
      "Use this to give the user a snapshot of their holdings.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    async execute(input: any) {
      try {
        const data = await getAgentBalances(agentId);
        if (!data || data.balances.length === 0) {
          const wallet = await getOrCreateAgentWallet(agentId);
          return `Wallet ${wallet?.address ?? "unknown"} has no token balances. The wallet may need to be funded.`;
        }
        let totalUsd = 0;
        const holdings = data.balances.map((b: any) => {
          const usd = b.usdValue ? parseFloat(b.usdValue) : 0;
          totalUsd += usd;
          return { ...b, usdValue: usd };
        });
        holdings.sort((a: any, b: any) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
        const lines = [`Portfolio for ${data.address}:`];
        if (totalUsd > 0) lines.push(`Total estimated value: $${totalUsd.toFixed(2)}\n`);
        for (const h of holdings) {
          const usdStr = h.usdValue > 0 ? ` ($${h.usdValue.toFixed(2)})` : "";
          const pct = totalUsd > 0 ? ` — ${((h.usdValue / totalUsd) * 100).toFixed(1)}%` : "";
          lines.push(`${h.symbol}: ${h.amount}${usdStr}${pct}`);
        }
        if (totalUsd > 0) {
          const dominant = holdings[0];
          const dominantPct = (dominant.usdValue / totalUsd) * 100;
          if (dominantPct > 60) {
            lines.push(`\nRebalancing suggestion: ${dominant.symbol} is ${dominantPct.toFixed(1)}% of your portfolio.`);
          } else if (holdings.length === 1) {
            lines.push(`\nDiversification suggestion: You only hold ${dominant.symbol}.`);
          } else {
            lines.push(`\nPortfolio looks diversified across ${holdings.length} tokens.`);
          }
        }
        return lines.join("\n");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Portfolio analysis failed: ${msg}`;
      }
    },
  };

  const sendTransactionTool: AgentTool<any, any> = {
    name: "crossmint_send_transaction",
    description:
      "Send a raw transaction through your Crossmint wallet. " +
      "For EVM: provide the transaction data (hex) and target contract address. " +
      "For Solana: provide the base64-encoded transaction data. " +
      "Gas is sponsored by Crossmint paymaster. " +
      "Use this for advanced DeFi operations not covered by swap or transfer tools.",
    inputSchema: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: "Transaction data (hex for EVM, base64 for Solana)",
        },
        to: {
          type: "string",
          description: "Target contract address (EVM only, ignored for Solana)",
        },
        value: {
          type: "string",
          description: "Native value to send in wei (EVM only). Default: '0'",
          default: "0",
        },
      },
      required: ["data"],
    },
    async execute(input: any) {
      try {
        const chain = getDefaultChain();
        const isSol = chainToType(chain) === "solana";
        const txResult = await submitCrossmintTransaction(
          agentId,
          input.data,
          isSol ? "solana" : "evm",
          input.to,
          input.value ?? "0",
        );
        if (!txResult) return `Transaction submission failed. Crossmint may not be configured.`;
        return `Transaction submitted!\n` +
          `Transaction ID: ${txResult.id ?? "unknown"}\n` +
          `Status: ${txResult.status ?? "pending"}\n` +
          `Use crossmint_check_tx_status to verify confirmation.`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Send transaction failed: ${msg}`;
      }
    },
  };

  const batchTransferTool: AgentTool<any, any> = {
    name: "crossmint_batch_transfer",
    description:
      "Transfer tokens to multiple recipients in a single call. " +
      "Useful for airdrops, payroll, or multi-party payments. " +
      "Gas is sponsored by Crossmint paymaster. " +
      "Always confirm the total amount and all recipient addresses with the user before calling.",
    inputSchema: {
      type: "object",
      properties: {
        recipients: {
          type: "array",
          description: "Array of { address, amount } objects",
          items: {
            type: "object",
            properties: {
              address: { type: "string", description: "Recipient wallet address" },
              amount: { type: "number", description: "Amount to transfer (human-readable)" },
            },
          },
        },
        token: {
          type: "string",
          description: 'Token to transfer: "sol" for native SOL, "native" for EVM native, or token contract/mint address. Default: "sol"',
          default: "sol",
        },
        decimals: {
          type: "number",
          description: "Token decimals (SOL=9, USDC=6, most ERC-20=18). If omitted, defaults to 9 for SOL or 6 for tokens.",
        },
      },
      required: ["recipients"],
    },
    async execute(input: any) {
      try {
        const recipients = input.recipients as { address: string; amount: number }[];
        if (!recipients || recipients.length === 0) return `No recipients provided.`;
        if (recipients.length > 20) return `Too many recipients (${recipients.length}). Maximum 20 per batch.`;
        const token = input.token ?? "sol";
        const chain = getDefaultChain();
        const isSol = chainToType(chain) === "solana";
        const decimals = token === "sol" || token === "native" ? (isSol ? 9 : 18) : (input.decimals ?? 6);
        const results: string[] = [];
        let successCount = 0;
        for (const r of recipients) {
          try {
            const rawAmount = BigInt(Math.floor(r.amount * Math.pow(10, decimals)));
            const result = await transferTokens(agentId, r.address, rawAmount, token);
            if (result.success) {
              results.push(`  ${r.address.slice(0, 8)}... — ${r.amount} — tx: ${result.message?.slice(0, 20)}...`);
              successCount++;
            } else {
              results.push(`  ${r.address.slice(0, 8)}... — FAILED: ${result.message}`);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            results.push(`  ${r.address.slice(0, 8)}... — FAILED: ${msg}`);
          }
        }
        return `Batch transfer complete: ${successCount}/${recipients.length} successful\n${results.join("\n")}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Batch transfer failed: ${msg}`;
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
    tokenSearchTool,
    swapQuoteTool,
    swapTool,
    signMessageTool,
    portfolioTool,
    sendTransactionTool,
    batchTransferTool,
  ];
}
