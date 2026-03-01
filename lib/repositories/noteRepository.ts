import { Prisma, type Note } from "@prisma/client";
import { prisma } from "@/lib/db";

export type CreateNoteInput = {
  title?: string | null;
  content: string;
};

export type UpdateNoteInput = {
  title?: string | null;
  content?: string;
};

export type ListNotesOptions = {
  userId?: string;
  includeDeleted?: boolean;
  take?: number;
  skip?: number;
  search?: string;
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: Prisma.SortOrder;
};

function withOptionalUserFilter<T extends Record<string, unknown>>(
  where: T,
  userId?: string,
): T & { userId?: string } {
  if (!userId) {
    return where;
  }

  return { ...where, userId };
}

export async function createNote(
  input: CreateNoteInput,
  userId?: string,
): Promise<Note> {
  return prisma.note.create({
    data: {
      title: input.title ?? null,
      content: input.content,
      userId: userId ?? null,
    },
  });
}

export async function getNoteById(
  id: string,
  userId?: string,
  includeDeleted = false,
): Promise<Note | null> {
  const where = withOptionalUserFilter(
    {
      id,
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
    userId,
  );

  return prisma.note.findFirst({ where });
}

export async function listNotes(options: ListNotesOptions = {}): Promise<Note[]> {
  const where: Prisma.NoteWhereInput = withOptionalUserFilter(
    {
      ...(options.includeDeleted ? {} : { deletedAt: null }),
      ...(options.search
        ? {
            OR: [
              { title: { contains: options.search, mode: "insensitive" } },
              { content: { contains: options.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    options.userId,
  );

  return prisma.note.findMany({
    where,
    orderBy: {
      [options.sortBy ?? "createdAt"]: options.sortOrder ?? "desc",
    },
    take: options.take,
    skip: options.skip,
  });
}

export async function updateNote(
  id: string,
  input: UpdateNoteInput,
  userId?: string,
): Promise<Note | null> {
  const result = await prisma.note.updateMany({
    where: withOptionalUserFilter({ id, deletedAt: null }, userId),
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
    },
  });

  if (result.count === 0) {
    return null;
  }

  return getNoteById(id, userId);
}

export async function softDeleteNote(id: string, userId?: string): Promise<boolean> {
  const result = await prisma.note.updateMany({
    where: withOptionalUserFilter({ id, deletedAt: null }, userId),
    data: { deletedAt: new Date() },
  });

  return result.count > 0;
}

export async function restoreNote(id: string, userId?: string): Promise<boolean> {
  const result = await prisma.note.updateMany({
    where: withOptionalUserFilter({ id }, userId),
    data: { deletedAt: null },
  });

  return result.count > 0;
}

export async function hardDeleteNote(id: string, userId?: string): Promise<boolean> {
  const result = await prisma.note.deleteMany({
    where: withOptionalUserFilter({ id }, userId),
  });

  return result.count > 0;
}
