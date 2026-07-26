import { describe, it, expect } from "vitest";
import { buildLoopNudge } from "../server/providers/text-tools.js";

describe("buildLoopNudge", () => {
  it("produces browser-specific nudge for browser tool loops", () => {
    const nudge = buildLoopNudge(["browser_extract_text"], "exact same tool calls as the previous turn");
    expect(nudge).toContain("browser interaction");
    expect(nudge).toContain("selector");
    expect(nudge).toContain("modal");
  });

  it("produces browser-specific nudge for browse_url loops", () => {
    const nudge = buildLoopNudge(["browse_url"], "the same tool(s) repeatedly (browse_url called 3+ times)");
    expect(nudge).toContain("browser interaction");
  });

  it("produces file-specific nudge for read_files loops", () => {
    const nudge = buildLoopNudge(["read_files"], "exact same tool calls as the previous turn");
    expect(nudge).toContain("file contents");
    expect(nudge).toContain("write_files");
  });

  it("produces bash-specific nudge for bash loops", () => {
    const nudge = buildLoopNudge(["bash"], "exact same tool calls as the previous turn");
    expect(nudge).toContain("command");
    expect(nudge).toContain("output");
  });

  it("produces generic nudge for unknown tool loops", () => {
    const nudge = buildLoopNudge(["some_mcp_tool"], "exact same tool calls as the previous turn");
    expect(nudge).toContain("results from these tool calls");
    expect(nudge).toContain("submit_and_exit");
  });

  it("includes the reason in the nudge message", () => {
    const reason = "the same tool(s) repeatedly (browser_extract_text called 3+ times)";
    const nudge = buildLoopNudge(["browser_extract_text"], reason);
    expect(nudge).toContain(reason);
  });

  it("handles multiple repeated tools, prioritizing browser context", () => {
    const nudge = buildLoopNudge(["browser_click", "browser_extract_text"], "exact same tool calls as the previous turn");
    expect(nudge).toContain("browser interaction");
  });

  it("handles multiple repeated tools, prioritizing file context when no browser tools", () => {
    const nudge = buildLoopNudge(["read_files", "list_files"], "exact same tool calls as the previous turn");
    expect(nudge).toContain("file contents");
  });
});
