/** The developer docs, in tab order. Linked from the sidebar, the publish wizard, the sitemap and llms.txt. */
export const docsPages = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/prompts", label: "AI prompts" },
  { href: "/docs/details", label: "Game details" },
  { href: "/docs/sdk", label: "Game SDK" },
  { href: "/docs/mcp", label: "MCP & agents" },
] as const;

export type DocsPath = (typeof docsPages)[number]["href"];
