import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

// links in agent output should open outside the game
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/** Agent/boss text → sanitized HTML. Everything else stays plain. */
export function md(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { async: false }));
}
