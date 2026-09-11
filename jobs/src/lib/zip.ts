import yauzl from "yauzl";
import type { Readable } from "node:stream";

export type ZipEntry = {
  name: string;
  size: number;
  compressed: number;
  isDir: boolean;
  isSymlink: boolean;
  raw: yauzl.Entry;
};

export type OpenedZip = { zip: yauzl.ZipFile; entries: ZipEntry[]; close(): void };

/** Lists every entry without extracting. The zip stays open so entries can be streamed later. */
export function openZip(path: string): Promise<OpenedZip> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("zip open failed"));
      const entries: ZipEntry[] = [];
      zip.on("entry", (e: yauzl.Entry) => {
        const name = e.fileName.replace(/\\/g, "/");
        const mode = (e.externalFileAttributes >>> 16) & 0xf000;
        entries.push({
          name,
          size: e.uncompressedSize,
          compressed: e.compressedSize,
          isDir: name.endsWith("/"),
          isSymlink: mode === 0xa000,
          raw: e,
        });
        zip.readEntry();
      });
      zip.on("end", () => resolve({ zip, entries, close: () => zip.close() }));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

export function entryStream(zip: yauzl.ZipFile, entry: ZipEntry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry.raw, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error("openReadStream failed"));
      resolve(stream);
    });
  });
}

export async function entryBuffer(zip: yauzl.ZipFile, entry: ZipEntry, maxBytes: number): Promise<Buffer> {
  const stream = await entryStream(zip, entry);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    total += (chunk as Buffer).length;
    if (total > maxBytes) {
      stream.destroy();
      throw new Error("entry exceeds declared size");
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}
