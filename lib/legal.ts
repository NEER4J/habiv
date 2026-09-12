/**
 * Facts the legal pages quote. Change them here, not in the page text, and bump `updated`
 * whenever the substance of a policy changes.
 */
export const legal = {
  /** The operator as it should appear in contracts. Replace with the registered entity once there is one. */
  operator: "Habiv",
  email: "support@habiv.com",
  /** Where copyright notices go. Register a DMCA agent with the US Copyright Office before relying on the safe harbour. */
  copyrightEmail: "support@habiv.com",
  /** Governing law and courts for the Terms. Null keeps the clause generic until a jurisdiction is chosen. */
  jurisdiction: null as string | null,
  minimumAge: 13,
  updated: "12 September 2026",
};

export const legalPages = [
  { href: "/about", label: "About" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
  { href: "/guidelines", label: "Community guidelines" },
  { href: "/copyright", label: "Copyright" },
] as const;
