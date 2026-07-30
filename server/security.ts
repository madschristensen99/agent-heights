import type { IncomingMessage, ServerResponse } from "node:http";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; connect-src 'self' wss: https:; font-src 'self' data: https://fonts.gstatic.com; media-src 'self' blob:; frame-src 'self' https:; frame-ancestors 'none';",
};

export function applySecurityHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return { ...SECURITY_HEADERS, ...headers };
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, applySecurityHeaders({ "Content-Type": "application/json" }));
  res.end(JSON.stringify(data));
}

export async function readBodyWithLimit(req: IncomingMessage, maxBytes = 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error(`Request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}
