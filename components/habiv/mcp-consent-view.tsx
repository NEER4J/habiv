import Link from "next/link";
import type { CSSProperties } from "react";
import { decideAuthorization } from "@/lib/actions/oauth";
import { bpanel, chipBtn, mono, monoLabel, primaryBtn } from "@/lib/habiv/ui";
import { Avatar } from "./avatar";

const wrap: CSSProperties = { display: "flex", justifyContent: "center", padding: "48px 0" };
const card: CSSProperties = { ...bpanel, width: "min(460px, 100%)", padding: "28px", borderRadius: "20px" };
const title: CSSProperties = { margin: "10px 0 0", fontSize: "21px", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.3 };
const body: CSSProperties = { fontSize: "14px", lineHeight: 1.6, color: "var(--ink-4)" };

const grants = ["Publish new games and versions under your handle", "Edit the details of your games", "Unpublish your games"];

/** Where the app sends you back to: host for web and loopback redirects, scheme for native apps. */
function destination(redirectUri: string): string {
  const u = new URL(redirectUri);
  return u.host || u.protocol.replace(/:$/, "");
}

export function McpConsentError({ message }: { message: string }) {
  return (
    <div style={wrap}>
      <div style={card}>
        <div style={monoLabel}>Connect an app</div>
        <h1 style={title}>Can&apos;t connect this app</h1>
        <p style={{ ...body, margin: "10px 0 20px" }}>{message}</p>
        <Link href="/" style={chipBtn}>
          Back to Habiv
        </Link>
      </div>
    </div>
  );
}

/** The approval screen an MCP client opens in the browser. Works without JS (plain form + server action). */
export function McpConsentView({
  clientName,
  redirectUri,
  handle,
  displayName,
  params,
}: {
  clientName: string;
  redirectUri: string;
  handle: string;
  displayName: string;
  params: Record<string, string>;
}) {
  return (
    <div style={wrap}>
      <div style={card}>
        <div style={monoLabel}>Connect an app</div>
        <h1 style={title}>{clientName} wants to publish to your Habiv account</h1>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "18px", padding: "12px", borderRadius: "12px", background: "var(--chip)" }}>
          <Avatar seed={handle} size={36} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: 600 }}>{displayName}</div>
            <div style={{ fontSize: "13px", color: "var(--ink-4)" }}>@{handle}</div>
          </div>
        </div>

        <div style={{ ...monoLabel, marginTop: "22px" }}>It will be able to</div>
        <ul style={{ ...body, margin: "8px 0 0", paddingLeft: "18px" }}>
          {grants.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
        <p style={{ ...body, margin: "12px 0 0" }}>It can&apos;t see your email or password.</p>

        <p style={{ ...body, margin: "18px 0 0", fontSize: "13px" }}>
          Approving sends you back to <span style={{ fontFamily: mono, color: "var(--ink)" }}>{destination(redirectUri)}</span>. Only approve if you just
          started this from your agent. You can disconnect it anytime in{" "}
          <Link href="/settings?tab=api" style={{ color: "var(--ink)", textDecoration: "underline" }}>
            Settings
          </Link>
          .
        </p>

        <form action={decideAuthorization} style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
          {Object.entries(params).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <button type="submit" name="decision" value="deny" style={chipBtn}>
            Cancel
          </button>
          <button type="submit" name="decision" value="approve" style={primaryBtn}>
            Approve
          </button>
        </form>
      </div>
    </div>
  );
}
