/**
 * schema.org structured data. Several nodes go into one @graph so they can reference each other by @id.
 * `<` is escaped so user text (titles, bios) can never close the script tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const doc = Array.isArray(data) ? { "@context": "https://schema.org", "@graph": data } : { "@context": "https://schema.org", ...data };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(doc).replace(/</g, "\\u003c") }} />;
}
