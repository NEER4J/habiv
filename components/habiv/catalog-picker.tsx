"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { filterLabel, filterOptions, type PickerOption } from "@/lib/ai/catalog";
import { chipStyle, fieldStyle, mono } from "@/lib/habiv/ui";

/**
 * Type-to-filter pickers over the model and tool catalogs (lib/ai/catalog.ts). CatalogField is the
 * form input on the publish and edit pages; CatalogFilterChip is the explore filter. Both share
 * the list below, rendered in a portal so bento cells with overflow can't clip it. The portal sits
 * outside the app wrapper, so the popover carries `hb-theme` itself to get the colour tokens.
 */

const popStyle: CSSProperties = {
  position: "fixed",
  zIndex: 120,
  display: "flex",
  flexDirection: "column",
  borderRadius: "14px",
  background: "var(--panel)",
  color: "var(--ink)",
  border: "1px solid var(--divider)",
  boxShadow: "0 18px 50px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.12)",
  overflow: "hidden",
  animation: "hbRise 140ms ease-out both",
};
const scrollStyle: CSSProperties = { flex: 1, minHeight: 0, overflowY: "auto", padding: "0 6px 6px" };
const groupStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  padding: "12px 8px 6px",
  background: "var(--panel)",
  fontFamily: mono,
  fontSize: "10px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--ink-5)",
};
const rowStyle = (active: boolean, dim?: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "10px",
  width: "100%",
  minHeight: "38px",
  padding: "0 8px",
  borderRadius: "9px",
  background: active ? "var(--chip)" : "transparent",
  color: dim ? "var(--ink-4)" : "var(--ink-2)",
  fontSize: "13.5px",
  textAlign: "left",
  cursor: "pointer",
  scrollMarginTop: "34px",
});
const hintStyle: CSSProperties = { marginLeft: "auto", fontFamily: mono, fontSize: "10.5px", color: "var(--ink-5)", whiteSpace: "nowrap" };
const countStyle: CSSProperties = { ...hintStyle, padding: "2px 7px", borderRadius: "99px", background: "var(--chip)", color: "var(--ink-4)" };
const noteStyle: CSSProperties = { padding: "12px 10px", fontSize: "12.5px", lineHeight: 1.5, color: "var(--ink-5)" };
const keysStyle: CSSProperties = {
  display: "flex",
  gap: "14px",
  padding: "8px 14px",
  borderTop: "1px solid var(--divider)",
  fontFamily: mono,
  fontSize: "10px",
  letterSpacing: "0.04em",
  color: "var(--ink-6)",
};

const hueOf = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};

/** Small tinted initial for a lab or tool group; the same group always gets the same colour. */
function GroupMark({ group }: { group: string }) {
  const h = hueOf(group);
  return (
    <span
      aria-hidden
      style={{
        flex: "0 0 22px",
        height: "22px",
        borderRadius: "6px",
        display: "grid",
        placeItems: "center",
        fontSize: "11px",
        fontWeight: 700,
        background: group ? `oklch(0.72 0.12 ${h} / 0.2)` : "var(--chip)",
        color: group ? `oklch(0.62 0.15 ${h})` : "var(--ink-5)",
      }}
    >
      {group ? group[0].toUpperCase() : "∗"}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ transition: "transform 140ms ease", transform: open ? "rotate(180deg)" : "none", flex: "0 0 auto" }}>
      <path d="M3 4.5 6 7.5 9 4.5" />
    </svg>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span style={{ color: "var(--ink)", fontWeight: 650 }}>{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  );
}

/** Fixed position under (or above, when there's no room) the anchor; follows scroll and resize while open. */
function usePopoverPosition(anchor: RefObject<HTMLElement | null>, open: boolean, minWidth: number) {
  const [pos, setPos] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(Math.max(r.width, minWidth), window.innerWidth - 16);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      const below = window.innerHeight - r.bottom;
      const up = below < 280 && r.top > below;
      setPos(up ? { left, width, bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(380, r.top - 16) } : { left, width, top: r.bottom + 6, maxHeight: Math.min(380, below - 16) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, open, minWidth]);
  return pos;
}

