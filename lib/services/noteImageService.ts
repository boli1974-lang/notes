import type { NoteImage } from "@prisma/client";
import { randomUUID } from "crypto";
import * as noteImageRepo from "@/lib/repositories/noteImageRepository";
import { getNoteById } from "@/lib/services/noteService";
import * as storage from "@/lib/storage/supabaseStorage";

export const MAX_IMAGES_PER_NOTE = 5;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Signed URL expiry in seconds (1 hour). */
export const SIGNED_URL_EXPIRY_SECONDS = 3600;

export const IMAGE_LIMIT_REACHED = "IMAGE_LIMIT_REACHED";
export const IMAGE_TOO_LARGE = "IMAGE_TOO_LARGE";
export const IMAGE_TYPE_NOT_ALLOWED = "IMAGE_TYPE_NOT_ALLOWED";
export const NOTE_NOT_FOUND = "NOTE_NOT_FOUND";
export const IMAGE_NOT_FOUND = "IMAGE_NOT_FOUND";

export type NoteImageWithUrl = NoteImage & { url: string };

export type UploadImageFile = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

function sanitizeFileName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, "");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "image";
}

function buildStoragePath(noteId: string, fileName: string): string {
  const sanitized = sanitizeFileName(fileName);
  return `notes/${noteId}/${randomUUID()}-${sanitized}`;
}

export async function uploadImage(
  noteId: string,
  file: UploadImageFile,
  userId?: string,
): Promise<NoteImage> {
  const note = await getNoteById(noteId, userId, false);
  if (!note) {
    throw new Error(NOTE_NOT_FOUND);
  }
  if (!ALLOWED_CONTENT_TYPES.includes(file.contentType as (typeof ALLOWED_CONTENT_TYPES)[number])) {
    throw new Error(IMAGE_TYPE_NOT_ALLOWED);
  }
  if (file.sizeBytes > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(IMAGE_TOO_LARGE);
  }
  const existing = await noteImageRepo.findImagesByNoteId(noteId, userId);
  // Image-count enforcement is safe only because POST is single-file-per-request and the UI
  // uploads sequentially. This is not race-proof for future parallel or batch uploads; strengthen
  // enforcement (e.g. advisory lock or transactional check) before adding multi-file or parallel.
  if (existing.length >= MAX_IMAGES_PER_NOTE) {
    throw new Error(IMAGE_LIMIT_REACHED);
  }
  const path = buildStoragePath(noteId, file.fileName);
  await storage.uploadImage(file.buffer, path, file.contentType);
  try {
    return await noteImageRepo.createImage(
      {
        noteId,
        storagePath: path,
        fileName: file.fileName,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
      },
      userId,
    );
  } catch (e) {
    try {
      await storage.deleteImage(path);
    } catch {
      // best-effort cleanup
    }
    throw e;
  }
}

export async function listImagesByNoteId(
  noteId: string,
  userId?: string,
): Promise<NoteImageWithUrl[]> {
  const note = await getNoteById(noteId, userId, false);
  if (!note) {
    throw new Error(NOTE_NOT_FOUND);
  }
  const images = await noteImageRepo.findImagesByNoteId(noteId, userId);
  const urls = await Promise.all(
    images.map((img) => storage.createSignedUrl(img.storagePath, SIGNED_URL_EXPIRY_SECONDS)),
  );
  return images.map((img, i) => ({ ...img, url: urls[i] }));
}

export async function deleteImage(imageId: string, userId?: string): Promise<void> {
  const image = await noteImageRepo.findImageById(imageId, userId, true);
  if (!image) {
    throw new Error(IMAGE_NOT_FOUND);
  }
  if (image.deletedAt) {
    return; // idempotent: already soft-deleted
  }
  try {
    await storage.deleteImage(image.storagePath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("not found") || msg.includes("404")) {
      // idempotent: object already gone
    } else {
      console.error("Storage delete failed for image", imageId, e);
      // Still soft-delete metadata so user sees image as removed
    }
  }
  await noteImageRepo.softDeleteImage(imageId, userId);
}

export async function softDeleteImagesByNoteId(
  noteId: string,
  userId?: string,
): Promise<number> {
  return noteImageRepo.softDeleteImagesByNoteId(noteId, userId);
}

export async function restoreImagesByNoteId(
  noteId: string,
  userId?: string,
): Promise<number> {
  return noteImageRepo.restoreImagesByNoteId(noteId, userId);
}

export async function deleteStorageObjectsForNoteId(
  noteId: string,
  userId?: string,
): Promise<void> {
  const images = await noteImageRepo.findImagesByNoteIdIncludeDeleted(noteId, userId);
  for (const img of images) {
    try {
      await storage.deleteImage(img.storagePath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("not found") && !msg.includes("404")) {
        console.error("Storage delete failed for path", img.storagePath, e);
      }
    }
  }
}
