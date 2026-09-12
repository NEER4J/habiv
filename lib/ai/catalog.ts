/**
 * One list of AI models and tools for the whole app: the publish and edit pickers, the explore
 * filters, search shortcuts, and normalising what people and MCP agents send. Models come from a
 * models.dev snapshot (scripts/sync-ai-models.mjs → models.json); tools from agents.ts.
 *
 * game_versions.model / .agent store the catalog name ("Claude Sonnet 4.5", "Claude Code"), so
 * filtering is an exact match. Anything not in the lists is kept as typed.
 */
import snapshot from "./models.json";
import { AGENT_KINDS, AGENTS } from "./agents";

export type ModelEntry = {
  id: string;
  name: string;
  lab: string;
  family: string | null;
  released: string | null;
  openWeights: boolean;
  deprecated: boolean;
  aliases: string[];
};

/** One row in a picker. `value` is what gets stored or filtered on; `keys` is the folded search text. */
export type PickerOption = { value: string; label?: string; group: string; hint: string; keys: string; dim?: boolean };

export const MODELS = snapshot.models as ModelEntry[];
export const LABS: { id: string; name: string }[] = snapshot.labs;
export const MODELS_SYNCED_AT: string = snapshot.syncedAt;
export { AGENTS, AGENT_KINDS };

const labName = new Map(LABS.map((l) => [l.id, l.name]));
const kindName = new Map(AGENT_KINDS.map((k) => [k.id, k.name]));

/** Lower case with punctuation folded to spaces: "claude-sonnet-4-5" and "Claude Sonnet 4.5" both give "claude sonnet 4 5". */
export const foldKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Words people put in front of a model name or leave off: "Sonnet 4.5", "Local Llama 4". */
const PREFIX = /^(claude|google|openai|meta|xai|mistral|anthropic|local) /;

function buildIndex<T>(items: T[], keysOf: (t: T) => string[]) {
  const map = new Map<string, T>();
  for (const item of items) {
    for (const k of keysOf(item)) {
      const f = foldKey(k);
      // Lists are newest first, so a shared short key ("sonnet") goes to the newest model.
      if (f && !map.has(f)) map.set(f, item);
    }
  }
  return map;
}

const modelIndex = buildIndex(MODELS, (m) => [m.name, m.id, ...m.aliases, foldKey(m.name).replace(PREFIX, "")]);
const agentIndex = buildIndex(AGENTS, (a) => [a.name, a.id, ...a.aliases]);

export function findModel(input: string | null | undefined): ModelEntry | undefined {
  if (!input) return undefined;
  const f = foldKey(input);
  return modelIndex.get(f) ?? modelIndex.get(f.replace(PREFIX, ""));
}

export function findAgent(input: string | null | undefined) {
  return input ? agentIndex.get(foldKey(input)) : undefined;
}

const tidy = (input: string | null | undefined) => input?.trim().replace(/\s+/g, " ").slice(0, 80) || null;

/** What to store for a model: the catalog name when we know it, otherwise the text as typed; null when blank. */
export function normalizeModel(input: string | null | undefined): string | null {
  const t = tidy(input);
  return t ? (findModel(t)?.name ?? t) : null;
}

/** What to store for a tool or agent, same rules as normalizeModel. */
export function normalizeAgent(input: string | null | undefined): string | null {
  const t = tidy(input);
  return t ? (findAgent(t)?.name ?? t) : null;
}

/** Tile label: "Claude Sonnet 4.5" → "SONNET 4.5". */
export function shortModelName(m: string) {
  return (findModel(m)?.name ?? m).replace(/^(Claude|Local) /i, "").toUpperCase();
}

/** Catalog names of a lab's models, for the "Any Anthropic model" filter. */
export function modelNamesForLab(lab: string): string[] {
  return MODELS.filter((m) => m.lab === lab).map((m) => m.name);
}

export const MODEL_OPTIONS: PickerOption[] = MODELS.map((m) => {
  const lab = labName.get(m.lab) ?? m.lab;
  return {
    value: m.name,
    group: lab,
    hint: [m.openWeights ? "open weights" : null, m.deprecated ? "retired" : m.released?.slice(0, 4)].filter(Boolean).join(" · "),
    keys: foldKey([m.name, m.id, lab, m.family ?? "", m.openWeights ? "open weights local" : ""].join(" ")),
    dim: m.deprecated,
  };
});

export const AGENT_OPTIONS: PickerOption[] = AGENTS.map((a) => {
  const kind = kindName.get(a.kind) ?? a.kind;
  return { value: a.name, group: kind, hint: a.maker, keys: foldKey([a.name, a.maker, kind, ...a.aliases].join(" ")) };
});

/**
 * Options whose text holds every word typed, best first: the name starts with the query, then a
 * word in the name starts with the first word typed, then anything else. Empty query keeps all.
 */
export function filterOptions(options: PickerOption[], query: string): PickerOption[] {
  const q = foldKey(query);
  if (!q) return options;
  const words = q.split(" ");
  const scored: { o: PickerOption; s: number }[] = [];
  for (const o of options) {
    if (!words.every((w) => o.keys.includes(w))) continue;
    const name = foldKey(o.label ?? o.value);
    const s = name.startsWith(q) ? 0 : name.split(" ").some((p) => p.startsWith(words[0])) ? 1 : 2;
    scored.push({ o, s });
  }
  return scored.sort((a, b) => a.s - b.s).map((x) => x.o);
}

/** Catalog options that have games, with the count as the hint; values not in the catalog go under "Other". */
function withCounts(base: PickerOption[], counts: [string, number][]): PickerOption[] {
  const n = new Map(counts);
  const listed = new Set(base.map((o) => o.value));
  const known = base.filter((o) => n.has(o.value)).map((o) => ({ ...o, hint: String(n.get(o.value)), dim: false }));
  const other = counts.filter(([v]) => !listed.has(v)).map(([v, c]) => ({ value: v, group: "Other", hint: String(c), keys: foldKey(v) }));
  return [...known, ...other];
}

/** Explore's model filter: models with games, and an "Any <lab> model" row for labs with more than one. */
export function modelFilterOptions(counts: [string, number][]): PickerOption[] {
  const opts = withCounts(MODEL_OPTIONS, counts);
  const out: PickerOption[] = [];
  for (const lab of LABS) {
    const rows = opts.filter((o) => o.group === lab.name);
    if (rows.length > 1) {
      const total = rows.reduce((sum, o) => sum + Number(o.hint), 0);
      out.push({ value: `lab:${lab.id}`, label: `Any ${lab.name} model`, group: lab.name, hint: String(total), keys: foldKey(`${lab.name} any all`) });
    }
    out.push(...rows);
  }
  return out.concat(opts.filter((o) => o.group === "Other"));
}

export function agentFilterOptions(counts: [string, number][]): PickerOption[] {
  return withCounts(AGENT_OPTIONS, counts);
}

/** Human label for a filter value, including "lab:<id>" values. */
export function filterLabel(value: string): string {
  if (value.startsWith("lab:")) return `Any ${labName.get(value.slice(4)) ?? value.slice(4)} model`;
  return value;
}
