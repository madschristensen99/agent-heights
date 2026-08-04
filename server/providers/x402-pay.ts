/**
 * Unified x402 payment client — supports both Circle Gateway (batched)
 * and direct x402 (exact scheme) payments.
 *
 * For Gateway-compatible services (AIsa, BlockRun, Goldsky):
 *   Uses GatewayClient.pay() — gasless batched attestation
 *
 * For non-Gateway services (StableSocial, etc.):
 *   Falls back to direct x402 using ExactEvmScheme from @x402/evm
 *   Signs EIP-3009 TransferWithAuthorization off-chain (no gas for buyer)
 *   Server settles the payment on-chain
 *
 * Required env vars:
 *   X402_PRIVATE_KEY — EVM private key for the payment wallet
 *
 * Optional env vars:
 *   X402_CHAIN — blockchain network (default: "base" for mainnet)
 *   X402_BALANCE_ALERT_THRESHOLD — USDC amount below which to alert (default: 5)
 */

function getPrivateKey(): string | null {
  return process.env.X402_PRIVATE_KEY ?? process.env.CIRCLE_GATEWAY_PRIVATE_KEY ?? null;
}

function getChain(): string {
  return process.env.X402_CHAIN ?? process.env.CIRCLE_CHAIN ?? "base";
}

function getBalanceAlertThreshold(): number {
  return parseFloat(process.env.X402_BALANCE_ALERT_THRESHOLD ?? process.env.CIRCLE_BALANCE_ALERT_THRESHOLD ?? "5");
}

export function isX402Configured(): boolean {
  return !!getPrivateKey();
}

/** Legacy alias */
export function isCircleGatewayConfigured(): boolean {
  return isX402Configured();
}

// --- Gateway client (for batched payments) ---
let gatewayClient: any = null;
let gatewayInitPromise: Promise<any> | null = null;

async function getGatewayClient(): Promise<any> {
  if (gatewayClient) return gatewayClient;
  if (gatewayInitPromise) return gatewayInitPromise;

  gatewayInitPromise = (async () => {
    const pk = getPrivateKey();
    if (!pk) throw new Error("X402_PRIVATE_KEY not set");

    const { GatewayClient } = await import("@circle-fin/x402-batching/client");
    gatewayClient = new GatewayClient({
      chain: getChain() as any,
      privateKey: pk as `0x${string}`,
    });
    console.log(`[x402] Gateway client initialized on chain ${getChain()}`);
    return gatewayClient;
  })();

  return gatewayInitPromise;
}

// --- Direct x402 scheme (for non-Gateway services) ---
let directScheme: any = null;
let directSchemeInitPromise: Promise<any> | null = null;

