// Vault image handling: display (blob URL cache over vault_read_binary)
// and capture (paste/drop → attachments/).

import { ipc } from "./ipc";
import { newId } from "../domain/ids";

const blobUrls = new Map<string, string>();

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/** Blob URL for a vault-relative image path (cached per session). */
export async function vaultImageUrl(rel: string): Promise<string> {
  const cached = blobUrls.get(rel);
  if (cached) return cached;
  const bytes = await ipc.readBinary(rel);
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  const blob = new Blob([new Uint8Array(bytes)], { type: MIME[ext] ?? "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  blobUrls.set(rel, url);
  return url;
}

/** Map an <img src> from markdown to a vault-relative path, or null if it's
 *  external (http/data). Files reference attachments as `attachments/…` or
 *  with leading `../` segments depending on nesting depth. */
export function normalizeImageSrc(src: string): string | null {
  if (/^(https?:|data:|blob:)/.test(src)) return null;
  const idx = src.indexOf("attachments/");
  if (idx >= 0) return src.slice(idx);
  return src.replace(/^(\.\.?\/)+/, "");
}

/** Persist a pasted/dropped image into attachments/. Returns the
 *  vault-relative path to reference in markdown. */
export async function saveImageToAttachments(data: Blob, fileName?: string): Promise<string> {
  const extFromName = fileName?.split(".").pop()?.toLowerCase();
  const extFromType = data.type.split("/")[1]?.replace("jpeg", "jpg");
  const ext = (extFromName && MIME[extFromName] ? extFromName : extFromType) || "png";
  const rel = `attachments/img-${newId().toLowerCase()}.${ext}`;
  const bytes = Array.from(new Uint8Array(await data.arrayBuffer()));
  await ipc.writeBinary(rel, bytes);
  return rel;
}

/** Extract image blobs from a paste/drop event (or null if none). */
export function imagesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  return [...dt.files].filter((f) => f.type.startsWith("image/"));
}
