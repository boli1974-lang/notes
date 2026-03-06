import type { NoteTag, Tag } from "@prisma/client";
import { prisma } from "@/lib/db";

type OptionalUserWhere = { userId?: string | null };
export type TagWithCount = Tag & { noteCount: number };

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

export async function findManyTagsWithCounts(userId?: string): Promise<TagWithCount[]> {
  const tags = await findManyTags(userId);
  if (tags.length === 0) {
    return [];
  }

  const counts = await prisma.noteTag.groupBy({
    by: ["tagId"],
    where: {
      tagId: { in: tags.map((tag) => tag.id) },
      note: {
        deletedAt: null,
      },
    },
    _count: {
      _all: true,
    },
  });

  const countByTagId = new Map(counts.map((item) => [item.tagId, item._count._all]));
  return tags.map((tag) => ({
    ...tag,
    noteCount: countByTagId.get(tag.id) ?? 0,
  }));
}

export async function findManyUnusedTags(userId?: string): Promise<Tag[]> {
  return prisma.tag.findMany({
    where: {
      ...withOptionalUserWhere(userId),
      noteTags: {
        none: {
          note: {
            deletedAt: null,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function findTagsByNoteId(noteId: string, userId?: string): Promise<Tag[]> {
  const noteTags = await prisma.noteTag.findMany({
    where: {
      noteId,
      ...(userId ? { tag: { userId } } : {}),
    },
    include: {
      tag: true,
    },
    orderBy: {
      tag: {
        createdAt: "desc",
      },
    },
  });

  return noteTags.map((noteTag) => noteTag.tag);
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

export async function hardDeleteUnusedTag(id: string, userId?: string): Promise<boolean> {
  const result = await prisma.tag.deleteMany({
    where: {
      id,
      ...withOptionalUserWhere(userId),
      noteTags: {
        none: {
          note: {
            deletedAt: null,
          },
        },
      },
    },
  });

  return result.count > 0;
}
