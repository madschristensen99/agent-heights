# ah-cli

Agent Heights CLI Bridge — stream external coding tool activity into your virtual office.

## Install

```bash
cd ah-cli && npm install && npm run build
npm link  # makes `ah` and `ah-hook` available globally
```

## Setup

Set your auth token (get it from Agent Heights → Settings → API):

```bash
export AH_TOKEN=your_token_here
export AH_HOST=ws://localhost:3001  # or wss://your-domain.com
```

## Commands

### `ah watch` — File watcher

Watches a directory for file changes and streams activity to the office.

```bash
ah watch --tool claude-code
ah watch --tool codex --dir /path/to/project
```

### `ah wrap` — Command wrapper

Wraps a CLI command and reports its execution as an activity event.

```bash
ah wrap "codex fix-bug.ts"
ah wrap "aider --message 'Add tests'" --tool aider
```

### `ah-hook` — Claude Code hook

Reads hook event JSON from stdin and sends it to the office.

```bash
# In Claude Code settings.json:
{
  "hooks": {
    "after_edit": "ah-hook --after-edit",
    "on_commit": "ah-hook --on-commit"
  }
}

# Or pipe directly:
echo '{"event":"file_edit","file":"src/index.ts"}' | ah-hook
```

## Privacy

- Only metadata is sent: file names, line counts, git branch, tool state
- **No file contents** are ever transmitted
- Sessions are ephemeral and cleared on disconnect
