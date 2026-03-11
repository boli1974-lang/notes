import type { NoteImage } from "@prisma/client";
import { prisma } from "@/lib/db";

export type CreateNoteImageInput = {
  noteId: string;
  storagePath: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

function withOptionalUserWhere(where: { noteId: string; deletedAt?: null | Date }, userId?: string) {
  if (!userId) return where;
  return { ...where, userId };
}

export async function createImage(
  data: CreateNoteImageInput,
  userId?: string,
): Promise<NoteImage> {
  return prisma.noteImage.create({
    data: {
      noteId: data.noteId,
      storagePath: data.storagePath,
      fileName: data.fileName,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes,
      userId: userId ?? null,
    },
  });
}

export async function findImagesByNoteId(
  noteId: string,
  userId?: string,
): Promise<NoteImage[]> {
  const where = withOptionalUserWhere({ noteId, deletedAt: null }, userId);
  return prisma.noteImage.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
}

export async function findImagesByNoteIdIncludeDeleted(
  noteId: string,
  userId?: string,
): Promise<NoteImage[]> {
  const where: { noteId: string; userId?: string | null } = { noteId };
  if (userId !== undefined) {
    where.userId = userId;
  }
  return prisma.noteImage.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });
}

export async function findImageById(
  id: string,
  userId?: string,
  includeDeleted = false,
): Promise<NoteImage | null> {
  const where: { id: string; deletedAt?: null; userId?: string | null } = { id };
  if (!includeDeleted) {
    where.deletedAt = null;
  }
  if (userId !== undefined) {
    where.userId = userId;
  }
  return prisma.noteImage.findFirst({ where });
}

export async function softDeleteImage(id: string, userId?: string): Promise<boolean> {
  const where: { id: string; deletedAt: null; userId?: string | null } = { id, deletedAt: null };
  if (userId !== undefined) {
    where.userId = userId;
  }
  const result = await prisma.noteImage.updateMany({
    where,
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}

export async function softDeleteImagesByNoteId(
  noteId: string,
  userId?: string,
): Promise<number> {
  const where: { noteId: string; deletedAt: null; userId?: string | null } = {
    noteId,
    deletedAt: null,
  };
  if (userId !== undefined) {
    where.userId = userId;
  }
  const result = await prisma.noteImage.updateMany({
    where,
    data: { deletedAt: new Date() },
  });
  return result.count;
}

export async function restoreImagesByNoteId(
  noteId: string,
  userId?: string,
): Promise<number> {
  const where: { noteId: string; userId?: string | null } = { noteId };
  if (userId !== undefined) {
    where.userId = userId;
  }
  const result = await prisma.noteImage.updateMany({
    where,
    data: { deletedAt: null },
  });
  return result.count;
}
