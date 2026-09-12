/**
 * Tools and agents people build games with. There is no public catalog for these (models come
 * from models.dev), so this list is kept by hand. `aliases` catch what people and MCP clients
 * actually send (lower case, matched after trimming), so "claude-code" and "CC" both land on
 * "Claude Code". Add new tools here; the picker, filters and normalisation all read this list.
 */
export type AgentKind = "cli" | "editor" | "builder" | "chat";

export type AgentEntry = { id: string; name: string; maker: string; kind: AgentKind; aliases: string[] };

export const AGENT_KINDS: { id: AgentKind; name: string }[] = [
  { id: "cli", name: "Terminal agents" },
  { id: "editor", name: "Editors and IDE agents" },
  { id: "builder", name: "App builders" },
  { id: "chat", name: "Chat apps" },
];

export const AGENTS: AgentEntry[] = [
  // Terminal agents
  { id: "claude-code", name: "Claude Code", maker: "Anthropic", kind: "cli", aliases: ["claude-code", "claudecode", "cc", "claude code cli"] },
  { id: "codex", name: "Codex", maker: "OpenAI", kind: "cli", aliases: ["codex cli", "codex-cli", "openai codex", "codex-mcp-client", "codex_cli_rs"] },
  { id: "gemini-cli", name: "Gemini CLI", maker: "Google", kind: "cli", aliases: ["gemini-cli", "gemini cli", "gemini-cli-mcp-client"] },
  { id: "copilot-cli", name: "GitHub Copilot CLI", maker: "GitHub", kind: "cli", aliases: ["copilot-cli", "copilot cli", "gh copilot"] },
  { id: "opencode", name: "opencode", maker: "SST", kind: "cli", aliases: ["open code", "sst opencode"] },
  { id: "amp", name: "Amp", maker: "Sourcegraph", kind: "cli", aliases: ["ampcode", "amp code", "sourcegraph amp"] },
  { id: "aider", name: "Aider", maker: "Aider", kind: "cli", aliases: ["aider-chat"] },
  { id: "goose", name: "Goose", maker: "Block", kind: "cli", aliases: ["block goose"] },
  { id: "qwen-code", name: "Qwen Code", maker: "Alibaba", kind: "cli", aliases: ["qwen-code", "qwen cli"] },
  { id: "crush", name: "Crush", maker: "Charm", kind: "cli", aliases: ["charm crush"] },
  { id: "warp", name: "Warp", maker: "Warp", kind: "cli", aliases: ["warp terminal", "warp agent"] },
  // Editors and IDE agents
  { id: "cursor", name: "Cursor", maker: "Anysphere", kind: "editor", aliases: ["cursor-vscode", "cursor ide", "cursor agent", "cursor-agent"] },
  { id: "windsurf", name: "Windsurf", maker: "Cognition", kind: "editor", aliases: ["windsurf-client", "codeium", "cascade"] },
  { id: "github-copilot", name: "GitHub Copilot", maker: "GitHub", kind: "editor", aliases: ["copilot", "github copilot", "vscode copilot", "visual studio code"] },
  { id: "cline", name: "Cline", maker: "Cline", kind: "editor", aliases: ["claude dev"] },
  { id: "roo-code", name: "Roo Code", maker: "Roo", kind: "editor", aliases: ["roo-code", "roocode", "roo"] },
  { id: "kilo-code", name: "Kilo Code", maker: "Kilo", kind: "editor", aliases: ["kilo-code", "kilocode", "kilo"] },
  { id: "zed", name: "Zed", maker: "Zed Industries", kind: "editor", aliases: ["zed agent", "zed editor"] },
  { id: "kiro", name: "Kiro", maker: "AWS", kind: "editor", aliases: ["amazon kiro", "aws kiro"] },
  { id: "antigravity", name: "Antigravity", maker: "Google", kind: "editor", aliases: ["google antigravity"] },
  { id: "junie", name: "Junie", maker: "JetBrains", kind: "editor", aliases: ["jetbrains junie", "jetbrains ai"] },
  { id: "trae", name: "Trae", maker: "ByteDance", kind: "editor", aliases: ["trae ide"] },
  { id: "continue", name: "Continue", maker: "Continue", kind: "editor", aliases: ["continue.dev", "continue dev"] },
  // App builders
  { id: "rosebud", name: "Rosebud AI", maker: "Rosebud", kind: "builder", aliases: ["rosebud", "rosebud.ai"] },
  { id: "lovable", name: "Lovable", maker: "Lovable", kind: "builder", aliases: ["lovable.dev"] },
  { id: "bolt", name: "Bolt", maker: "StackBlitz", kind: "builder", aliases: ["bolt.new", "bolt new"] },
  { id: "v0", name: "v0", maker: "Vercel", kind: "builder", aliases: ["v0.dev", "v0.app", "vercel v0"] },
  { id: "replit-agent", name: "Replit Agent", maker: "Replit", kind: "builder", aliases: ["replit", "replit ai"] },
  { id: "google-ai-studio", name: "Google AI Studio", maker: "Google", kind: "builder", aliases: ["ai studio", "aistudio", "google ai studio build"] },
  { id: "firebase-studio", name: "Firebase Studio", maker: "Google", kind: "builder", aliases: ["project idx", "idx"] },
  { id: "jules", name: "Jules", maker: "Google", kind: "builder", aliases: ["google jules"] },
  { id: "devin", name: "Devin", maker: "Cognition", kind: "builder", aliases: ["devin ai"] },
  { id: "manus", name: "Manus", maker: "Manus", kind: "builder", aliases: ["manus ai"] },
  // Chat apps
  { id: "claude", name: "Claude", maker: "Anthropic", kind: "chat", aliases: ["claude.ai", "claude app", "claude artifacts", "claude-ai", "claude desktop"] },
  { id: "chatgpt", name: "ChatGPT", maker: "OpenAI", kind: "chat", aliases: ["chat gpt", "chatgpt canvas", "openai-mcp"] },
  { id: "gemini", name: "Gemini", maker: "Google", kind: "chat", aliases: ["gemini app", "gemini canvas", "bard"] },
  { id: "grok", name: "Grok", maker: "xAI", kind: "chat", aliases: ["grok app"] },
  { id: "deepseek-chat", name: "DeepSeek Chat", maker: "DeepSeek", kind: "chat", aliases: ["deepseek app"] },
];
