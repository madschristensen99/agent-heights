/**
 * Quick diagnostic script — checks Circle Gateway balance and recent transfers.
 * Run with: npx tsx scripts/check-gateway.ts
 */
import { readFileSync } from "fs";
import { join } from "path";

// Load .env manually
try {
  const envPath = join(import.meta.dirname, "..", ".env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
} catch (e) {
  // .env not found — rely on existing env vars
}

async function main() {
  const pk = process.env.X402_PRIVATE_KEY ?? process.env.CIRCLE_GATEWAY_PRIVATE_KEY;
  const chain = process.env.X402_CHAIN ?? process.env.CIRCLE_CHAIN ?? "base";

  if (!pk) {
    console.error("ERROR: X402_PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  console.log(`\n=== Circle Gateway Diagnostic ===`);
  console.log(`Chain: ${chain}`);
  console.log(`Private key: ${pk.slice(0, 6)}...${pk.slice(-4)}\n`);

  const { GatewayClient } = await import("@circle-fin/x402-batching/client");
  const client = new GatewayClient({
    chain: chain as any,
    privateKey: pk as `0x${string}`,
  });

  // 1. Check balances
  console.log("--- Balances ---");
  try {
    const balances = await client.getBalances();
    console.log(`Wallet USDC:    ${balances.wallet?.formatted ?? "0"}`);
    console.log(`Gateway Total:  ${balances.gateway?.formattedTotal ?? "0"}`);
    console.log(`Gateway Avail:  ${balances.gateway?.formattedAvailable ?? "0"}`);
    console.log(`Gateway Pend:   ${balances.gateway?.formattedWithdrawing ?? "0"}`);
    console.log(`Gateway Wdraw:  ${balances.gateway?.formattedWithdrawable ?? "0"}`);
    console.log(`Raw:`, JSON.stringify(balances, (k, v) => typeof v === "bigint" ? v.toString() : v, 2));
  } catch (err) {
    console.error("getBalances failed:", err);
  }

  // 2. Search recent transfers (deposits + payments)
  console.log("\n--- Recent Transfers (last 20) ---");
  try {
    const result = await client.searchTransfers({ pageSize: 20 });
    if (result.transfers && result.transfers.length > 0) {
      for (const t of result.transfers) {
        console.log(`  [${t.status.padEnd(10)}] ${t.amount.padStart(12)} USDC | ${t.sendingNetwork} → ${t.recipientNetwork} | ${t.createdAt} | id: ${t.id}`);
      }
      console.log(`\n  Pagination:`, result.pagination ?? "none");
    } else {
      console.log("  No transfers found.");
    }
  } catch (err) {
    console.error("searchTransfers failed:", err);
  }

  // 3. Search specifically for 'received' or 'batched' status (pending deposits)
  console.log("\n--- Pending/Batched Transfers ---");
  try {
    const result = await client.searchTransfers({ status: "batched" as any, pageSize: 10 });
    if (result.transfers && result.transfers.length > 0) {
      for (const t of result.transfers) {
        console.log(`  [${t.status.padEnd(10)}] ${t.amount.padStart(12)} USDC | ${t.sendingNetwork} → ${t.recipientNetwork} | ${t.createdAt} | id: ${t.id}`);
      }
    } else {
      console.log("  No batched transfers.");
    }
  } catch (err) {
    console.error("searchTransfers(batched) failed:", err);
  }

  // 4. Check 'received' status (deposits that haven't settled yet)
  console.log("\n--- Received (unsettled) Transfers ---");
  try {
    const result = await client.searchTransfers({ status: "received" as any, pageSize: 10 });
    if (result.transfers && result.transfers.length > 0) {
      for (const t of result.transfers) {
        console.log(`  [${t.status.padEnd(10)}] ${t.amount.padStart(12)} USDC | ${t.sendingNetwork} → ${t.recipientNetwork} | ${t.createdAt} | id: ${t.id}`);
      }
    } else {
      console.log("  No received/pending transfers.");
    }
  } catch (err) {
    console.error("searchTransfers(received) failed:", err);
  }

  // 5. Check 'failed' status
  console.log("\n--- Failed Transfers ---");
  try {
    const result = await client.searchTransfers({ status: "failed" as any, pageSize: 10 });
    if (result.transfers && result.transfers.length > 0) {
      for (const t of result.transfers) {
        console.log(`  [${t.status.padEnd(10)}] ${t.amount.padStart(12)} USDC | ${t.sendingNetwork} → ${t.recipientNetwork} | ${t.createdAt} | id: ${t.id}`);
      }
    } else {
      console.log("  No failed transfers.");
    }
  } catch (err) {
    console.error("searchTransfers(failed) failed:", err);
  }

  console.log("\n=== Done ===\n");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
