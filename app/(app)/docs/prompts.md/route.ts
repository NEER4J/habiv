import { promptsMarkdown } from "@/lib/ai-prompts";

/** The /docs/prompts page as plain Markdown, for AI assistants and crawlers. */
export function GET() {
  return new Response(promptsMarkdown(), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