/** Arrow keys, Enter and Escape over a filtered list. Returns the key handler and the active index. */
function useListKeys(count: number, onPick: (i: number) => void, onClose: () => void) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive((a) => Math.min(a, Math.max(count - 1, 0))), [count]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (count ? (a + 1) % count : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (count ? (a - 1 + count) % count : 0));
    } else if (e.key === "Enter" && count) {
      e.preventDefault();
      onPick(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };
  return { active, setActive, onKeyDown };
}

function Popover({ pos, children, popRef }: { pos: CSSProperties; children: ReactNode; popRef?: RefObject<HTMLDivElement | null> }) {
  return createPortal(
    <div ref={popRef} className="hb-theme" style={{ ...popStyle, ...pos }}
      // Keep focus in the field while clicking rows; the filter chip's own search box still takes clicks.
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      {children}
      <div style={keysStyle} aria-hidden>
        <span>↑↓ move</span>
        <span>↵ pick</span>
        <span>esc close</span>
      </div>
    </div>,
    document.body,
  );
}

function OptionList({
  id,
  options,
  active,
  selected,
  query,
  onHover,
  onPick,
  empty,
  footer,
}: {
  id: string;
  options: PickerOption[];
  active: number;
  selected: string;
  query: string;
  onHover: (i: number) => void;
  onPick: (i: number) => void;
  empty: ReactNode;
  footer?: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);
  // Grouped with sticky headers while browsing; a flat ranked list once the user types.
  const grouped = !query.trim();

  return (
    <div ref={listRef} id={id} role="listbox" style={scrollStyle}>
      {options.length ? (
        options.map((o, i) => {
          const header = grouped && o.group && (i === 0 || options[i - 1].group !== o.group);
          const isSel = o.value === selected;
          const hint = grouped ? o.hint : [o.group, o.hint].filter(Boolean).join(" · ");
          return (
            <div key={o.value || "__any"}>
              {header ? <div style={groupStyle}>{o.group}</div> : null}
              <button
                type="button"
                id={`${id}-${i}`}
                role="option"
                aria-selected={isSel}
                data-active={i === active}
                tabIndex={-1}
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(i)}
                style={{ ...rowStyle(i === active, o.dim), marginTop: i === 0 && !header ? "6px" : undefined }}
              >
                <GroupMark group={o.group} />
                <span style={{ fontWeight: isSel ? 600 : 450, color: isSel ? "var(--ink)" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <Highlight text={o.label ?? o.value} query={query} />
                </span>
                {hint ? <span style={/^\d+$/.test(o.hint) && grouped ? countStyle : hintStyle}>{hint}</span> : <span style={{ marginLeft: "auto" }} />}
                <span aria-hidden style={{ flex: "0 0 14px", color: "var(--ink)", fontSize: "12px", textAlign: "center" }}>
                  {isSel ? "✓" : ""}
                </span>
              </button>
            </div>
          );
        })
      ) : (
        <div style={noteStyle}>{empty}</div>
      )}
      {footer ? <div style={{ ...noteStyle, borderTop: "1px solid var(--divider)", marginTop: "6px" }}>{footer}</div> : null}
    </div>
  );
}

/**
 * Form input with a catalog dropdown. Typing filters; arrows and Enter pick; anything not listed
 * is kept as typed. On blur, `normalize` snaps known spellings ("sonnet 4.5") to the catalog name.
 */
export function CatalogField({
  options,
  value,
  onChange,
  normalize,
  placeholder,
  ariaLabel,
  maxLength = 80,
}: {
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  normalize: (value: string) => string | null;
  placeholder: string;
  ariaLabel: string;
  maxLength?: number;
}) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // null until the user types, so opening a filled field lists everything instead of one match.
  const [query, setQuery] = useState<string | null>(null);
  const shown = useMemo(() => filterOptions(options, query ?? ""), [options, query]);
  const current = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const pos = usePopoverPosition(wrapRef, open, 300);

  const pick = (i: number) => {
    const o = shown[i];
    if (!o) return;
    onChange(o.value);
    setQuery(null);
    setOpen(false);
  };
  const close = () => {
    setOpen(false);
    setQuery(null);
  };
  const keys = useListKeys(shown.length, pick, close);

  const typed = query?.trim() ?? "";
  const custom = typed && !shown.some((o) => o.value.toLowerCase() === typed.toLowerCase());

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {current ? (
        <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}>
          <GroupMark group={current.group} />
        </span>
      ) : null}
      <input
        className="hb-input"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={id}
        aria-autocomplete="list"
        aria-activedescendant={open && shown.length ? `${id}-${keys.active}` : undefined}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          close();
          const n = normalize(value);
          if ((n ?? "") !== value) onChange(n ?? "");
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          keys.setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) setOpen(true);
          else if (open) keys.onKeyDown(e);
        }}
        style={{ ...fieldStyle, paddingLeft: current ? "42px" : "14px", paddingRight: "34px" }}
      />
      <span style={{ position: "absolute", right: "13px", top: "50%", transform: "translateY(-50%)", display: "flex", color: "var(--ink-5)", pointerEvents: "none" }}>
        <Chevron open={open} />
      </span>
      {open && pos ? (
        <Popover pos={pos}>
          <OptionList
            id={id}
            options={shown}
            active={keys.active}
            selected={value}
            query={typed}
            onHover={keys.setActive}
            onPick={pick}
            empty={<>Not in the list. It will be saved as “{typed}”.</>}
            footer={custom && shown.length ? <>Or keep “{typed}” as written.</> : null}
          />
        </Popover>
      ) : null}
    </div>
  );
}

