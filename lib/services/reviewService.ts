import type { Note, ReviewEvent } from "@prisma/client";
import { getNoteById, listNotes } from "@/lib/repositories/noteRepository";
import {
  countReviewEventsForNoteOnDate,
  createReviewBatch,
  createReviewBatchItems,
  createReviewEvent,
  findBatchItemsByBatchId,
  findLatestReviewEventForNoteOnDate,
  findReviewBatchByDate,
  findReviewedNoteIdsOnDate,
  findReviewedNoteIdsSince,
} from "@/lib/repositories/reviewRepo";

const DEFAULT_BATCH_SIZE = 10;
const REVIEW_EXCLUSION_DAYS = 3;

export type ReviewBatchNote = {
  position: number;
  note: Note;
};

export type ReviewTodayBatch = {
  batchId: string;
  reviewDate: Date;
  notes: ReviewBatchNote[];
};

export type GetOrCreateTodayBatchOptions = {
  userId?: string;
  now?: Date;
  batchSize?: number;
};

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function shuffle<T>(input: T[]): T[] {
  const result = [...input];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function toReviewTodayBatch(
  batchId: string,
  reviewDate: Date,
  items: Array<{ position: number; note: Note }>,
): ReviewTodayBatch {
  return {
    batchId,
    reviewDate,
    notes: items.map((item) => ({
      position: item.position,
      note: item.note,
    })),
  };
}

export async function getOrCreateTodayBatch(
  options: GetOrCreateTodayBatchOptions = {},
): Promise<ReviewTodayBatch> {
  const userId = options.userId;
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const reviewDate = startOfUtcDay(now);

  const existingBatch = await findReviewBatchByDate(reviewDate, userId);
  if (existingBatch) {
    const existingItems = await findBatchItemsByBatchId(existingBatch.id);
    return toReviewTodayBatch(existingBatch.id, existingBatch.reviewDate, existingItems);
  }

  const availableNotes = await listNotes({ userId });
  const reviewedSince = addUtcDays(reviewDate, -REVIEW_EXCLUSION_DAYS);
  const recentlyReviewedIds = new Set(await findReviewedNoteIdsSince(reviewedSince, userId));

  const preferred = availableNotes.filter((note) => !recentlyReviewedIds.has(note.id));
  const fallback = availableNotes.filter((note) => recentlyReviewedIds.has(note.id));
  const selected = [...shuffle(preferred), ...shuffle(fallback)].slice(0, batchSize);

  const createdBatch = await createReviewBatch(reviewDate, userId);
  await createReviewBatchItems(
    createdBatch.id,
    selected.map((note) => note.id),
  );

  const createdItems = await findBatchItemsByBatchId(createdBatch.id);
  return toReviewTodayBatch(createdBatch.id, createdBatch.reviewDate, createdItems);
}

export async function markNoteReviewed(
  noteId: string,
  userId?: string,
  reviewedAt = new Date(),
): Promise<ReviewEvent> {
  const note = await getNoteById(noteId, userId);
  if (!note) {
    throw new Error("Cannot mark review: note not found or soft-deleted.");
  }

  const reviewBatchDate = startOfUtcDay(reviewedAt);
  const latestForDay = await findLatestReviewEventForNoteOnDate(noteId, reviewBatchDate, userId);
  if (latestForDay) {
    // Milestone 1 semantics: at most one review event per note per day.
    return latestForDay;
  }

  return createReviewEvent(noteId, reviewedAt, reviewBatchDate, userId);
}

export async function countReviewEventsForNoteAndDay(
  noteId: string,
  reviewedAt: Date,
  userId?: string,
): Promise<number> {
  const reviewBatchDate = startOfUtcDay(reviewedAt);
  return countReviewEventsForNoteOnDate(noteId, reviewBatchDate, userId);
}

export async function listReviewedNoteIdsForDate(
  reviewDate: Date,
  userId?: string,
  noteIds?: string[],
): Promise<string[]> {
  const normalizedDate = startOfUtcDay(reviewDate);
  return findReviewedNoteIdsOnDate(normalizedDate, userId, noteIds);
}
