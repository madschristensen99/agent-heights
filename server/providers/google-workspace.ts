import type { AgentTool } from "@cline/sdk";
import type { MCPServerConfig } from "../../shared/types.js";

/** Map Google Workspace MCP server URLs to service identifiers. */
const GOOGLE_MCP_URLS: Record<string, string> = {
  "https://sheetsmcp.googleapis.com/mcp/v1": "sheets",
  "https://drivemcp.googleapis.com/mcp/v1": "drive",
  "https://gmailmcp.googleapis.com/mcp/v1": "gmail",
  "https://docsmcp.googleapis.com/mcp/v1": "docs",
  "https://slidesmcp.googleapis.com/mcp/v1": "slides",
  "https://calendarmcp.googleapis.com/mcp/v1": "calendar",
  "https://chatmcp.googleapis.com/mcp/v1": "chat",
  "https://people.googleapis.com/mcp/v1": "people",
};

/** Check if an MCP server URL is a Google Workspace MCP server. */
export function isGoogleWorkspaceMcp(url?: string): boolean {
  if (!url) return false;
  return url in GOOGLE_MCP_URLS;
}

/** Core fetch helper — calls Google REST API with the OAuth bearer token. */
async function gapi(token: string, method: string, url: string, body?: unknown): Promise<string> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = text.slice(0, 500);
    throw new Error(`Google API ${res.status}: ${err}`);
  }
  return text || "{}";
}

/** Helper to build a tool definition. */
function tool(name: string, description: string, inputSchema: Record<string, unknown>, execute: (input: any, ctx?: any) => Promise<string>): AgentTool<any, any> {
  return { name, description, inputSchema, execute } as AgentTool<any, any>;
}

// ── Sheets (6 tools) ──────────────────────────────────────────────────────

function sheetsTools(token: string): AgentTool<any, any>[] {
  const base = "https://sheets.googleapis.com/v4/spreadsheets";
  return [
    tool("get_values", "Returns a range of values from a spreadsheet.", {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Required. The ID of the spreadsheet to retrieve data from." },
        range: { type: "string", description: "Required. The A1 notation or R1C1 notation of the range to retrieve values from." },
      },
      required: ["spreadsheetId", "range"],
    }, async (i) => gapi(token, "GET", `${base}/${i.spreadsheetId}/values/${encodeURIComponent(i.range)}`)),

    tool("get_spreadsheet", "Returns the spreadsheet content for the given spreadsheet. Returns titles, sheet names, grid properties, and other metadata.", {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Required. The ID of the spreadsheet to request." },
        includeGridData: { type: "boolean", description: "True if grid data should be returned." },
      },
      required: ["spreadsheetId"],
    }, async (i) => gapi(token, "GET", `${base}/${i.spreadsheetId}?includeGridData=${i.includeGridData ?? false}`)),

    tool("update_spreadsheet", "Applies one or more updates to the spreadsheet via batchUpdate.", {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Required. The ID of the spreadsheet to update." },
        requests: { type: "array", items: { type: "object", additionalProperties: true }, description: "Required. A list of updates to apply to the spreadsheet." },
      },
      required: ["spreadsheetId", "requests"],
    }, async (i) => gapi(token, "POST", `${base}/${i.spreadsheetId}:batchUpdate`, { requests: i.requests })),

    tool("update_values", "Sets values in a range of a spreadsheet.", {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Required. The ID of the spreadsheet to update." },
        range: { type: "string", description: "Required. The A1 notation of the values to update." },
        values: { type: "array", items: { type: "array", items: {} }, description: "Required. The data to write. Array of arrays, outer = rows, inner = cells." },
      },
      required: ["spreadsheetId", "range", "values"],
    }, async (i) => gapi(token, "PUT", `${base}/${i.spreadsheetId}/values/${encodeURIComponent(i.range)}?valueInputOption=RAW`, { values: i.values })),

    tool("update_formulas", "Sets formulas in a range of a spreadsheet.", {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Required. The ID of the spreadsheet to update." },
        range: { type: "string", description: "Required. The A1 notation of the values to update." },
        formulas: { type: "array", items: { type: "array", items: {} }, description: "Required. The formulas to write. Array of arrays, outer = rows, inner = cells." },
      },
      required: ["spreadsheetId", "range", "formulas"],
    }, async (i) => gapi(token, "PUT", `${base}/${i.spreadsheetId}/values/${encodeURIComponent(i.range)}?valueInputOption=USER_ENTERED`, { values: i.formulas })),

    tool("insert_dimension", "Inserts rows or columns in a sheet at a particular index.", {
      type: "object",
      properties: {
        spreadsheetId: { type: "string", description: "Required. The ID of the spreadsheet to update." },
        sheetId: { type: "integer", description: "Required. The ID of the sheet to insert into." },
        dimension: { type: "string", enum: ["COLUMNS", "ROWS"], description: "Required. The dimension to insert." },
        startIndex: { type: "integer", description: "Required. The 0-based start index (inclusive)." },
        endIndex: { type: "integer", description: "Required. The 0-based end index (exclusive)." },
        inheritFromBefore: { type: "boolean", description: "Whether to inherit from before or after." },
      },
      required: ["spreadsheetId", "sheetId", "dimension", "startIndex", "endIndex"],
    }, async (i) => gapi(token, "POST", `${base}/${i.spreadsheetId}:batchUpdate`, {
      requests: [{
        insertDimension: {
          range: { sheetId: i.sheetId, dimension: i.dimension, startIndex: i.startIndex, endIndex: i.endIndex },
          inheritFromBefore: i.inheritFromBefore ?? false,
        },
      }],
    })),
  ];
}

