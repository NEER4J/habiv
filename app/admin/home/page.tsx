import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAdminContext, getSiteSettings, listPickableGames } from "@/lib/db/admin";
import { HOME_PICK_KEYS } from "@/lib/db/feed";
import { PageHeader } from "@/components/admin/chrome";
import { HomePicksEditor } from "@/components/admin/home-picks-editor";

export default function HomePicksPage() {
  return (
    <Suspense fallback={<PageHeader title="Home picks" />}>
      <HomePicks />
    </Suspense>
  );
}

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

async function HomePicks() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/");
  const [settings, games] = await Promise.all([getSiteSettings(ctx), listPickableGames(ctx)]);
  return (
    <>
      <PageHeader title="Home picks" />
      <HomePicksEditor games={games} featured={ids(settings[HOME_PICK_KEYS.featured])} quick={ids(settings[HOME_PICK_KEYS.quick])} />
    </>
  );
}