/**
 * Explore filter chip: shows `label` (or the picked value) and opens a searchable list with game
 * counts. The first row clears the filter.
 */
export function CatalogFilterChip({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: PickerOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const id = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const anyRow: PickerOption = { value: "", label: `Any ${label.toLowerCase()}`, group: "", hint: "", keys: "" };
    return query.trim() ? filterOptions(options, query) : [anyRow, ...options];
  }, [options, query, label]);
  const pos = usePopoverPosition(btnRef, open, 320);

  const close = () => {
    setOpen(false);
    setQuery("");
    btnRef.current?.focus();
  };
  const pick = (i: number) => {
    const o = shown[i];
    if (!o) return;
    onChange(o.value || null);
    close();
  };
  const keys = useListKeys(shown.length, pick, close);

  // Close on a click anywhere outside the chip or the list.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !btnRef.current?.contains(t)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        style={{ ...chipStyle(!!value), display: "inline-flex", alignItems: "center", gap: "7px", maxWidth: 260 }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{value ? filterLabel(value) : label}</span>
        <Chevron open={open} />
      </button>
      {open && pos ? (
        <Popover pos={pos} popRef={popRef}>
          <div style={{ position: "relative", padding: "8px 8px 2px" }}>
            <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--ink-5)" strokeWidth="1.6" style={{ position: "absolute", left: "20px", top: "50%", transform: "translateY(-35%)" }}>
              <circle cx="7" cy="7" r="4.5" />
              <line x1="10.5" y1="10.5" x2="14" y2="14" />
            </svg>
            <input
              autoFocus
              className="hb-input"
              role="combobox"
              aria-label={`Search ${label.toLowerCase()}s`}
              aria-expanded
              aria-controls={id}
              aria-activedescendant={shown.length ? `${id}-${keys.active}` : undefined}
              value={query}
              placeholder={`Search ${label.toLowerCase()}s`}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setQuery(e.target.value);
                keys.setActive(0);
              }}
              onKeyDown={keys.onKeyDown}
              style={{ ...fieldStyle, height: "36px", paddingLeft: "34px" }}
            />
          </div>
          <OptionList
            id={id}
            options={shown}
            active={keys.active}
            selected={value ?? ""}
            query={query}
            onHover={keys.setActive}
            onPick={pick}
            empty={options.length ? "No match." : `No games list a ${label.toLowerCase()} yet.`}
          />
        </Popover>
      ) : null}
    </>
  );
}