// ── Drive (8 tools) ───────────────────────────────────────────────────────

function driveTools(token: string): AgentTool<any, any>[] {
  const base = "https://www.googleapis.com/drive/v3";
  return [
    tool("copy_file", "Copy an existing File in Google Drive.", {
      type: "object",
      properties: {
        fileId: { type: "string", description: "Required. The ID of the file to copy." },
        parentId: { type: "string", description: "The parent id of the newly created file." },
        title: { type: "string", description: "The title of the newly created file." },
      },
      required: ["fileId"],
    }, async (i) => gapi(token, "POST", `${base}/files/${i.fileId}/copy`, { name: i.title, parents: i.parentId ? [i.parentId] : undefined })),

    tool("create_file", "Create or upload a File to Google Drive.", {
      type: "object",
      properties: {
        title: { type: "string", description: "The title of the file." },
        parentId: { type: "string", description: "The parent id of the file." },
        textContent: { type: "string", description: "Optional. UTF-8 text content to upload." },
        base64Content: { type: "string", description: "Optional. Base64 encoded content to upload." },
        contentMimeType: { type: "string", description: "The mime type of the content being uploaded." },
        disableConversionToGoogleType: { type: "boolean", description: "Set true to retain the passed in content mime type." },
      },
    }, async (i) => {
      const mimeType = i.contentMimeType || "text/plain";
      const isGoogleType = !i.disableConversionToGoogleType && (mimeType === "text/plain" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      const targetMimeType = isGoogleType ? (mimeType === "text/plain" ? "application/vnd.google-apps.document" : mimeType) : mimeType;
      const metadata: any = { name: i.title, mimeType: targetMimeType };
      if (i.parentId) metadata.parents = [i.parentId];
      const content = i.textContent ?? (i.base64Content ? atob(i.base64Content) : "");
      const boundary = "foo_bar_baz";
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n--${boundary}--`;
      const res = await fetch(`${base}/files?uploadType=multipart`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Google Drive API ${res.status}: ${text.slice(0, 500)}`);
      return text;
    }),

    tool("download_file_content", "Download the content of a Drive file as a base64 encoded string.", {
      type: "object",
      properties: {
        fileId: { type: "string", description: "Required. The ID of the file to retrieve." },
        exportMimeType: { type: "string", description: "Optional. For Google native files, the MIME type to export to." },
      },
      required: ["fileId"],
    }, async (i) => {
      const metaRes = await gapi(token, "GET", `${base}/files/${i.fileId}?fields=mimeType`);
      const meta = JSON.parse(metaRes);
      const isGoogleNative = meta.mimeType?.startsWith("application/vnd.google-apps.");
      if (isGoogleNative && i.exportMimeType) {
        return gapi(token, "GET", `${base}/files/${i.fileId}/export?mimeType=${encodeURIComponent(i.exportMimeType)}`);
      }
      return gapi(token, "GET", `${base}/files/${i.fileId}?alt=media`);
    }),

    tool("get_file_metadata", "Get general metadata about a user's Drive file.", {
      type: "object",
      properties: {
        fileId: { type: "string", description: "Required. The ID of the file to retrieve." },
        excludeContentSnippets: { type: "boolean", description: "If true, content snippets excluded." },
      },
      required: ["fileId"],
    }, async (i) => gapi(token, "GET", `${base}/files/${i.fileId}?fields=id,name,mimeType,description,createdTime,modifiedTime,size,parents,webViewLink,iconLink,thumbnailLink,lastModifyingUser`)),

    tool("get_file_permissions", "List the permissions of a Drive File.", {
      type: "object",
      properties: {
        fileId: { type: "string", description: "Required. The ID of the file to get permissions for." },
      },
      required: ["fileId"],
    }, async (i) => gapi(token, "GET", `${base}/files/${i.fileId}/permissions`)),

    tool("list_recent_files", "Find recent files for a user with a sort order.", {
      type: "object",
      properties: {
        orderBy: { type: "string", description: "The sort order for the files. Default: recency." },
        pageSize: { type: "integer", description: "Maximum number of files to return." },
        pageToken: { type: "string", description: "Page token for pagination." },
        excludeContentSnippets: { type: "boolean" },
      },
    }, async (i) => {
      const params = new URLSearchParams({ fields: "files(id,name,mimeType,modifiedTime,webViewLink,iconLink)" });
      if (i.orderBy) params.set("orderBy", i.orderBy); else params.set("orderBy", "recency");
      if (i.pageSize) params.set("pageSize", String(i.pageSize)); else params.set("pageSize", "10");
      if (i.pageToken) params.set("pageToken", i.pageToken);
      return gapi(token, "GET", `${base}/files?${params}`);
    }),

    tool("read_file_content", "Fetch a natural language representation of a known Drive file.", {
      type: "object",
      properties: {
        fileId: { type: "string", description: "Required. The ID of the file to retrieve." },
        includeComments: { type: "boolean", description: "Whether to include comments." },
      },
      required: ["fileId"],
    }, async (i) => {
      const metaRes = await gapi(token, "GET", `${base}/files/${i.fileId}?fields=mimeType,name`);
      const meta = JSON.parse(metaRes);
      const mt = meta.mimeType || "";
      if (mt.startsWith("application/vnd.google-apps.")) {
        const exportMime = mt === "application/vnd.google-apps.document" ? "text/plain"
          : mt === "application/vnd.google-apps.spreadsheet" ? "text/csv"
          : mt === "application/vnd.google-apps.presentation" ? "text/plain"
          : "text/plain";
        const content = await gapi(token, "GET", `${base}/files/${i.fileId}/export?mimeType=${encodeURIComponent(exportMime)}`);
        return `File: ${meta.name}\nMIME: ${mt}\n\nContent:\n${content}`;
      }
      const content = await gapi(token, "GET", `${base}/files/${i.fileId}?alt=media`);
      return `File: ${meta.name}\nMIME: ${mt}\n\nContent:\n${content}`;
    }),

    tool("search_files", "Search for Drive files using a structured query.", {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query (Drive API query syntax)." },
        pageSize: { type: "integer" },
        pageToken: { type: "string" },
        excludeContentSnippets: { type: "boolean" },
      },
    }, async (i) => {
      const params = new URLSearchParams({ fields: "files(id,name,mimeType,modifiedTime,webViewLink)" });
      if (i.query) params.set("q", i.query);
      if (i.pageSize) params.set("pageSize", String(i.pageSize)); else params.set("pageSize", "10");
      if (i.pageToken) params.set("pageToken", i.pageToken);
      return gapi(token, "GET", `${base}/files?${params}`);
    }),
  ];
}

