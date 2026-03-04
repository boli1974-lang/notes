import { Prisma, type NoteTag, type Tag } from "@prisma/client";
import { getNoteById } from "@/lib/repositories/noteRepository";
import {
  attachTagToNote as attachTagToNoteRepo,
  createTag as createTagRepo,
  detachTagFromNote as detachTagFromNoteRepo,
  findManyTags as findManyTagsRepo,
  findManyTagsWithCounts as findManyTagsWithCountsRepo,
  findTagsByNoteId as findTagsByNoteIdRepo,
  findTagById as findTagByIdRepo,
  findTagByName as findTagByNameRepo,
  hardDeleteTag as hardDeleteTagRepo,
  type TagWithCount,
} from "@/lib/repositories/tagsRepo";

type AttachTagInput = {
  tagId?: string;
  tagName?: string;
};

function normalizeTagName(input: string): string {
  return input.trim().toLowerCase();
}

export async function listTags(userId?: string): Promise<Tag[]> {
  return findManyTagsRepo(userId);
}

export async function listTagsWithCounts(userId?: string): Promise<TagWithCount[]> {
  return findManyTagsWithCountsRepo(userId);
}

export async function listTagsForNote(noteId: string, userId?: string): Promise<Tag[]> {
  const note = await getNoteById(noteId, userId);
  if (!note) {
    throw new Error("NOTE_NOT_FOUND");
  }

  return findTagsByNoteIdRepo(noteId, userId);
}

export async function createTag(name: string, userId?: string): Promise<Tag> {
  const normalized = normalizeTagName(name);
  if (normalized.length === 0) {
    throw new Error("INVALID_TAG_NAME");
  }
  if (normalized.length > 30) {
    throw new Error("TAG_NAME_TOO_LONG");
  }

  const existing = await findTagByNameRepo(normalized, userId);
  if (existing) {
    return existing;
  }

  try {
    return await createTagRepo(normalized, userId);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raceWinner = await findTagByNameRepo(normalized, userId);
      if (raceWinner) {
        return raceWinner;
      }
    }
    throw error;
  }
}

export async function attachTagToNote(
  noteId: string,
  input: AttachTagInput,
  userId?: string,
): Promise<{ tag: Tag; noteTag: NoteTag }> {
  const note = await getNoteById(noteId, userId);
  if (!note) {
    throw new Error("NOTE_NOT_FOUND");
  }

  let tag: Tag | null = null;
  if (input.tagId) {
    tag = await findTagByIdRepo(input.tagId, userId);
    if (!tag) {
      throw new Error("TAG_NOT_FOUND");
    }
  } else if (input.tagName) {
    tag = await createTag(input.tagName, userId);
  } else {
    throw new Error("TAG_INPUT_REQUIRED");
  }

  const noteTag = await attachTagToNoteRepo(noteId, tag.id);
  return { tag, noteTag };
}

export async function detachTagFromNote(
  noteId: string,
  tagId: string,
  userId?: string,
): Promise<boolean> {
  const note = await getNoteById(noteId, userId);
  if (!note) {
    throw new Error("NOTE_NOT_FOUND");
  }

  const tag = await findTagByIdRepo(tagId, userId);
  if (!tag) {
    throw new Error("TAG_NOT_FOUND");
  }

  return detachTagFromNoteRepo(noteId, tagId);
}

export async function hardDeleteTag(tagId: string, userId?: string): Promise<boolean> {
  return hardDeleteTagRepo(tagId, userId);
}
