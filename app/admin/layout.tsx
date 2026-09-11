import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/db/admin";
import { AdminNav } from "@/components/admin/nav";

export const metadata = { title: "Admin — Habiv", robots: { index: false, follow: false } };

const css = `
.adm-shell{display:flex;min-height:100svh;background:var(--bg);color:var(--ink)}
.adm-side{position:sticky;top:0;align-self:flex-start;height:100svh;width:212px;flex:none;padding:22px 14px;box-sizing:border-box;border-right:1px solid var(--divider);overflow:auto}
.adm-nav{display:flex;flex-direction:column;gap:2px}
.adm-brand{padding:0 12px 14px}
.adm-link{display:flex;align-items:center;height:38px;padding:0 12px;border-radius:9px;font-size:14px;white-space:nowrap}
.adm-link:hover{background:var(--chip)}
.adm-back{margin-top:16px;font-size:13px}
.adm-main{flex:1;min-width:0;padding:26px 28px 60px;box-sizing:border-box}
@media (max-width: 760px){
  .adm-shell{flex-direction:column}
  .adm-side{position:static;height:auto;width:100%;padding:12px 12px 8px;border-right:none;border-bottom:1px solid var(--divider);overflow-x:auto}
  .adm-nav{flex-direction:row;align-items:center;gap:4px;min-width:max-content}
  .adm-brand{padding:0 8px 0 4px}
  .adm-link{height:32px;padding:0 10px;font-size:13px}
  .adm-back{margin-top:0;margin-left:6px}
  .adm-main{padding:18px 16px 48px}
}
`;

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="hb-theme adm-shell">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <aside className="adm-side">
        <AdminNav />
      </aside>
      <main className="adm-main">{children}</main>
    </div>
  );
}

async function Gate({ children }: { children: ReactNode }) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/");
  return <Shell>{children}</Shell>;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="hb-theme" style={{ minHeight: "100svh", background: "var(--bg)" }} />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