// ── Gmail (21 tools) ──────────────────────────────────────────────────────

function gmailTools(token: string): AgentTool<any, any>[] {
  const base = "https://gmail.googleapis.com/gmail/v1/users/me";
  return [
    tool("create_draft", "Creates a new draft email in the user's Gmail account.", {
      type: "object",
      properties: {
        to: { type: "string" }, subject: { type: "string" }, body: { type: "string" },
        cc: { type: "string" }, bcc: { type: "string" }, htmlBody: { type: "string" },
        replyToMessageId: { type: "string" }, attachments: { type: "array", items: { type: "object" } },
      },
    }, async (i) => {
      const headers: string[] = [];
      if (i.to) headers.push(`To: ${i.to}`);
      if (i.cc) headers.push(`Cc: ${i.cc}`);
      if (i.bcc) headers.push(`Bcc: ${i.bcc}`);
      if (i.subject) headers.push(`Subject: ${i.subject}`);
      if (i.replyToMessageId) headers.push(`In-Reply-To: ${i.replyToMessageId}`);
      const contentType = i.htmlBody ? "text/html; charset=UTF-8" : "text/plain; charset=UTF-8";
      const body = i.htmlBody ?? i.body ?? "";
      const raw = btoa(unescape(encodeURIComponent(`${headers.join("\r\n")}\r\nContent-Type: ${contentType}\r\n\r\n${body}`)));
      return gapi(token, "POST", `${base}/drafts`, { message: { raw } });
    }),

    tool("list_drafts", "Lists draft emails from the user's Gmail account.", {
      type: "object",
      properties: { pageSize: { type: "integer" }, pageToken: { type: "string" }, query: { type: "string" }, view: { type: "string" } },
    }, async (i) => {
      const params = new URLSearchParams();
      if (i.pageSize) params.set("maxResults", String(i.pageSize)); else params.set("maxResults", "10");
      if (i.pageToken) params.set("pageToken", i.pageToken);
      if (i.query) params.set("q", i.query);
      return gapi(token, "GET", `${base}/drafts?${params}`);
    }),

    tool("get_thread", "Retrieves a specific email thread.", {
      type: "object",
      properties: { threadId: { type: "string" }, messageFormat: { type: "string" } },
      required: ["threadId"],
    }, async (i) => {
      const format = i.messageFormat || "full";
      return gapi(token, "GET", `${base}/threads/${i.threadId}?format=${format}`);
    }),

    tool("get_message", "Retrieves a specific email message.", {
      type: "object",
      properties: { messageId: { type: "string" }, messageFormat: { type: "string" } },
      required: ["messageId"],
    }, async (i) => {
      const format = i.messageFormat || "full";
      return gapi(token, "GET", `${base}/messages/${i.messageId}?format=${format}`);
    }),

    tool("search_threads", "Lists email threads matching a query.", {
      type: "object",
      properties: { query: { type: "string" }, pageSize: { type: "integer" }, pageToken: { type: "string" }, includeTrash: { type: "boolean" }, view: { type: "string" } },
    }, async (i) => {
      const params = new URLSearchParams();
      if (i.query) params.set("q", i.query);
      if (i.pageSize) params.set("maxResults", String(i.pageSize)); else params.set("maxResults", "10");
      if (i.pageToken) params.set("pageToken", i.pageToken);
      if (i.includeTrash) params.set("includeSpamTrash", "true");
      return gapi(token, "GET", `${base}/threads?${params}`);
    }),

    tool("label_thread", "Adds labels to an entire thread.", {
      type: "object",
      properties: { threadId: { type: "string" }, labelIds: { type: "array", items: { type: "string" } } },
      required: ["threadId", "labelIds"],
    }, async (i) => gapi(token, "POST", `${base}/threads/${i.threadId}/modify`, { addLabelIds: i.labelIds })),

    tool("unlabel_thread", "Removes labels from an entire thread.", {
      type: "object",
      properties: { threadId: { type: "string" }, labelIds: { type: "array", items: { type: "string" } } },
      required: ["threadId", "labelIds"],
    }, async (i) => gapi(token, "POST", `${base}/threads/${i.threadId}/modify`, { removeLabelIds: i.labelIds })),

    tool("apply_sensitive_thread_label", "Adds a sensitive label (Trash or Spam) to a thread.", {
      type: "object",
      properties: { threadId: { type: "string" }, labelOption: { type: "string", enum: ["TRASH", "SPAM"] } },
      required: ["threadId", "labelOption"],
    }, async (i) => gapi(token, "POST", `${base}/threads/${i.threadId}/modify`, { addLabelIds: [i.labelOption] })),

    tool("trash_thread", "Moves an entire thread to Trash.", {
      type: "object", properties: { threadId: { type: "string" } }, required: ["threadId"],
    }, async (i) => gapi(token, "POST", `${base}/threads/${i.threadId}/trash`)),

    tool("untrash_thread", "Removes a thread from Trash.", {
      type: "object", properties: { threadId: { type: "string" } }, required: ["threadId"],
    }, async (i) => gapi(token, "POST", `${base}/threads/${i.threadId}/untrash`)),

    tool("mark_thread_spam", "Marks a thread as Spam.", {
      type: "object", properties: { threadId: { type: "string" } }, required: ["threadId"],
    }, async (i) => gapi(token, "POST", `${base}/threads/${i.threadId}/modify`, { addLabelIds: ["SPAM"] })),

    tool("unmark_thread_spam", "Unmarks a thread as Spam.", {
      type: "object", properties: { threadId: { type: "string" } }, required: ["threadId"],
    }, async (i) => gapi(token, "POST", `${base}/threads/${i.threadId}/modify`, { removeLabelIds: ["SPAM"] })),

    tool("list_labels", "Lists all labels available in the user's Gmail account.", {
      type: "object", properties: {},
    }, async () => gapi(token, "GET", `${base}/labels`)),

    tool("label_message", "Adds labels to a specific message.", {
      type: "object",
      properties: { messageId: { type: "string" }, labelIds: { type: "array", items: { type: "string" } } },
      required: ["messageId", "labelIds"],
    }, async (i) => gapi(token, "POST", `${base}/messages/${i.messageId}/modify`, { addLabelIds: i.labelIds })),

    tool("unlabel_message", "Removes labels from a specific message.", {
      type: "object",
      properties: { messageId: { type: "string" }, labelIds: { type: "array", items: { type: "string" } } },
      required: ["messageId", "labelIds"],
    }, async (i) => gapi(token, "POST", `${base}/messages/${i.messageId}/modify`, { removeLabelIds: i.labelIds })),

    tool("apply_sensitive_message_label", "Adds a sensitive label (Trash or Spam) to a message.", {
      type: "object",
      properties: { messageId: { type: "string" }, labelOption: { type: "string", enum: ["TRASH", "SPAM"] } },
      required: ["messageId", "labelOption"],
    }, async (i) => gapi(token, "POST", `${base}/messages/${i.messageId}/modify`, { addLabelIds: [i.labelOption] })),

    tool("trash_message", "Moves a message to Trash.", {
      type: "object", properties: { messageId: { type: "string" } }, required: ["messageId"],
    }, async (i) => gapi(token, "POST", `${base}/messages/${i.messageId}/trash`)),

    tool("untrash_message", "Removes a message from Trash.", {
      type: "object", properties: { messageId: { type: "string" } }, required: ["messageId"],
    }, async (i) => gapi(token, "POST", `${base}/messages/${i.messageId}/untrash`)),

    tool("mark_message_spam", "Marks a message as Spam.", {
      type: "object", properties: { messageId: { type: "string" } }, required: ["messageId"],
    }, async (i) => gapi(token, "POST", `${base}/messages/${i.messageId}/modify`, { addLabelIds: ["SPAM"] })),

    tool("unmark_message_spam", "Unmarks a message as Spam.", {
      type: "object", properties: { messageId: { type: "string" } }, required: ["messageId"],
    }, async (i) => gapi(token, "POST", `${base}/messages/${i.messageId}/modify`, { removeLabelIds: ["SPAM"] })),

    tool("create_label", "Creates a new label in the user's Gmail account.", {
      type: "object",
      properties: {
        displayName: { type: "string" },
        color: { type: "object" },
        colorPreset: { type: "string" },
        autoCreateParentLabels: { type: "boolean" },
      },
      required: ["displayName"],
    }, async (i) => gapi(token, "POST", `${base}/labels`, { name: i.displayName, color: i.color })),
  ];
}

