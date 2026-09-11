"use client";

import { useState, type CSSProperties } from "react";
import { deleteCategory, upsertCategory } from "@/lib/actions/admin";
import { ActionButton, ActionText, smallPrimaryBtn, useAdminAction } from "@/components/admin/action-button";
import { Table, Td, Th } from "@/components/admin/table";
import { bpanel, fieldLabelStyle, mono, monoLabel } from "@/lib/habiv/ui";

export type AdminCategory = { slug: string; name: string; icon: string | null; sortOrder: number; active: boolean; games: number };

const input: CSSProperties = { height: "30px", padding: "0 10px", border: "none", borderRadius: "8px", background: "var(--chip)", color: "var(--ink)", fontSize: "13px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

function CategoryRow({ c }: { c: AdminCategory }) {
  const { pending, msg, run } = useAdminAction();
  const [name, setName] = useState(c.name);
  const [icon, setIcon] = useState(c.icon ?? "");
  const [sort, setSort] = useState(String(c.sortOrder));
  const [active, setActive] = useState(c.active);
  const dirty = name !== c.name || icon !== (c.icon ?? "") || sort !== String(c.sortOrder) || active !== c.active;
  const save = () => run(() => upsertCategory({ slug: c.slug, name: name.trim(), icon: icon.trim() || null, sortOrder: Number(sort) || 0, active }), "Saved");
  return (
    <tr className="hb-row">
      <Td style={{ fontFamily: mono, fontSize: "12px", color: "var(--ink)" }}>{c.slug}</Td>
      <Td><input id={`cat-name-${c.slug}`} aria-label="Name" value={name} maxLength={32} disabled={pending} onChange={(e) => setName(e.target.value)} style={{ ...input, width: "160px" }} /></Td>
      <Td><input id={`cat-icon-${c.slug}`} aria-label="Icon" value={icon} maxLength={8} disabled={pending} onChange={(e) => setIcon(e.target.value)} style={{ ...input, width: "64px", textAlign: "center" }} /></Td>
      <Td><input id={`cat-sort-${c.slug}`} aria-label="Sort order" type="number" min={0} max={10000} value={sort} disabled={pending} onChange={(e) => setSort(e.target.value)} style={{ ...input, width: "76px", fontFamily: mono }} /></Td>
      <Td>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12.5px" }}>
          <input id={`cat-active-${c.slug}`} type="checkbox" checked={active} disabled={pending} onChange={(e) => setActive(e.target.checked)} /> {active ? "Active" : "Inactive"}
        </label>
      </Td>
      <Td style={{ fontFamily: mono }}>{c.games}</Td>
      <Td>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
          <button id={`cat-save-${c.slug}`} type="button" disabled={!dirty || pending || !name.trim()} onClick={save} style={{ ...smallPrimaryBtn, opacity: !dirty || pending || !name.trim() ? 0.45 : 1 }}>
            {pending ? "…" : "Save"}
          </button>
          <ActionText msg={msg} />
          <ActionButton
            id={`cat-delete-${c.slug}`}
            label="Delete"
            variant="danger"
            okText="Deleted"
            disabled={c.slug === "other"}
            title={c.slug === "other" ? "The fallback category cannot be deleted" : undefined}
            confirm={`Delete “${c.name}”? Its ${c.games} game${c.games === 1 ? "" : "s"} move to “other”.`}
            run={() => deleteCategory(c.slug)}
          />
        </div>
      </Td>
    </tr>
  );
}

export function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "").slice(0, 24);
}

function AddCategory({ nextSort }: { nextSort: number }) {
  const { pending, msg, run } = useAdminAction();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [icon, setIcon] = useState("");
  const [sort, setSort] = useState(String(nextSort));
  const valid = /^[a-z][a-z0-9_]{1,23}$/.test(slug) && name.trim().length > 0;
  return (
    <form
      style={{ ...bpanel, padding: "16px 18px", marginTop: "18px" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        run(async () => {
          const r = await upsertCategory({ slug, name: name.trim(), icon: icon.trim() || null, sortOrder: Number(sort) || 0, active: true });
          if (r.ok) { setName(""); setSlug(""); setSlugTouched(false); setIcon(""); }
          return r;
        }, "Added");
      }}
    >
      <div style={monoLabel}>Add category</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ ...fieldLabelStyle, margin: "12px 0 6px" }}>Name</span>
          <input id="new-cat-name" value={name} maxLength={32} required disabled={pending} onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} style={{ ...input, width: "180px" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ ...fieldLabelStyle, margin: "12px 0 6px" }}>Slug</span>
          <input id="new-cat-slug" value={slug} pattern="^[a-z][a-z0-9_]{1,23}$" required disabled={pending} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }} style={{ ...input, width: "160px", fontFamily: mono }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ ...fieldLabelStyle, margin: "12px 0 6px" }}>Icon</span>
          <input id="new-cat-icon" value={icon} maxLength={8} disabled={pending} onChange={(e) => setIcon(e.target.value)} style={{ ...input, width: "64px", textAlign: "center" }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ ...fieldLabelStyle, margin: "12px 0 6px" }}>Sort</span>
          <input id="new-cat-sort" type="number" min={0} max={10000} value={sort} disabled={pending} onChange={(e) => setSort(e.target.value)} style={{ ...input, width: "76px", fontFamily: mono }} />
        </label>
        <button id="new-cat-submit" type="submit" disabled={!valid || pending} style={{ ...smallPrimaryBtn, height: "30px", opacity: !valid || pending ? 0.45 : 1 }}>{pending ? "…" : "Add"}</button>
        <ActionText msg={msg} />
      </div>
    </form>
  );
}

export function CategoryEditor({ categories }: { categories: AdminCategory[] }) {
  const nextSort = categories.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1;
  return (
    <>
      <Table minWidth={760}>
        <thead>
          <tr><Th>Slug</Th><Th>Name</Th><Th>Icon</Th><Th>Sort</Th><Th>Active</Th><Th>Games</Th><Th>Actions</Th></tr>
        </thead>
        <tbody>{categories.map((c) => <CategoryRow key={c.slug} c={c} />)}</tbody>
      </Table>
      <AddCategory nextSort={nextSort} />
    </>
  );
}
