import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit } from "../server/ratelimit.js";

describe("rateLimit", () => {
  beforeEach(() => {
    // Each test uses a fresh user ID to get a clean bucket
  });

  it("allows requests up to the limit", () => {
    const userId = "test-user-allow";
    // hire has max 10 — first 10 should pass
    for (let i = 0; i < 10; i++) {
      expect(rateLimit(userId, "hire")).toBe(true);
    }
  });

  it("blocks requests exceeding the limit", () => {
    const userId = "test-user-block";
    // Exhaust the 10 hire tokens
    for (let i = 0; i < 10; i++) {
      rateLimit(userId, "hire");
    }
    // 11th should be blocked
    expect(rateLimit(userId, "hire")).toBe(false);
  });

  it("tracks limits per user independently", () => {
    const userA = "test-user-a";
    const userB = "test-user-b";
    // Exhaust user A's hire limit
    for (let i = 0; i < 10; i++) {
      rateLimit(userA, "hire");
    }
    expect(rateLimit(userA, "hire")).toBe(false);
    // User B should still be allowed
    expect(rateLimit(userB, "hire")).toBe(true);
  });

  it("tracks limits per message type independently", () => {
    const userId = "test-user-types";
    // Exhaust hire limit (10)
    for (let i = 0; i < 10; i++) {
      rateLimit(userId, "hire");
    }
    expect(rateLimit(userId, "hire")).toBe(false);
    // assign has a separate bucket (50) — should still work
    expect(rateLimit(userId, "assign")).toBe(true);
  });

  it("refills tokens over time", async () => {
    const userId = "test-user-refill";
    // Exhaust all 10 hire tokens
    for (let i = 0; i < 10; i++) {
      rateLimit(userId, "hire");
    }
    expect(rateLimit(userId, "hire")).toBe(false);

    // Wait 7s — hire refills at 10/60 per sec ≈ 0.167/sec
    // 10/60 * 7 = 1.17 tokens — enough for 1 request
    await new Promise((r) => setTimeout(r, 7000));
    expect(rateLimit(userId, "hire")).toBe(true);
  }, 15000);

  it("uses default limit for unknown message types", () => {
    const userId = "test-user-default";
    // Default max is 120
    for (let i = 0; i < 120; i++) {
      expect(rateLimit(userId, "unknown_type")).toBe(true);
    }
    expect(rateLimit(userId, "unknown_type")).toBe(false);
  });
});