// ── Docs (2 tools) ────────────────────────────────────────────────────────

function docsTools(token: string): AgentTool<any, any>[] {
  const base = "https://docs.googleapis.com/v1/documents";
  return [
    tool("read_doc", "Retrieves a JSON representation of the Google Doc.", {
      type: "object",
      properties: { documentId: { type: "string", description: "Required. The document ID." } },
      required: ["documentId"],
    }, async (i) => gapi(token, "GET", `${base}/${i.documentId}`)),

    tool("update_doc", "Updates a document using batch update requests.", {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Required. The document ID." },
        requests: { type: "array", items: { type: "object", additionalProperties: true }, description: "Required. Batch update requests." },
      },
      required: ["documentId"],
    }, async (i) => gapi(token, "POST", `${base}/${i.documentId}:batchUpdate`, { requests: i.requests })),
  ];
}

// ── Slides (2 tools) ──────────────────────────────────────────────────────

function slidesTools(token: string): AgentTool<any, any>[] {
  const base = "https://slides.googleapis.com/v1/presentations";
  return [
    tool("read_presentation", "Read a JSON representation of a Google Slides presentation.", {
      type: "object",
      properties: { presentationId: { type: "string", description: "Required. The presentation ID." } },
      required: ["presentationId"],
    }, async (i) => gapi(token, "GET", `${base}/${i.presentationId}`)),

    tool("update_presentation", "Updates a presentation with batchUpdate requests.", {
      type: "object",
      properties: {
        presentationId: { type: "string", description: "Required. The presentation ID." },
        requests: { type: "array", items: { type: "object", additionalProperties: true }, description: "Required. Batch update requests." },
      },
      required: ["presentationId", "requests"],
    }, async (i) => gapi(token, "POST", `${base}/${i.presentationId}:batchUpdate`, { requests: i.requests })),
  ];
}

