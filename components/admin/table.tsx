import type { CSSProperties, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { bpanel, mono } from "@/lib/habiv/ui";

/** Panel-wrapped table that scrolls horizontally on narrow screens instead of breaking the page. */
export function Table({ children, minWidth = 720, style }: { children: ReactNode; minWidth?: number; style?: CSSProperties }) {
  return (
    <div style={{ ...bpanel, overflowX: "auto", maxWidth: "100%", ...style }}>
      <table style={{ width: "100%", minWidth, borderCollapse: "collapse", fontSize: "13px" }}>{children}</table>
    </div>
  );
}

export function Th({ children, style, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      style={{
        textAlign: "left", padding: "12px 12px", fontFamily: mono, fontSize: "10.5px", letterSpacing: "0.12em", textTransform: "uppercase",
        color: "var(--ink-5)", fontWeight: 400, borderBottom: "1px solid var(--divider)", whiteSpace: "nowrap", ...style,
      }}
    >
      {children}
    </th>
  );
}

export function Td({ children, style, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td {...rest} style={{ padding: "10px 12px", verticalAlign: "top", borderBottom: "1px solid var(--divider)", color: "var(--ink-2)", ...style }}>
      {children}
    </td>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ ...bpanel, padding: "28px", textAlign: "center", color: "var(--ink-5)", fontSize: "13px" }}>{children}</div>;
}
