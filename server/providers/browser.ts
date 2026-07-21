/**
 * Agent Browser Manager
 *
 * Manages headless Playwright browser instances per agent. Each agent gets
 * its own browser context for navigating websites, taking screenshots,
 * clicking elements, filling forms, and extracting text.
 *
 * Screenshots are cached for the ScreenshotManager and HTTP endpoint to serve.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

interface AgentBrowser {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  /** Latest screenshot as base64 JPEG (no data: prefix). */
  lastFrame: string | null;
  /** Current URL the page is on. */
  currentUrl: string;
  /** Timestamp of last activity (for idle cleanup). */
  lastActivity: number;
}

const browsers = new Map<string, AgentBrowser>();

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  browserInstance = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  console.log("[browser] launched headless Chromium");
  return browserInstance;
}

/** Get or create a browser context+page for an agent. */
export async function getAgentBrowser(agentId: string): Promise<AgentBrowser> {
  const existing = browsers.get(agentId);
  if (existing) {
    existing.lastActivity = Date.now();
    return existing;
  }

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
  });
  const page = await context.newPage();

  const ab: AgentBrowser = {
    browser,
    context,
    page,
    lastFrame: null,
    currentUrl: "about:blank",
    lastActivity: Date.now(),
  };
  browsers.set(agentId, ab);
  console.log(`[browser] created context for agent ${agentId}`);
  return ab;
}

/** Navigate the agent's browser to a URL. Returns page title + URL. */
export async function browserNavigate(agentId: string, url: string): Promise<string> {
  const ab = await getAgentBrowser(agentId);
  await ab.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  ab.currentUrl = ab.page.url();
  ab.lastActivity = Date.now();
  const title = await ab.page.title();
  return `Navigated to ${ab.page.url()}\nTitle: ${title}`;
}

/** Take a screenshot and cache it. Returns base64 JPEG (no data: prefix). */
export async function browserScreenshot(agentId: string): Promise<string> {
  const ab = await getAgentBrowser(agentId);
  const buf = await ab.page.screenshot({ type: "jpeg", quality: 80 });
  const base64 = buf.toString("base64");
  ab.lastFrame = base64;
  ab.lastActivity = Date.now();
  return base64;
}

/** Extract visible text content from the current page. */
export async function browserExtractText(agentId: string): Promise<string> {
  const ab = await getAgentBrowser(agentId);
  const text = await ab.page.evaluate(() => document.body?.innerText ?? "");
  ab.lastActivity = Date.now();
  // Truncate to avoid blowing up the context window
  return text.slice(0, 8000);
}

/** Click an element by CSS selector or text. */
export async function browserClick(agentId: string, selector: string): Promise<string> {
  const ab = await getAgentBrowser(agentId);
  // Try CSS selector first, then text match
  try {
    await ab.page.click(selector, { timeout: 10_000 });
  } catch {
    await ab.page.getByText(selector, { exact: false }).first().click({ timeout: 10_000 });
  }
  ab.lastActivity = Date.now();
  await ab.page.waitForTimeout(500);
  return `Clicked: ${selector}`;
}

/** Fill an input element by CSS selector with the given value. */
export async function browserFill(agentId: string, selector: string, value: string): Promise<string> {
  const ab = await getAgentBrowser(agentId);
  await ab.page.fill(selector, value, { timeout: 10_000 });
  ab.lastActivity = Date.now();
  return `Filled ${selector} with: ${value}`;
}

/** Get the current URL of the agent's browser. */
export function browserCurrentUrl(agentId: string): string {
  return browsers.get(agentId)?.currentUrl ?? "about:blank";
}

/** Get the last cached screenshot frame (base64 JPEG, no data: prefix). */
export function browserLastFrame(agentId: string): string | null {
  return browsers.get(agentId)?.lastFrame ?? null;
}

/** Check if an agent has an active browser session. */
export function hasBrowser(agentId: string): boolean {
  return browsers.has(agentId);
}

/** Close and clean up an agent's browser context. */
export async function closeAgentBrowser(agentId: string): Promise<void> {
  const ab = browsers.get(agentId);
  if (!ab) return;
  try {
    await ab.context.close();
  } catch { /* ignore */ }
  browsers.delete(agentId);
  console.log(`[browser] closed context for agent ${agentId}`);
}

/** Close all browser contexts and the browser instance. */
export async function destroyAllBrowsers(): Promise<void> {
  for (const [id] of browsers) {
    await closeAgentBrowser(id);
  }
  if (browserInstance) {
    try { await browserInstance.close(); } catch { /* ignore */ }
    browserInstance = null;
    console.log("[browser] closed Chromium instance");
  }
}

/** Clean up idle browser contexts (older than 10 minutes with no activity). */
export async function cleanupIdleBrowsers(): Promise<void> {
  const now = Date.now();
  const IDLE_MS = 10 * 60 * 1000;
  for (const [agentId, ab] of browsers) {
    if (now - ab.lastActivity > IDLE_MS) {
      await closeAgentBrowser(agentId);
    }
  }
}