// ── Calendar (9 tools) ────────────────────────────────────────────────────

function calendarTools(token: string): AgentTool<any, any>[] {
  const base = "https://www.googleapis.com/calendar/v3";
  return [
    tool("list_events", "Returns events on the given calendar matching constraints.", {
      type: "object",
      properties: {
        calendarId: { type: "string", description: "Calendar ID. Defaults to primary." },
        startTime: { type: "string", description: "RFC3339 timestamp for timeMin." },
        endTime: { type: "string", description: "RFC3339 timestamp for timeMax." },
        eventType: { type: "string" },
        fullText: { type: "string" },
        orderBy: { type: "string" },
        pageSize: { type: "integer" },
        pageToken: { type: "string" },
        timeZone: { type: "string" },
      },
    }, async (i) => {
      const calId = i.calendarId || "primary";
      const params = new URLSearchParams();
      if (i.startTime) params.set("timeMin", i.startTime);
      if (i.endTime) params.set("timeMax", i.endTime);
      if (i.eventType) params.set("eventType", i.eventType);
      if (i.fullText) params.set("q", i.fullText);
      if (i.orderBy) params.set("orderBy", i.orderBy); else params.set("orderBy", "startTime");
      if (i.pageSize) params.set("maxResults", String(i.pageSize)); else params.set("maxResults", "10");
      if (i.pageToken) params.set("pageToken", i.pageToken);
      if (i.timeZone) params.set("timeZone", i.timeZone);
      params.set("singleEvents", "true");
      return gapi(token, "GET", `${base}/calendars/${encodeURIComponent(calId)}/events?${params}`);
    }),

    tool("get_event", "Returns a single event on the given calendar.", {
      type: "object",
      properties: { calendarId: { type: "string" }, eventId: { type: "string" } },
      required: ["eventId"],
    }, async (i) => gapi(token, "GET", `${base}/calendars/${encodeURIComponent(i.calendarId || "primary")}/events/${i.eventId}`)),

    tool("list_calendars", "Returns the calendars the user has access to.", {
      type: "object",
      properties: { pageSize: { type: "integer" }, pageToken: { type: "string" } },
    }, async (i) => {
      const params = new URLSearchParams();
      if (i.pageSize) params.set("maxResults", String(i.pageSize));
      if (i.pageToken) params.set("pageToken", i.pageToken);
      return gapi(token, "GET", `${base}/users/me/calendarList?${params}`);
    }),

    tool("suggest_time", "Suggests time periods across one or more calendars using free/busy.", {
      type: "object",
      properties: {
        attendeeEmails: { type: "array", items: { type: "string" } },
        startTime: { type: "string" },
        endTime: { type: "string" },
        durationMinutes: { type: "integer" },
        timeZone: { type: "string" },
        preferences: { type: "object" },
      },
      required: ["attendeeEmails", "startTime", "endTime"],
    }, async (i) => {
      const items = i.attendeeEmails.map((e: string) => ({ id: e }));
      return gapi(token, "POST", `${base}/freeBusy`, {
        timeMin: i.startTime,
        timeMax: i.endTime,
        timeZone: i.timeZone || "UTC",
        items,
      });
    }),

    tool("create_event", "Creates an event on the given calendar.", {
      type: "object",
      properties: {
        calendarId: { type: "string" },
        summary: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        description: { type: "string" },
        location: { type: "string" },
        attendeeEmails: { type: "array", items: { type: "string" } },
        attendees: { type: "array", items: { type: "object" } },
        allDay: { type: "boolean" },
        timeZone: { type: "string" },
        addGoogleMeetUrl: { type: "boolean" },
        colorId: { type: "string" },
        visibility: { type: "string" },
        recurrenceData: { type: "string" },
        attachments: { type: "array", items: { type: "object" } },
        availability: { type: "string" },
        guestPermissions: { type: "object" },
        notificationLevel: { type: "string" },
        overrideReminders: { type: "array", items: { type: "object" } },
        eventType: { type: "string" },
        googleMeetUrl: { type: "string" },
        workingLocationProperties: { type: "object" },
      },
      required: ["summary", "startTime", "endTime"],
    }, async (i) => {
      const calId = i.calendarId || "primary";
      const event: any = { summary: i.summary, start: i.allDay ? { date: i.startTime } : { dateTime: i.startTime, timeZone: i.timeZone }, end: i.allDay ? { date: i.endTime } : { dateTime: i.endTime, timeZone: i.timeZone } };
      if (i.description) event.description = i.description;
      if (i.location) event.location = i.location;
      if (i.attendeeEmails) event.attendees = i.attendeeEmails.map((e: string) => ({ email: e }));
      if (i.attendees) event.attendees = i.attendees;
      if (i.recurrenceData) event.recurrence = [i.recurrenceData];
      if (i.colorId) event.colorId = i.colorId;
      if (i.visibility) event.visibility = i.visibility;
      if (i.addGoogleMeetUrl) event.conferenceData = { createRequest: { requestId: `meet-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } } };
      return gapi(token, "POST", `${base}/calendars/${encodeURIComponent(calId)}/events?conferenceDataVersion=1`, event);
    }),

    tool("update_event", "Updates an event on the given calendar.", {
      type: "object",
      properties: {
        calendarId: { type: "string" },
        eventId: { type: "string" },
        summary: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        description: { type: "string" },
        location: { type: "string" },
        allDay: { type: "boolean" },
        timeZone: { type: "string" },
        addGoogleMeetUrl: { type: "boolean" },
        addedAttendeeEmails: { type: "array", items: { type: "string" } },
        removedAttendeeEmails: { type: "array", items: { type: "string" } },
        addedAttachments: { type: "array", items: { type: "object" } },
        removedAttachmentFileUrls: { type: "array", items: { type: "string" } },
        colorId: { type: "string" },
        visibility: { type: "string" },
        guestPermissions: { type: "object" },
        notificationLevel: { type: "string" },
        overrideReminders: { type: "array", items: { type: "object" } },
        googleMeetUrl: { type: "string" },
        availability: { type: "string" },
        addedAttendees: { type: "array", items: { type: "object" } },
      },
      required: ["eventId"],
    }, async (i) => {
      const calId = i.calendarId || "primary";
      const event: any = {};
      if (i.summary) event.summary = i.summary;
      if (i.startTime) event.start = i.allDay ? { date: i.startTime } : { dateTime: i.startTime, timeZone: i.timeZone };
      if (i.endTime) event.end = i.allDay ? { date: i.endTime } : { dateTime: i.endTime, timeZone: i.timeZone };
      if (i.description !== undefined) event.description = i.description;
      if (i.location !== undefined) event.location = i.location;
      if (i.colorId) event.colorId = i.colorId;
      if (i.visibility) event.visibility = i.visibility;
      if (i.addGoogleMeetUrl) event.conferenceData = { createRequest: { requestId: `meet-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } } };
      return gapi(token, "PATCH", `${base}/calendars/${encodeURIComponent(calId)}/events/${i.eventId}?conferenceDataVersion=1`, event);
    }),

    tool("delete_event", "Deletes an event on the given calendar.", {
      type: "object",
      properties: { calendarId: { type: "string" }, eventId: { type: "string" }, notificationLevel: { type: "string" } },
      required: ["eventId"],
    }, async (i) => gapi(token, "DELETE", `${base}/calendars/${encodeURIComponent(i.calendarId || "primary")}/events/${i.eventId}`)),

    tool("respond_to_event", "Responds to an event on a calendar.", {
      type: "object",
      properties: {
        calendarId: { type: "string" },
        eventId: { type: "string" },
        responseStatus: { type: "string", enum: ["accepted", "declined", "tentative", "needsAction"] },
        responseComment: { type: "string" },
        notificationLevel: { type: "string" },
      },
      required: ["eventId", "responseStatus"],
    }, async (i) => {
      const calId = i.calendarId || "primary";
      return gapi(token, "PATCH", `${base}/calendars/${encodeURIComponent(calId)}/events/${i.eventId}?sendUpdates=all`, {
        attendees: [{ responseStatus: i.responseStatus, comment: i.responseComment }],
      });
    }),

    tool("search_events", "Searches events on the user's primary calendar using text search.", {
      type: "object",
      properties: { query: { type: "string" }, pageSize: { type: "integer" }, pageToken: { type: "string" } },
      required: ["query"],
    }, async (i) => {
      const params = new URLSearchParams({ q: i.query, singleEvents: "true", orderBy: "startTime" });
      if (i.pageSize) params.set("maxResults", String(i.pageSize)); else params.set("maxResults", "10");
      if (i.pageToken) params.set("pageToken", i.pageToken);
      return gapi(token, "GET", `${base}/calendars/primary/events?${params}`);
    }),
  ];
}

