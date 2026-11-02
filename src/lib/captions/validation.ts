export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function imageExtension(bytes: Uint8Array, mime: string): string | null {
  const hex = Array.from(bytes.slice(0, 12), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  if (mime === "image/jpeg" && hex.startsWith("ffd8ff")) return "jpg";
  if (mime === "image/png" && hex.startsWith("89504e470d0a1a0a")) return "png";
  if (
    mime === "image/webp" &&
    hex.startsWith("52494646") &&
    hex.slice(16, 24) === "57454250"
  )
    return "webp";
  return null;
}
