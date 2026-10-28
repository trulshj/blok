/**
 * Where the browser can load an image from markdown: "./render-01.avif" lives in the note's folder
 * (served at /files/<slug>/…), truls.dev's own /images/… come from its public folder (for imported
 * posts), and web addresses load as they are. Anything else can't be shown, so it returns null.
 */
export function imageUrl(slug: string, src: string): string | null {
  if (/^https?:\/\//i.test(src)) return src;
  if (/^\/images\/[^?#]+$/.test(src)) return `/truls-public${src}`;
  const file = src.startsWith("./") ? src.slice(2) : src;
  if (/^[^/\\]+$/.test(file) && !file.startsWith(".")) return `/files/${encodeURIComponent(slug)}/${encodeURIComponent(file)}`;
  return null;
}

/** "412 KB", "1.8 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Image files from a drop or paste. */
export function imageFiles(data: DataTransfer | null): File[] {
  return [...(data?.files ?? [])].filter((f) => f.type.startsWith("image/"));
}
