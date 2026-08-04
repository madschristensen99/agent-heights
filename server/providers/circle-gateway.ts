/**
 * Circle Gateway service — manages a server-side Circle Gateway wallet that
 * pays for x402-protected API calls on behalf of agents. Users don't need
 * crypto; costs flow into their existing subscription usage budget.
 *
 * The GatewayClient from @circle-fin/x402-batching handles the full x402 flow:
 *   1. Send initial request → receive 402 Payment Required
 *   2. Sign EIP-3009 authorization offchain (zero gas)
 *   3. Retry request with PAYMENT-SIGNATURE header → get 200 + data
 *
 * Required env vars:
 *   CIRCLE_GATEWAY_PRIVATE_KEY — EVM private key for the Gateway wallet
 *
 * Optional env vars:
 *   CIRCLE_CHAIN               — blockchain network (default: "baseSepolia")
 *   CIRCLE_FACILITATOR_URL     — Gateway facilitator URL (default: testnet)
 *   CIRCLE_BALANCE_ALERT_THRESHOLD — USDC amount below which to alert (default: 5)
 */

function getPrivateKey(): string | null {
  return process.env.CIRCLE_GATEWAY_PRIVATE_KEY ?? null;
}

function getChain(): string {
  return process.env.CIRCLE_CHAIN ?? "baseSepolia";
}

function getBalanceAlertThreshold(): number {
  return parseFloat(process.env.CIRCLE_BALANCE_ALERT_THRESHOLD ?? "5");
}

export function isCircleGatewayConfigured(): boolean {
  return !!getPrivateKey();
}

/** Lazy-loaded GatewayClient singleton. */
let gatewayClient: any = null;
let initPromise: Promise<any> | null = null;

async function getClient(): Promise<any> {
  if (gatewayClient) return gatewayClient;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const pk = getPrivateKey();
    if (!pk) throw new Error("CIRCLE_GATEWAY_PRIVATE_KEY not set");

    const { GatewayClient } = await import("@circle-fin/x402-batching/client");
    gatewayClient = new GatewayClient({
      chain: getChain() as any,
      privateKey: pk as `0x${string}`,
    });
    console.log(`[circle-gateway] initialized on chain ${getChain()}`);
    return gatewayClient;
  })();

  return initPromise;
}

export interface GatewayBalance {
  walletUsdc: string;
  gatewayAvailable: string;
  gatewayPending: string;
  raw: { wallet: { formatted: string; available: bigint }; gateway: { formattedAvailable: string; available: bigint; pending: bigint } };
}

/** Check the Gateway USDC balance. Returns formatted strings + raw bigint. */
export async function getGatewayBalance(): Promise<GatewayBalance | null> {
  if (!isCircleGatewayConfigured()) return null;
  try {
    const client = await getClient();
    const balances = await client.getBalances();
    const threshold = getBalanceAlertThreshold();
    const availableStr = balances.gateway?.formattedAvailable ?? "0";
    const availableNum = parseFloat(availableStr);
    if (availableNum < threshold) {
      console.warn(`[circle-gateway] Gateway balance low: ${availableStr} USDC (threshold: ${threshold})`);
    }
    return {
      walletUsdc: balances.wallet?.formatted ?? "0",
      gatewayAvailable: availableStr,
      gatewayPending: balances.gateway?.formattedPending ?? "0",
      raw: balances,
    };
  } catch (err) {
    console.error("[circle-gateway] getBalances failed:", err);
    return null;
  }
}

/** Deposit USDC from the wallet into the Gateway. */
export async function depositToGateway(amountUsdc: string): Promise<string | null> {
  if (!isCircleGatewayConfigured()) return null;
  try {
    const client = await getClient();
    const result = await client.deposit(amountUsdc);
    console.log(`[circle-gateway] deposited ${amountUsdc} USDC, tx: ${result.depositTxHash}`);
    return result.depositTxHash ?? null;
  } catch (err) {
    console.error("[circle-gateway] deposit failed:", err);
    return null;
  }
}

/** Withdraw USDC from Gateway back to wallet. */
export async function withdrawFromGateway(amountUsdc: string): Promise<string | null> {
  if (!isCircleGatewayConfigured()) return null;
  try {
    const client = await getClient();
    const result = await client.withdraw(amountUsdc);
    console.log(`[circle-gateway] withdrew ${amountUsdc} USDC, tx: ${result.mintTxHash}`);
    return result.mintTxHash ?? null;
  } catch (err) {
    console.error("[circle-gateway] withdraw failed:", err);
    return null;
  }
}

export interface PayResult {
  data: unknown;
  status: number;
  cost: number;
  error?: string;
}

/**
 * Pay for and fetch an x402-protected API endpoint.
 * The GatewayClient handles the 402 → sign → retry flow automatically.
 * Returns the response data, HTTP status, and the USDC cost (in USD, 1 USDC = $1).
 */
export async function payAndFetch(url: string): Promise<PayResult> {
  return payAndFetchWithOptions(url, 0, {});
}

/**
 * Pay for and fetch with request options (method, body, headers) for POST/PUT endpoints.
 * The GatewayClient.pay() supports { method, body, headers } per the x402 spec.
 */
export async function payAndFetchWithOptions(
  url: string,
  expectedPriceUsd: number,
  options: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<PayResult> {
  if (!isCircleGatewayConfigured()) {
    return { data: null, status: 0, cost: 0, error: "Circle Gateway not configured — CIRCLE_GATEWAY_PRIVATE_KEY not set" };
  }
  try {
    const client = await getClient();
    const payOpts: { method?: string; body?: unknown; headers?: Record<string, string> } = {};
    if (options.method) payOpts.method = options.method as any;
    if (options.body !== undefined) payOpts.body = options.body;
    if (options.headers) payOpts.headers = options.headers;
    const { data, status } = await client.pay(url, payOpts);
    return { data, status, cost: expectedPriceUsd };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[circle-gateway] payAndFetch failed for ${url}:`, msg);
    return { data: null, status: 0, cost: 0, error: msg };
  }
}

/** Background balance monitor — logs warnings when Gateway balance is low. */
let monitorInterval: ReturnType<typeof setInterval> | null = null;

export function startBalanceMonitor(intervalMs = 60_000): void {
  if (monitorInterval) return;
  if (!isCircleGatewayConfigured()) return;
  monitorInterval = setInterval(async () => {
    await getGatewayBalance();
  }, intervalMs);
  console.log(`[circle-gateway] balance monitor started (${intervalMs / 1000}s interval)`);
}

export function stopBalanceMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}
