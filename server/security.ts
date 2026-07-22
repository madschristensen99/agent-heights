import type { ServerResponse } from "node:http";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
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
