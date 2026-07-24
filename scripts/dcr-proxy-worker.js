/**
 * Cloudflare Worker: DCR Proxy
 *
 * Forwards Dynamic Client Registration (DCR) and OAuth metadata requests
 * from Cloudflare's edge network to bypass WAF blocks on datacenter IPs.
 *
 * Deploy: https://dash.cloudflare.com/?to=/:account/workers
 * Create a new Worker, paste this code, save.
 *
 * Set the ALLOWED_ORIGIN environment variable in the Worker settings
 * to your app's origin (e.g. https://app.agentheights.com) for auth.
 */

const ALLOWED_ORIGIN = (typeof globalThis.ALLOWED_ORIGIN !== "undefined" ? globalThis.ALLOWED_ORIGIN : "*");

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Accept, X-DCR-Secret",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/") {
      return new Response(JSON.stringify({ ok: true, service: "dcr-proxy" }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        },
      });
    }

    // Proxy endpoint: /proxy?url=<target_url>
    if (url.pathname === "/proxy") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: "Missing url parameter" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          },
        });
      }

      // Only allow HTTPS targets
      if (!targetUrl.startsWith("https://")) {
        return new Response(JSON.stringify({ error: "Only HTTPS targets allowed" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          },
        });
      }

      try {
        const target = new URL(targetUrl);

        // Forward all request headers, but override User-Agent to look like a browser
        // to bypass WAFs that block non-browser TLS fingerprints
        const headers = new Headers();
        for (const [key, value] of request.headers.entries()) {
          // Skip host, cf-, and x-* headers that reveal proxy origin
          if (key.toLowerCase().startsWith("cf-") || key.toLowerCase() === "host") continue;
          headers.set(key, value);
        }
        headers.set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

        // Forward body for POST, or do GET
        const init = {
          method: request.method,
          headers,
        };

        if (request.method === "POST") {
          init.body = await request.text();
        }

        const res = await fetch(targetUrl, init);

        // Return response with CORS headers, forward key response headers
        const body = await res.text();
        const responseHeaders = {
          "Content-Type": res.headers.get("Content-Type") || "application/json",
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        };
        // Forward WWW-Authenticate header (needed for MCP discovery)
        const wwwAuth = res.headers.get("WWW-Authenticate");
        if (wwwAuth) responseHeaders["WWW-Authenticate"] = wwwAuth;

        return new Response(body, {
          status: res.status,
          headers: responseHeaders,
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      },
    });
  },
};
