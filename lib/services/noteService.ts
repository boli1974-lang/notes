import type { Note } from "@prisma/client";
import {
  createNote as createNoteRepo,
  getNoteById as getNoteByIdRepo,
  hardDeleteNote as hardDeleteNoteRepo,
  listNotes as listNotesRepo,
  restoreNote as restoreNoteRepo,
  softDeleteNote as softDeleteNoteRepo,
  updateNote as updateNoteRepo,
  type CreateNoteInput,
  type ListNotesOptions,
  type UpdateNoteInput,
} from "@/lib/repositories/noteRepository";

export async function createNote(input: CreateNoteInput, userId?: string): Promise<Note> {
  return createNoteRepo(input, userId);
}

export async function getNoteById(
  id: string,
  userId?: string,
  includeDeleted = false,
): Promise<Note | null> {
  return getNoteByIdRepo(id, userId, includeDeleted);
}

export async function listNotes(options: ListNotesOptions = {}): Promise<Note[]> {
  return listNotesRepo(options);
}

export async function updateNote(
  id: string,
  input: UpdateNoteInput,
  userId?: string,
): Promise<Note | null> {
  return updateNoteRepo(id, input, userId);
}

export async function softDeleteNote(id: string, userId?: string): Promise<boolean> {
  return softDeleteNoteRepo(id, userId);
}

export async function restoreNote(id: string, userId?: string): Promise<boolean> {
  return restoreNoteRepo(id, userId);
}

export async function hardDeleteNote(id: string, userId?: string): Promise<boolean> {
  return hardDeleteNoteRepo(id, userId);
}
