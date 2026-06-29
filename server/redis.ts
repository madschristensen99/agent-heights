import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? process.env.REDIS_CONNECTION_STRING ?? "";

export const isRedisConfigured = Boolean(redisUrl);

/** Publisher client — used for publishing messages and setting keys. */
let publisher: Redis | null = null;

/** Subscriber client — used for subscribing to pub/sub channels. */
let subscriber: Redis | null = null;

/** General-purpose client — used for get/set/del operations. */
let client: Redis | null = null;

if (isRedisConfigured) {
  publisher = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });
  client = new Redis(redisUrl, { maxRetriesPerRequest: 3 });

  publisher.on("error", (err) => console.error("[redis] publisher error:", err.message));
  subscriber.on("error", (err) => console.error("[redis] subscriber error:", err.message));
  client.on("error", (err) => console.error("[redis] client error:", err.message));

  publisher.on("connect", () => console.log("[redis] publisher connected"));
  subscriber.on("connect", () => console.log("[redis] subscriber connected"));
  client.on("connect", () => console.log("[redis] client connected"));
}

export { publisher, subscriber, client };

// ── Presence ────────────────────────────────────────────────────────────────

const PRESENCE_PREFIX = "presence:";
const PRESENCE_TTL = 30; // seconds
const HEARTBEAT_INTERVAL = 10_000; // 10 seconds

/** Set presence for a user on this server. */
export async function setPresence(userId: string, serverId: string): Promise<void> {
  if (!client) return;
  await client.set(`${PRESENCE_PREFIX}${userId}`, serverId, "EX", PRESENCE_TTL);
}

/** Clear presence for a user. */
export async function clearPresence(userId: string): Promise<void> {
  if (!client) return;
  await client.del(`${PRESENCE_PREFIX}${userId}`);
}

/** Check if a user is online. */
export async function isOnline(userId: string): Promise<boolean> {
  if (!client) return false;
  const result = await client.exists(`${PRESENCE_PREFIX}${userId}`);
  return result === 1;
}

/** Start a heartbeat interval for a user. Returns a stop function. */
export function startHeartbeat(userId: string, serverId: string): () => void {
  if (!client) return () => {};
  void setPresence(userId, serverId);
  const interval = setInterval(() => {
    void setPresence(userId, serverId);
  }, HEARTBEAT_INTERVAL);
  return () => {
    clearInterval(interval);
    void clearPresence(userId);
  };
}

// ── Pub/Sub ──────────────────────────────────────────────────────────────────

const CHANNEL_PREFIX = "tenant:";

/** Get the pub/sub channel name for a user. */
export function tenantChannel(userId: string): string {
  return `${CHANNEL_PREFIX}${userId}:events`;
}

/** Publish a message to a tenant's channel. */
export async function publish(userId: string, message: string): Promise<void> {
  if (!publisher) return;
  await publisher.publish(tenantChannel(userId), message);
}

/** Subscribe to a tenant's channel. Returns an unsubscribe function. */
export function subscribe(
  userId: string,
  handler: (message: string) => void,
): () => void {
  if (!subscriber) return () => {};
  const channel = tenantChannel(userId);
  subscriber.subscribe(channel);
  const listener = (ch: string, msg: string) => {
    if (ch === channel) handler(msg);
  };
  subscriber.on("message", listener);
  return () => {
    subscriber?.unsubscribe(channel);
    subscriber?.off("message", listener);
  };
}

// ── Server ID ────────────────────────────────────────────────────────────────

/** Unique ID for this server instance. */
export const serverId = `srv-${process.pid}-${Date.now().toString(36)}`;

// ── Shutdown ─────────────────────────────────────────────────────────────────

export function stopRedis(): void {
  publisher?.disconnect();
  subscriber?.disconnect();
  client?.disconnect();
}
