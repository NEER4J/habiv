import { Suspense } from "react";
import { redirect } from "next/navigation";
import { McpConsentError, McpConsentView } from "@/components/habiv/mcp-consent-view";
import { getOwnProfile } from "@/lib/db/profiles";
import { AUTHORIZE_PARAMS, checkAuthorize } from "@/lib/oauth/core";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Connect an app — Habiv", robots: { index: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** OAuth authorization endpoint for MCP clients (see lib/oauth/core.ts). Sign-in is enforced by proxy.ts. */
export default function AuthorizePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <Authorize searchParams={searchParams} />
    </Suspense>
  );
}

async function Authorize({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const params: Record<string, string> = {};
  for (const k of AUTHORIZE_PARAMS) {
    const v = raw[k];
    const s = Array.isArray(v) ? v[0] : v;
    if (s) params[k] = s;
  }

  const check = checkAuthorize(params);
  if (!check.ok) {
    if (check.fatal) return <McpConsentError message={check.message} />;
    redirect(check.redirect);
  }

  const own = await getOwnProfile(await createClient());
  if (!own) redirect(`/?auth=signin&next=${encodeURIComponent(`/mcp/authorize?${new URLSearchParams(params)}`)}`);

  return <McpConsentView clientName={check.client.name} redirectUri={check.redirectUri} handle={own.handle} displayName={own.displayName} avatarUrl={own.avatarUrl} params={params} />;
}
