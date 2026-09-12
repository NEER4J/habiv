#!/usr/bin/env node
/**
 * Snapshots the model list from models.dev (open source, MIT: github.com/sst/models.dev) into
 * lib/ai/models.json. Run it by hand when new models ship: `node scripts/sync-ai-models.mjs`.
 * The app never calls models.dev at runtime; the committed JSON is the source of truth.
 *
 * Keeps first-party text models from the main labs (plus open-weights families that only appear
 * under hosts), drops image/audio/embedding models, "(latest)" aliases and dated duplicates.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../lib/ai/models.json", import.meta.url));
const SINCE = "2024-05-01";

/** models.dev provider id → lab we show, and the families that really belong to that lab. */
const LABS = [
  { provider: "anthropic", lab: "anthropic", name: "Anthropic", families: /^claude/ },
  { provider: "openai", lab: "openai", name: "OpenAI", families: /^(gpt|o)(-|$)/ },
  { provider: "google", lab: "google", name: "Google", families: /^(gemini|gemma)/ },
  { provider: "xai", lab: "xai", name: "xAI", families: /^grok/ },
  { provider: "deepseek", lab: "deepseek", name: "DeepSeek", families: /^deepseek/ },
  { provider: "alibaba", lab: "alibaba", name: "Qwen", families: /^qwen/ },
  { provider: "moonshotai", lab: "moonshotai", name: "Moonshot AI", families: /^kimi/ },
  { provider: "zai", lab: "zai", name: "Z.ai", families: /^glm/ },
  { provider: "mistral", lab: "mistral", name: "Mistral", families: /^(mistral|devstral|codestral|magistral|ministral|pixtral)/ },
  { provider: "minimax", lab: "minimax", name: "MiniMax", families: /^minimax/ },
  { provider: "meta", lab: "meta", name: "Meta", families: /^(llama|muse)/ },
];

/** Open-weights families models.dev only lists under hosting providers; taken from the first host that has them. */
const OPEN_HOSTS = ["openrouter", "groq", "togetherai", "nvidia", "deepinfra"];
const OPEN_FAMILIES = [
  { lab: "meta", families: /^llama/, name: /^(Meta: )?Llama[ -]\d/i },
  { lab: "google", families: /^gemma/, name: /^(Google: )?Gemma \d/i },
  { lab: "openai", families: /^gpt-oss/, name: /^(OpenAI: )?gpt-oss-\d+b$/i },
];

const NOT_CHAT = /embed|tts|transcri|realtime|audio|image|imagine|video|live|translate|moderation|search|guard|safeguard|voxtral|ocr|nano banana|computer.use|deep.research|\bvl\b|vision|highspeed|contributor|\basr\b|\bmt\b|custom tools/i;
/** Community fine-tunes that hosts list next to the real thing. */
const FINETUNE = /euryale|lunaris|abliterated|uncensored|wayfarer|hermes|distill|^open /i;

const res = await fetch("https://models.dev/api.json");
if (!res.ok) throw new Error(`models.dev returned ${res.status}`);
const data = await res.json();

/** "Meta: Llama-3.3-70B-Instruct (free)" → "Llama 3.3 70B"; "GPT-4o (2024-11-20)" → "GPT-4o". */
const cleanName = (n) =>
  n
    .replace(/^[A-Za-z. ]+: /, "")
    .replace(/\s*\((latest|preview|free|\d{4}-\d{2}-\d{2})\)/gi, "")
    .replace(/[- ](it|instruct)$/i, "")
    .replace(/^(Llama)-(\d[\d.]*)-(\w+)$/i, "$1 $2 $3")
    .replace(/\s+/g, " ")
    .trim();
const isChat = (m) =>
  (m.modalities?.output ?? ["text"]).every((o) => o === "text") &&
  !NOT_CHAT.test(m.name) &&
  !NOT_CHAT.test(m.id) &&
  !FINETUNE.test(m.name) &&
  !/latest$/i.test(m.name) &&
  !/latest$/i.test(m.id);

/** name (lower case) → entry; the first id seen wins, the rest become aliases. */
const byName = new Map();
function add(lab, m) {
  const name = cleanName(m.name);
  const key = name.toLowerCase();
  const prev = byName.get(key);
  if (prev) {
    prev.aliases = Array.from(new Set([...prev.aliases, m.id.toLowerCase()]));
    if (m.release_date && m.release_date < prev.released) prev.released = m.release_date;
    return;
  }
  byName.set(key, {
    id: m.id.toLowerCase().replace(/^.*\//, ""),
    name,
    lab,
    family: m.family ?? null,
    released: m.release_date ?? null,
    openWeights: !!m.open_weights,
    deprecated: m.status === "deprecated",
    aliases: [m.id.toLowerCase()],
  });
}

for (const { provider, lab, families } of LABS) {
  const p = data[provider];
  if (!p) {
    console.warn(`models.dev has no provider "${provider}", skipping`);
    continue;
  }
  for (const m of Object.values(p.models)) {
    if (!families.test(m.family ?? "") || !isChat(m) || (m.release_date ?? "") < SINCE) continue;
    add(lab, m);
  }
}

for (const { lab, families, name } of OPEN_FAMILIES) {
  for (const host of OPEN_HOSTS) {
    const models = Object.values(data[host]?.models ?? {}).filter((m) => families.test(m.family ?? "") && name.test(m.name) && isChat(m) && (m.release_date ?? "") >= SINCE);
    if (!models.length) continue;
    for (const m of models) add(lab, { ...m, open_weights: true, id: m.id.replace(/^.*\//, "").replace(/:.*$/, "") });
    break;
  }
}

const labOrder = new Map(LABS.map((l, i) => [l.lab, i]));
const models = [...byName.values()].sort(
  (a, b) => labOrder.get(a.lab) - labOrder.get(b.lab) || (b.released ?? "").localeCompare(a.released ?? "") || a.name.localeCompare(b.name),
);

const out = {
  source: "https://models.dev",
  syncedAt: new Date().toISOString().slice(0, 10),
  labs: LABS.map(({ lab, name }) => ({ id: lab, name })),
  models,
};
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`Wrote ${models.length} models to ${OUT}`);
for (const l of LABS) console.log(`  ${l.name}: ${models.filter((m) => m.lab === l.lab).length}`);
