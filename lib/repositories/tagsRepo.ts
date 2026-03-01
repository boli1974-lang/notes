import type { NoteTag, Tag } from "@prisma/client";
import { prisma } from "@/lib/db";

type OptionalUserWhere = { userId?: string | null };

function withOptionalUserWhere(userId?: string): OptionalUserWhere {
  return userId ? { userId } : {};
}

export async function createTag(name: string, userId?: string): Promise<Tag> {
  return prisma.tag.create({
    data: {
      name,
      userId: userId ?? null,
    },
  });
}

export async function findTagByName(name: string, userId?: string): Promise<Tag | null> {
  return prisma.tag.findFirst({
    where: {
      name,
      ...withOptionalUserWhere(userId),
    },
  });
}

export async function findTagById(id: string, userId?: string): Promise<Tag | null> {
  return prisma.tag.findFirst({
    where: {
      id,
      ...withOptionalUserWhere(userId),
    },
  });
}

export async function findManyTags(userId?: string): Promise<Tag[]> {
  return prisma.tag.findMany({
    where: withOptionalUserWhere(userId),
    orderBy: { createdAt: "desc" },
  });
}

export async function attachTagToNote(noteId: string, tagId: string): Promise<NoteTag> {
  return prisma.noteTag.upsert({
    where: {
      noteId_tagId: {
        noteId,
        tagId,
      },
    },
    update: {},
    create: {
      noteId,
      tagId,
    },
  });
}

export async function detachTagFromNote(noteId: string, tagId: string): Promise<boolean> {
  const result = await prisma.noteTag.deleteMany({
    where: {
      noteId,
      tagId,
    },
  });

  return result.count > 0;
}

export async function hardDeleteTag(id: string, userId?: string): Promise<boolean> {
  const result = await prisma.tag.deleteMany({
    where: {
      id,
      ...withOptionalUserWhere(userId),
    },
  });

  return result.count > 0;
}