// ── Chat (4 tools) ────────────────────────────────────────────────────────

function chatTools(token: string): AgentTool<any, any>[] {
  const base = "https://chat.googleapis.com/v1";
  return [
    tool("list_messages", "Retrieves messages from a specified Google Chat conversation.", {
      type: "object",
      properties: {
        conversationId: { type: "string", description: "Required. The conversation (space) ID." },
        pageSize: { type: "integer" },
        pageToken: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        threadId: { type: "string" },
      },
      required: ["conversationId"],
    }, async (i) => {
      const parent = `spaces/${i.conversationId}`;
      const params = new URLSearchParams();
      if (i.pageSize) params.set("pageSize", String(i.pageSize)); else params.set("pageSize", "20");
      if (i.pageToken) params.set("pageToken", i.pageToken);
      if (i.startTime) params.set("filter", `createTime > "${i.startTime}"`);
      if (i.endTime) params.set("filter", `createTime < "${i.endTime}"`);
      return gapi(token, "GET", `${base}/${parent}/messages?${params}`);
    }),

    tool("search_messages", "Searches for Google Chat messages using keywords and filters.", {
      type: "object",
      properties: {
        searchParameters: { type: "object", description: "Required. Search parameters." },
        pageSize: { type: "integer" },
        pageToken: { type: "string" },
      },
      required: ["searchParameters"],
    }, async (i) => {
      const params = new URLSearchParams();
      if (i.pageSize) params.set("pageSize", String(i.pageSize)); else params.set("pageSize", "20");
      if (i.pageToken) params.set("pageToken", i.pageToken);
      const query = typeof i.searchParameters === "string" ? i.searchParameters : JSON.stringify(i.searchParameters);
      params.set("query", query);
      return gapi(token, "GET", `${base}/spaces:searchMessages?${params}`);
    }),

    tool("search_conversations", "Searches for Google Chat conversations by display name.", {
      type: "object",
      properties: {
        pageSize: { type: "integer" },
        pageToken: { type: "string" },
        participants: { type: "array", items: { type: "string" } },
        spaceNameQuery: { type: "string" },
      },
    }, async (i) => {
      const params = new URLSearchParams();
      if (i.pageSize) params.set("pageSize", String(i.pageSize)); else params.set("pageSize", "20");
      if (i.pageToken) params.set("pageToken", i.pageToken);
      if (i.spaceNameQuery) params.set("filter", `displayName:"${i.spaceNameQuery}"`);
      return gapi(token, "GET", `${base}/spaces?${params}`);
    }),

    tool("send_message", "Sends a Google Chat message to a conversation.", {
      type: "object",
      properties: {
        conversationId: { type: "string", description: "Required. The conversation (space) ID." },
        messageText: { type: "string", description: "Required. The message text (Markdown supported)." },
        threadId: { type: "string" },
      },
      required: ["conversationId", "messageText"],
    }, async (i) => {
      const parent = `spaces/${i.conversationId}`;
      const body: any = { text: i.messageText };
      if (i.threadId) body.thread = { name: `${parent}/threads/${i.threadId}` };
      return gapi(token, "POST", `${base}/${parent}/messages`, body);
    }),
  ];
}

