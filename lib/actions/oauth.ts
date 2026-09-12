"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AUTHORIZE_PARAMS, checkAuthorize, sealCode, withParams } from "@/lib/oauth/core";

/**
 * Approve or deny an MCP client's authorization request from the consent page. Every parameter
 * is re-validated here; the form's hidden fields are not trusted. Server actions check the
 * Origin header, which is the CSRF protection for this form.
 */
export async function decideAuthorization(formData: FormData) {
  const params = Object.fromEntries(AUTHORIZE_PARAMS.map((k) => [k, formData.get(k)?.toString()]));
  const check = checkAuthorize(params);
  if (!check.ok) redirect(check.fatal ? "/" : check.redirect);

  if (formData.get("decision") !== "approve") {
    redirect(withParams(check.redirectUri, { error: "access_denied", error_description: "The user declined.", state: check.state }));
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) {
    const back = `/mcp/authorize?${new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]))}`;
    redirect(`/?auth=signin&next=${encodeURIComponent(back)}`);
  }

  const code = sealCode({ userId: uid, clientId: check.clientId, redirectUri: check.redirectUri, codeChallenge: check.codeChallenge });
  redirect(withParams(check.redirectUri, { code, state: check.state }));
}
