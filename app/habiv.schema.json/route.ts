import { detailsJsonSchema } from "@/lib/habiv/details-file";

/** JSON Schema for habiv.json, so editors autocomplete it ("$schema": ".../habiv.schema.json"). Docs: /docs/details. */
export function GET() {
  return Response.json(detailsJsonSchema, {
    headers: { "content-type": "application/schema+json", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
  });
}
