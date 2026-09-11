import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAdminContext, getSiteSettings } from "@/lib/db/admin";
import { PageHeader } from "@/components/admin/chrome";
import { SettingsEditor } from "@/components/admin/settings-editor";

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageHeader title="Settings" />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/");
  const settings = await getSiteSettings(ctx);
  return (
    <>
      <PageHeader title="Site settings" />
      <SettingsEditor settings={settings} />
    </>
  );
}