// ── People (3 tools) ──────────────────────────────────────────────────────

function peopleTools(token: string): AgentTool<any, any>[] {
  const base = "https://people.googleapis.com/v1";
  return [
    tool("search_directory_people", "Search for people within your organization's Google Workspace directory.", {
      type: "object",
      properties: {
        query: { type: "string" },
        pageSize: { type: "integer" },
        pageToken: { type: "string" },
        sources: { type: "array", items: { type: "string" } },
      },
    }, async (i) => {
      const params = new URLSearchParams({ readMask: "person.names,person.emailAddresses,person.photos" });
      if (i.query) params.set("query", i.query);
      if (i.pageSize) params.set("pageSize", String(i.pageSize)); else params.set("pageSize", "10");
      if (i.pageToken) params.set("pageToken", i.pageToken);
      if (i.sources) params.set("sources", i.sources.join(","));
      return gapi(token, "GET", `${base}/people:searchDirectoryPeople?${params}`);
    }),

    tool("search_contacts", "Search user's contacts.", {
      type: "object",
      properties: {
        query: { type: "string" },
        maxResults: { type: "integer" },
      },
    }, async (i) => {
      const params = new URLSearchParams({ readMask: "person.names,person.emailAddresses,person.photos" });
      if (i.query) params.set("query", i.query);
      if (i.maxResults) params.set("pageSize", String(i.maxResults)); else params.set("pageSize", "10");
      return gapi(token, "GET", `${base}/people:searchContacts?${params}`);
    }),

    tool("get_user_profile", "Get profile info about yourself (name and email).", {
      type: "object", properties: {},
    }, async () => gapi(token, "GET", `${base}/people/me?personFields=names,emailAddresses,photos`)),
  ];
}

