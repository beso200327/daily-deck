/** Small dependency-free POSIX TAR writer. No compression, no credentials, no restore claim. */
export const bytes = (s: string) => new TextEncoder().encode(s);
export async function sha256(value: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", value as BufferSource),
    ),
  ].map((n) => n.toString(16).padStart(2, "0")).join("");
}
export function tar(files: { name: string; data: Uint8Array }[]) {
  const blocks: Uint8Array[] = [];
  let total = 1024;
  for (const f of files) {
    if (
      !/^[a-zA-Z0-9._/-]+$/.test(f.name) || f.name.includes("..") ||
      f.name.startsWith("/") || bytes(f.name).length > 99
    ) throw new Error("Invalid archive path");
    const h = new Uint8Array(512),
      put = (offset: number, value: string) => h.set(bytes(value), offset);
    put(0, f.name);
    put(100, "0000600\0");
    put(108, "0000000\0");
    put(116, "0000000\0");
    put(124, f.data.length.toString(8).padStart(11, "0") + "\0");
    put(136, "00000000000\0");
    h.fill(32, 148, 156);
    put(156, "0");
    put(257, "ustar\0");
    put(263, "00");
    put(148, h.reduce((a, b) => a + b, 0).toString(8).padStart(6, "0") + "\0 ");
    const padded = new Uint8Array(Math.ceil(f.data.length / 512) * 512);
    padded.set(f.data);
    blocks.push(h, padded);
    total += 512 + padded.length;
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const b of blocks) {
    output.set(b, offset);
    offset += b.length;
  }
  return output;
}