async function getDirectScheme(): Promise<any> {
  if (directScheme) return directScheme;
  if (directSchemeInitPromise) return directSchemeInitPromise;

  directSchemeInitPromise = (async () => {
    const pk = getPrivateKey();
    if (!pk) throw new Error("X402_PRIVATE_KEY not set");

    const { privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(pk as `0x${string}`);

    const { ExactEvmScheme } = await import("@x402/evm/exact/client");

    const signer = {
      address: account.address,
      signTypedData: (params: any) => account.signTypedData(params),
    };

    directScheme = new ExactEvmScheme(signer as any);
    console.log(`[x402] Direct ExactEvmScheme initialized (address: ${account.address})`);
    return directScheme;
  })();

  return directSchemeInitPromise;
}

export interface GatewayBalance {
  walletUsdc: string;
  gatewayAvailable: string;
  gatewayPending: string;
  raw: any;
}

export async function getGatewayBalance(): Promise<GatewayBalance | null> {
  if (!isX402Configured()) return null;
  try {
    const client = await getGatewayClient();
    const balances = await client.getBalances();
    const threshold = getBalanceAlertThreshold();
    const availableStr = balances.gateway?.formattedAvailable ?? "0";
    const availableNum = parseFloat(availableStr);
    if (availableNum < threshold) {
      console.warn(`[x402] Gateway balance low: ${availableStr} USDC (threshold: ${threshold})`);
    }
    return {
      walletUsdc: balances.wallet?.formatted ?? "0",
      gatewayAvailable: availableStr,
      gatewayPending: balances.gateway?.formattedPending ?? "0",
      raw: balances,
    };
  } catch (err) {
    console.error("[x402] getBalances failed:", err);
    return null;
  }
}

export async function depositToGateway(amountUsdc: string): Promise<string | null> {
  if (!isX402Configured()) return null;
  try {
    const client = await getGatewayClient();
    const result = await client.deposit(amountUsdc);
    console.log(`[x402] deposited ${amountUsdc} USDC, tx: ${result.depositTxHash}`);
    return result.depositTxHash ?? null;
  } catch (err) {
    console.error("[x402] deposit failed:", err);
    return null;
  }
}

export async function withdrawFromGateway(amountUsdc: string): Promise<string | null> {
  if (!isX402Configured()) return null;
  try {
    const client = await getGatewayClient();
    const result = await client.withdraw(amountUsdc);
    console.log(`[x402] withdrew ${amountUsdc} USDC, tx: ${result.mintTxHash}`);
    return result.mintTxHash ?? null;
  } catch (err) {
    console.error("[x402] withdraw failed:", err);
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
 * Tries Gateway (batched) first, falls back to direct x402 (exact scheme).
 */
export async function payAndFetch(url: string): Promise<PayResult> {
  return payAndFetchWithOptions(url, 0, {});
}

/**
 * Pay for and fetch with request options (method, body, headers).
 * Tries Gateway first, falls back to direct x402.
 */
export async function payAndFetchWithOptions(
  url: string,
  expectedPriceUsd: number,
  options: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<PayResult> {
  if (!isX402Configured()) {
    return { data: null, status: 0, cost: 0, error: "x402 wallet not configured — X402_PRIVATE_KEY not set" };
  }

  const httpMethod = (options.method ?? "GET").toUpperCase();
  const serializedBody = options.body !== undefined
    ? typeof options.body === "string" ? options.body : JSON.stringify(options.body)
    : undefined;
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
  };

  // --- Attempt 1: Try Gateway (batched) ---
  try {
    const gwClient = await getGatewayClient();
    const payOpts: any = {};
    if (httpMethod !== "GET") payOpts.method = httpMethod;
    if (serializedBody !== undefined) payOpts.body = serializedBody;
    if (options.headers) payOpts.headers = options.headers;

    const { data, status } = await gwClient.pay(url, payOpts);

    // Handle async job pattern from Gateway
    if (status === 202 && data?.pollUrl) {
      console.log(`[x402] Gateway async job ${data.jobId} — polling...`);
      const result = await pollAsyncJob(data.pollUrl, data.token);
      return { data: result, status: result ? 200 : 202, cost: expectedPriceUsd };
    }

    return { data, status, cost: expectedPriceUsd };
  } catch (gwErr) {
    const gwMsg = gwErr instanceof Error ? gwErr.message : String(gwErr);
    // If it's not a "no batching option" error, it's a real failure
    if (!gwMsg.includes("No Gateway batching option") && !gwMsg.includes("not configured")) {
      console.error(`[x402] Gateway pay failed for ${url}:`, gwMsg);
      return { data: null, status: 0, cost: 0, error: gwMsg };
    }
    console.log(`[x402] Gateway not supported for ${url}, falling back to direct x402...`);
  }

  // --- Attempt 2: Direct x402 (exact scheme) ---
  try {
    const result = await directX402Pay(url, httpMethod, serializedBody, baseHeaders);
    return { ...result, cost: expectedPriceUsd };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[x402] Direct x402 pay failed for ${url}:`, msg);
    return { data: null, status: 0, cost: 0, error: msg };
  }
}

/**
 * Direct x402 payment flow using ExactEvmScheme (same pattern as GatewayClient.pay
 * but with ExactEvmScheme instead of BatchEvmScheme):
 * 1. Send initial request → get 402
 * 2. Parse payment requirements from PAYMENT-REQUIRED header
 * 3. Sign EIP-3009 TransferWithAuthorization via ExactEvmScheme
 * 4. Retry with PAYMENT-SIGNATURE header (v2) or X-PAYMENT (v1) → get 200 + data
 */
async function directX402Pay(
  url: string,
  method: string,
  serializedBody: string | undefined,
  headers: Record<string, string>,
): Promise<PayResult> {
  const scheme = await getDirectScheme();

  // Step 1: Initial request to get 402
  const initialResponse = await fetch(url, {
    method,
    headers,
    body: serializedBody,
  });

  if (initialResponse.status !== 402) {
    if (initialResponse.ok) {
      const data = await initialResponse.json();
      return { data, status: initialResponse.status, cost: 0 };
    }
    throw new Error(`HTTP ${initialResponse.status}`);
  }

  // Step 2: Parse payment requirements
  const paymentRequiredHeader = initialResponse.headers.get("payment-required");
  if (!paymentRequiredHeader) {
    throw new Error("Missing PAYMENT-REQUIRED header in 402 response");
  }

  const paymentRequired = JSON.parse(
    Buffer.from(paymentRequiredHeader, "base64").toString("utf-8"),
  );

  const accepts = paymentRequired.accepts;
  if (!accepts || accepts.length === 0) {
    throw new Error("No payment options in 402 response");
  }

  // Select the first EVM exact option that matches our chain
  const ourChainId = await getOurChainId();
  const matchingOption = accepts.find((opt: any) =>
    opt.network === `eip155:${ourChainId}` && opt.scheme === "exact",
  );
  if (!matchingOption) {
    const acceptedNets = accepts.map((a: any) => a.network).join(", ");
    throw new Error(
      `No payment option for chain ${ourChainId}. Accepted: ${acceptedNets}`,
    );
  }

  // Step 3: Create payment payload via ExactEvmScheme directly
  const x402Version = paymentRequired.x402Version ?? 2;
  const paymentPayload = await scheme.createPaymentPayload(x402Version, matchingOption);

  // Step 4: Build payment header and retry
  // v2 uses PAYMENT-SIGNATURE, v1 uses X-PAYMENT
  const paymentHeader = Buffer.from(
    JSON.stringify({
      ...paymentPayload,
      resource: paymentRequired.resource,
      accepted: matchingOption,
    }),
  ).toString("base64");

  const headerName = x402Version >= 2 ? "PAYMENT-SIGNATURE" : "X-PAYMENT";

  const paidResponse = await fetch(url, {
    method,
    headers: {
      ...headers,
      [headerName]: paymentHeader,
    },
    body: serializedBody,
  });

  if (!paidResponse.ok) {
    const errorText = await paidResponse.text().catch(() => "");
    throw new Error(`Payment rejected: HTTP ${paidResponse.status} ${errorText}`);
  }

  const data = await paidResponse.json();
  const status = paidResponse.status;

  // Handle async job pattern (e.g. StableSocial returns 202 with pollUrl)
  if (status === 202 && data?.pollUrl) {
    console.log(`[x402] Async job ${data.jobId} — polling ${data.pollUrl}...`);
    const result = await pollAsyncJob(data.pollUrl, data.token);
    return { data: result, status: result ? 200 : 202, cost: 0 };
  }

  return { data, status, cost: 0 };
}

/**
 * Poll an async x402 job until completion.
 * Uses SIWX (Sign-In-With-X) wallet authentication per x402 v2 spec:
 *   1. GET pollUrl → 402 with SIWX challenge in extensions
 *   2. Sign EIP-4361 SIWE message with wallet private key (EIP-191)
 *   3. Send flat SIWX payload in SIGN-IN-WITH-X header (base64 JSON)
 *   4. Repeat until job status is "finished"/"completed" or timeout
 */
async function pollAsyncJob(pollUrl: string, _token: string | undefined, timeoutMs = 30_000): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  const pk = getPrivateKey();
  if (!pk) throw new Error("No private key for SIWX auth");

  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(pk as `0x${string}`);

  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;

    // Step 1: Get SIWX challenge (nonce is single-use, so we need a fresh one each poll)
    const challengeResp = await fetch(pollUrl);

    if (challengeResp.ok) {
      // No auth needed — return data directly
      const jobData = await challengeResp.json();
      if (isJobDone(jobData.status)) {
        return jobData.data ?? jobData.result ?? jobData;
      }
      await sleep(2000);
      continue;
    }

    if (challengeResp.status !== 402) {
      throw new Error(`Poll failed: HTTP ${challengeResp.status}`);
    }

    const challenge = await challengeResp.json();
    const siwxInfo = challenge.extensions?.["sign-in-with-x"]?.info;
    if (!siwxInfo) {
      throw new Error("Poll requires auth but no SIWX challenge provided");
    }

    // Step 2: Build EIP-4361 SIWE message and sign with EIP-191
    const siweMessage = [
      `${siwxInfo.domain} wants you to sign in with your Ethereum account:`,
      account.address,
      "",
      siwxInfo.statement || "",
      "",
      `URI: ${siwxInfo.uri}`,
      `Version: ${siwxInfo.version}`,
      `Chain ID: ${siwxInfo.chainId.replace("eip155:", "")}`,
      `Nonce: ${siwxInfo.nonce}`,
      `Issued At: ${siwxInfo.issuedAt}`,
      `Expiration Time: ${siwxInfo.expirationTime}`,
    ].join("\n");

    const signature = await account.signMessage({ message: siweMessage });

    // Step 3: Build flat SIWX payload per x402 v2 spec
    const siwxPayload = {
      domain: siwxInfo.domain,
      address: account.address,
      statement: siwxInfo.statement,
      uri: siwxInfo.uri,
      version: siwxInfo.version,
      chainId: siwxInfo.chainId,
      type: siwxInfo.type,
      nonce: siwxInfo.nonce,
      issuedAt: siwxInfo.issuedAt,
      expirationTime: siwxInfo.expirationTime,
      signatureScheme: "eip191",
      signature,
    };

    // Step 4: Poll with SIGN-IN-WITH-X header
    const authedResp = await fetch(pollUrl, {
      headers: {
        "SIGN-IN-WITH-X": Buffer.from(JSON.stringify(siwxPayload)).toString("base64"),
      },
    });

    if (authedResp.ok) {
      const jobData = await authedResp.json();
      if (isJobDone(jobData.status)) {
        console.log(`[x402] Job completed on attempt ${attempt}`);
        return jobData.data ?? jobData.result ?? jobData;
      }
      if (jobData.status === "failed") {
        throw new Error(`Job failed: ${jobData.error ?? "unknown"}`);
      }
      // Still pending — wait before next poll (fresh challenge)
      await sleep(2000);
      continue;
    }

    // Auth failed — can't proceed
    const errBody = await authedResp.text().catch(() => "");
    throw new Error(`SIWX auth failed (attempt ${attempt}): HTTP ${authedResp.status} ${errBody.substring(0, 200)}`);
  }

  throw new Error(`Job polling timed out after ${timeoutMs / 1000}s (${attempt} attempts)`);
}

function isJobDone(status: string): boolean {
  return status === "completed" || status === "finished" || status === "done" || status === "success";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Get our wallet's chain ID from the configured chain name */
async function getOurChainId(): Promise<number> {
  const chainName = getChain();
  // Map chain names to IDs — these match the SDK's GATEWAY_DOMAINS
  const chainIds: Record<string, number> = {
    ethereum: 1, ethereumMainnet: 1,
    base: 8453, baseMainnet: 8453,
    polygon: 137, polygonMainnet: 137,
    arbitrum: 42161, arbitrumOne: 42161,
    optimism: 10, optimismMainnet: 10,
    avalanche: 43114, avalancheMainnet: 43114,
    // Testnets
    baseSepolia: 84532,
    sepolia: 11155111,
    arbitrumSepolia: 421614,
    optimismSepolia: 11155420,
    polygonAmoy: 80002,
    avalancheFuji: 43113,
    // Others
    sei: 1329,
    seiAtlantic: 1329,
    sonic: 146,
    sonicTestnet: 14601,
    hyperEvm: 480,
    hyperEvmTestnet: 999,
    worldChain: 480, worldChainMainnet: 480,
    worldChainSepolia: 480,
    unichain: 130, unichainSepolia: 130,
    arc: 5042, arcTestnet: 5042002,
  };
  return chainIds[chainName] ?? 8453; // default to Base
}

// --- Balance monitor ---
let monitorInterval: ReturnType<typeof setInterval> | null = null;

export function startBalanceMonitor(intervalMs = 60_000): void {
  if (monitorInterval) return;
  if (!isX402Configured()) return;
  monitorInterval = setInterval(async () => {
    await getGatewayBalance();
  }, intervalMs);
  console.log(`[x402] balance monitor started (${intervalMs / 1000}s interval)`);
}

export function stopBalanceMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
}