// ── Main loader ───────────────────────────────────────────────────────────

const SERVICE_LOADERS: Record<string, (token: string) => AgentTool<any, any>[]> = {
  sheets: sheetsTools,
  drive: driveTools,
  gmail: gmailTools,
  docs: docsTools,
  slides: slidesTools,
  calendar: calendarTools,
  chat: chatTools,
  people: peopleTools,
};

/**
 * Load Google Workspace tools that call REST APIs directly (bypassing the MCP server).
 * This avoids the Developer Preview enrollment requirement.
 * Returns AgentTool[] for the given Google Workspace MCP server configs.
 */
export async function loadGoogleWorkspaceTools(
  servers: MCPServerConfig[],
  onApiError?: (type: "rate_limit" | "funding", details: { serverLabel: string; toolName: string; message: string }) => void,
): Promise<AgentTool<any, any>[]> {
  const allTools: AgentTool<any, any>[] = [];

  for (const config of servers) {
    if (!config.url || !isGoogleWorkspaceMcp(config.url)) continue;
    const service = GOOGLE_MCP_URLS[config.url];
    const loader = SERVICE_LOADERS[service];
    if (!loader) continue;

    const token = config.authToken;
    if (!token) {
      console.warn(`[google-workspace] No auth token for ${config.url}, skipping`);
      continue;
    }

    const label = config.name ?? service;
    const tools = loader(token);
    console.log(`[google-workspace:${label}] loaded ${tools.length} direct REST tools (bypassing MCP preview)`);

    // Wrap each tool's execute to handle errors consistently
    for (const t of tools) {
      const origExecute = t.execute;
      t.execute = async (input: any, ctx?: any) => {
        try {
          const result = await origExecute(input, ctx);
          return result || `(tool ${t.name} returned no output)`;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[google-workspace:${label}] tool ${t.name} failed: ${msg.slice(0, 300)}`);
          return `[ERROR] ${t.name} failed: ${msg}`;
        }
      };
      allTools.push(t);
    }
  }

  return allTools;
}
