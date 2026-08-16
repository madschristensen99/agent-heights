-- Seed the marketplace with 8 Google Workspace MCP agents.
-- Each connects to an official Google remote MCP server via OAuth 2.0.
-- Requires GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET env vars
-- and a Google Cloud project with the Workspace APIs + MCP services enabled.
-- Docs: https://developers.google.com/workspace/guides/configure-mcp-servers

DELETE FROM public.heights_cloud_agents
WHERE name IN (
  'Gmail Agent',
  'Google Drive Agent',
  'Google Docs Agent',
  'Google Sheets Agent',
  'Google Slides Agent',
  'Google Calendar Agent',
  'Google Chat Agent',
  'Google Contacts Agent'
);

INSERT INTO public.heights_cloud_agents (name, agent, description, summary, tags, is_free, price, price_usd, language, search_type, status, use_cases, category, requirements, links, image_url)
VALUES
  (
    'Gmail Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Gmail agent connected via the Google Workspace Gmail MCP server. You can search email threads, read messages, get thread context, create drafts, manage labels, and list drafts/labels. You help users find specific emails, summarize conversations, draft replies, and organize their inbox. Always confirm before sending or labeling emails. Be concise and precise when summarizing threads. You are professional, efficient, and respect email etiquette.","provider":"cline","source":"agent-heights","appearance":{"skin":0,"hairStyle":1,"hair":0,"shirt":4,"pants":2,"accessory":0,"accent":3,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"name":"Gmail","url":"https://gmailmcp.googleapis.com/mcp/v1","authType":"oauth"}]}',
    'Gmail Agent — search, read, and draft emails via the official Google Gmail MCP server (OAuth).

This agent can:
• Search email threads by query
• Read messages and get full thread context
• Create email drafts for review before sending
• Manage labels (apply, remove, list)
• List existing drafts and labels

To connect: Click "Connect via OAuth" when hiring this agent. You will sign in with your Google Account.',
    'Gmail agent — search, read, and draft emails via Google Workspace MCP (OAuth)',
    'gmail,google,workspace,email,mcp,productivity,oauth',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Search email threads by sender, subject, or content","Read and summarize email messages and threads","Create email drafts for review before sending","Manage Gmail labels — apply, remove, list"]',
    '["Productivity"]',
    '["Google Account (OAuth connection required)"]',
    '[{"label":"Gmail MCP Server","url":"https://gmailmcp.googleapis.com/mcp/v1"},{"label":"Google Workspace MCP Docs","url":"https://developers.google.com/workspace/guides/configure-mcp-servers"}]',
    'https://icons.duckduckgo.com/ip3/google.com.ico'
  ),
  (
    'Google Drive Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Google Drive agent connected via the Google Workspace Drive MCP server. You can search files, read file content, download file content, get file metadata and permissions, list recent files, create files, and copy files. You help users find documents, read their contents, and manage their Drive. Always confirm before creating or modifying files. Be thorough when summarizing file contents.","provider":"cline","source":"agent-heights","appearance":{"skin":1,"hairStyle":3,"hair":2,"shirt":6,"pants":4,"accessory":2,"accent":5,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"name":"Google Drive","url":"https://drivemcp.googleapis.com/mcp/v1","authType":"oauth"}]}',
    'Google Drive Agent — search, read, and manage files via the official Google Drive MCP server (OAuth).

This agent can:
• Search for files by name or content
• Read and download file contents
• Get file metadata and permissions
• List recent files
• Create and copy files

To connect: Click "Connect via OAuth" when hiring this agent. You will sign in with your Google Account.',
    'Google Drive agent — search, read, and manage files via Google Workspace MCP (OAuth)',
    'google,drive,workspace,files,mcp,productivity,oauth',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Search for files by name or content","Read and download file contents","Get file metadata and permissions","Create and copy files","List recent files"]',
    '["Productivity"]',
    '["Google Account (OAuth connection required)"]',
    '[{"label":"Google Drive MCP Server","url":"https://drivemcp.googleapis.com/mcp/v1"},{"label":"Google Workspace MCP Docs","url":"https://developers.google.com/workspace/guides/configure-mcp-servers"}]',
    'https://icons.duckduckgo.com/ip3/google.com.ico'
  ),
  (
    'Google Docs Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Google Docs agent connected via the Google Workspace Docs MCP server. You can read document structure and contents, and update documents. You help users extract information from Google Docs, summarize their content, and make edits. Always confirm before modifying documents. Preserve formatting and structure when updating.","provider":"cline","source":"agent-heights","appearance":{"skin":2,"hairStyle":0,"hair":3,"shirt":8,"pants":6,"accessory":1,"accent":7,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"name":"Google Docs","url":"https://docsmcp.googleapis.com/mcp/v1","authType":"oauth"}]}',
    'Google Docs Agent — read and update Google Docs via the official Google Docs MCP server (OAuth).

This agent can:
• Read document structure and full contents
• Update document content
• Summarize long documents
• Extract specific sections from documents

To connect: Click "Connect via OAuth" when hiring this agent. You will sign in with your Google Account.',
    'Google Docs agent — read and update documents via Google Workspace MCP (OAuth)',
    'google,docs,workspace,documents,mcp,productivity,oauth',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Read document structure and full contents","Update and edit Google Docs","Summarize long documents","Extract specific sections from documents"]',
    '["Productivity"]',
    '["Google Account (OAuth connection required)"]',
    '[{"label":"Google Docs MCP Server","url":"https://docsmcp.googleapis.com/mcp/v1"},{"label":"Google Workspace MCP Docs","url":"https://developers.google.com/workspace/guides/configure-mcp-servers"}]',
    'https://icons.duckduckgo.com/ip3/google.com.ico'
  ),
  (
    'Google Sheets Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Google Sheets agent connected via the Google Workspace Sheets MCP server. You can get spreadsheet values, get spreadsheet metadata, update values, update formulas, update spreadsheet properties, and insert dimensions (rows/columns). You help users read data from spreadsheets, analyze it, make updates, and perform calculations. Always confirm before modifying spreadsheet data. Be precise when working with cell ranges and formulas.","provider":"cline","source":"agent-heights","appearance":{"skin":0,"hairStyle":4,"hair":4,"shirt":10,"pants":8,"accessory":3,"accent":9,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"name":"Google Sheets","url":"https://sheetsmcp.googleapis.com/mcp/v1","authType":"oauth"}]}',
    'Google Sheets Agent — read and update spreadsheets via the official Google Sheets MCP server (OAuth).

This agent can:
• Get cell values and spreadsheet metadata
• Update cell values and formulas
• Update spreadsheet properties
• Insert rows and columns
• Analyze and summarize spreadsheet data

To connect: Click "Connect via OAuth" when hiring this agent. You will sign in with your Google Account.',
    'Google Sheets agent — read and update spreadsheets via Google Workspace MCP (OAuth)',
    'google,sheets,workspace,spreadsheets,mcp,productivity,oauth',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Get cell values and spreadsheet metadata","Update cell values and formulas","Insert rows and columns","Analyze and summarize spreadsheet data"]',
    '["Productivity"]',
    '["Google Account (OAuth connection required)"]',
    '[{"label":"Google Sheets MCP Server","url":"https://sheetsmcp.googleapis.com/mcp/v1"},{"label":"Google Workspace MCP Docs","url":"https://developers.google.com/workspace/guides/configure-mcp-servers"}]',
    'https://icons.duckduckgo.com/ip3/google.com.ico'
  ),
  (
    'Google Slides Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Google Slides agent connected via the Google Workspace Slides MCP server. You can read presentation structure and visual layout, and update presentations. You help users understand slide content, summarize presentations, and make edits. Always confirm before modifying presentations. Describe slide layouts clearly when summarizing.","provider":"cline","source":"agent-heights","appearance":{"skin":1,"hairStyle":5,"hair":5,"shirt":12,"pants":10,"accessory":4,"accent":11,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"name":"Google Slides","url":"https://slidesmcp.googleapis.com/mcp/v1","authType":"oauth"}]}',
    'Google Slides Agent — read and update presentations via the official Google Slides MCP server (OAuth).

This agent can:
• Read presentation structure and visual layout
• Update presentation content
• Summarize slide decks
• Extract specific slide content

To connect: Click "Connect via OAuth" when hiring this agent. You will sign in with your Google Account.',
    'Google Slides agent — read and update presentations via Google Workspace MCP (OAuth)',
    'google,slides,workspace,presentations,mcp,productivity,oauth',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Read presentation structure and visual layout","Update presentation content","Summarize slide decks","Extract specific slide content"]',
    '["Productivity"]',
    '["Google Account (OAuth connection required)"]',
    '[{"label":"Google Slides MCP Server","url":"https://slidesmcp.googleapis.com/mcp/v1"},{"label":"Google Workspace MCP Docs","url":"https://developers.google.com/workspace/guides/configure-mcp-servers"}]',
    'https://icons.duckduckgo.com/ip3/google.com.ico'
  ),
  (
    'Google Calendar Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Google Calendar agent connected via the Google Workspace Calendar MCP server. You can list calendars, list events, get event details, search events, create events, update events, delete events, respond to event invitations, and suggest meeting times based on free/busy. You help users manage their schedule, find meeting times, and stay organized. Always confirm before creating, modifying, or deleting events. Be clear about dates, times, and timezones.","provider":"cline","source":"agent-heights","appearance":{"skin":2,"hairStyle":6,"hair":6,"shirt":1,"pants":12,"accessory":5,"accent":2,"beard":1,"eyeColor":1,"headFeature":0},"mcpServers":[{"name":"Google Calendar","url":"https://calendarmcp.googleapis.com/mcp/v1","authType":"oauth"}]}',
    'Google Calendar Agent — manage events and schedule via the official Google Calendar MCP server (OAuth).

This agent can:
• List calendars and upcoming events
• Get event details and search for specific events
• Create, update, and delete events
• Respond to event invitations (accept/decline/tentative)
• Suggest available meeting times based on free/busy

To connect: Click "Connect via OAuth" when hiring this agent. You will sign in with your Google Account.',
    'Google Calendar agent — manage events and schedule via Google Workspace MCP (OAuth)',
    'google,calendar,workspace,scheduling,mcp,productivity,oauth',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["List calendars and upcoming events","Create, update, and delete events","Search for specific events","Respond to event invitations","Suggest available meeting times based on free/busy"]',
    '["Productivity"]',
    '["Google Account (OAuth connection required)"]',
    '[{"label":"Google Calendar MCP Server","url":"https://calendarmcp.googleapis.com/mcp/v1"},{"label":"Google Workspace MCP Docs","url":"https://developers.google.com/workspace/guides/configure-mcp-servers"}]',
    'https://icons.duckduckgo.com/ip3/google.com.ico'
  ),
  (
    'Google Chat Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Google Chat agent connected via the Google Workspace Chat MCP server. You can list spaces, list memberships, read messages, and create messages in Google Chat. You help users monitor conversations, find information in chat threads, and send messages to spaces. Always confirm before sending messages. Be concise and professional in chat communications.","provider":"cline","source":"agent-heights","appearance":{"skin":0,"hairStyle":2,"hair":7,"shirt":3,"pants":14,"accessory":0,"accent":6,"beard":0,"eyeColor":0,"headFeature":0},"mcpServers":[{"name":"Google Chat","url":"https://chatmcp.googleapis.com/mcp/v1","authType":"oauth"}]}',
    'Google Chat Agent — read and send messages in Google Chat via the official Google Chat MCP server (OAuth).

This agent can:
• List Chat spaces and memberships
• Read messages in spaces
• Create and send messages to spaces
• Monitor conversations and find information in chat threads

To connect: Click "Connect via OAuth" when hiring this agent. You will sign in with your Google Account.',
    'Google Chat agent — read and send messages in Google Chat via Google Workspace MCP (OAuth)',
    'google,chat,workspace,messaging,mcp,communication,oauth',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["List Chat spaces and memberships","Read messages in spaces","Create and send messages to spaces","Monitor conversations and find information in chat threads"]',
    '["Communication"]',
    '["Google Account (OAuth connection required)"]',
    '[{"label":"Google Chat MCP Server","url":"https://chatmcp.googleapis.com/mcp/v1"},{"label":"Google Workspace MCP Docs","url":"https://developers.google.com/workspace/guides/configure-mcp-servers"}]',
    'https://icons.duckduckgo.com/ip3/google.com.ico'
  ),
  (
    'Google Contacts Agent',
    '{"model":"claude-sonnet-4-20250514","systemPrompt":"You are a Google Contacts agent connected via the Google People API MCP server. You can retrieve user profile information, list contacts, and search the directory. You help users look up contact details, find people in their organization, and retrieve profile information. Be precise when presenting contact information and respect privacy.","provider":"cline","source":"agent-heights","appearance":{"skin":1,"hairStyle":1,"hair":0,"shirt":5,"pants":16,"accessory":2,"accent":8,"beard":2,"eyeColor":1,"headFeature":0},"mcpServers":[{"name":"Google People","url":"https://people.googleapis.com/mcp/v1","authType":"oauth"}]}',
    'Google Contacts Agent — look up contacts and profile info via the official Google People API MCP server (OAuth).

This agent can:
• Retrieve your Google profile information
• List and search contacts
• Search the organization directory
• Look up contact details (email, phone, etc.)

To connect: Click "Connect via OAuth" when hiring this agent. You will sign in with your Google Account.',
    'Google Contacts agent — look up contacts and profile info via Google People API MCP (OAuth)',
    'google,contacts,people,workspace,mcp,productivity,oauth',
    true,
    null,
    null,
    'TypeScript',
    'agent',
    'approved',
    '["Retrieve your Google profile information","List and search contacts","Search the organization directory","Look up contact details (email, phone, etc.)"]',
    '["Productivity"]',
    '["Google Account (OAuth connection required)"]',
    '[{"label":"Google People API MCP Server","url":"https://people.googleapis.com/mcp/v1"},{"label":"Google Workspace MCP Docs","url":"https://developers.google.com/workspace/guides/configure-mcp-servers"}]',
    'https://icons.duckduckgo.com/ip3/google.com.ico'
  )
ON CONFLICT (name) DO NOTHING;
