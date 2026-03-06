import type { Note, ReviewBatch, ReviewEvent } from "@prisma/client";
import { prisma } from "@/lib/db";

type BatchItemWithNote = {
  id: string;
  batchId: string;
  noteId: string;
  position: number;
  note: Note;
};

type OptionalUserWhere = { userId?: string | null };

function withOptionalUserWhere(userId?: string): OptionalUserWhere {
  return userId ? { userId } : {};
}

export async function findReviewBatchByDate(
  reviewDate: Date,
  userId?: string,
): Promise<ReviewBatch | null> {
  return prisma.reviewBatch.findFirst({
    where: {
      reviewDate,
      ...withOptionalUserWhere(userId),
    },
  });
}

export async function createReviewBatch(
  reviewDate: Date,
  userId?: string,
): Promise<ReviewBatch> {
  return prisma.reviewBatch.create({
    data: {
      reviewDate,
      userId: userId ?? null,
    },
  });
}

export async function createReviewBatchItems(
  batchId: string,
  noteIdsInOrder: string[],
): Promise<void> {
  if (noteIdsInOrder.length === 0) {
    return;
  }

  await prisma.reviewBatchItem.createMany({
    data: noteIdsInOrder.map((noteId, index) => ({
      batchId,
      noteId,
      position: index,
    })),
  });
}

export async function findBatchItemsByBatchId(
  batchId: string,
): Promise<BatchItemWithNote[]> {
  return prisma.reviewBatchItem.findMany({
    where: {
      batchId,
      note: { deletedAt: null },
    },
    include: { note: true },
    orderBy: { position: "asc" },
  });
}

export async function createReviewEvent(
  noteId: string,
  reviewedAt: Date,
  reviewBatchDate: Date,
  userId?: string,
): Promise<ReviewEvent> {
  return prisma.reviewEvent.create({
    data: {
      noteId,
      reviewedAt,
      reviewBatchDate,
      userId: userId ?? null,
    },
  });
}

export async function findLatestReviewEventForNoteOnDate(
  noteId: string,
  reviewBatchDate: Date,
  userId?: string,
): Promise<ReviewEvent | null> {
  return prisma.reviewEvent.findFirst({
    where: {
      noteId,
      reviewBatchDate,
      userId: userId ?? null,
    },
    orderBy: { reviewedAt: "desc" },
  });
}

export async function countReviewEventsForNoteOnDate(
  noteId: string,
  reviewBatchDate: Date,
  userId?: string,
): Promise<number> {
  return prisma.reviewEvent.count({
    where: {
      noteId,
      reviewBatchDate,
      userId: userId ?? null,
    },
  });
}

export async function findReviewedNoteIdsSince(
  since: Date,
  userId?: string,
): Promise<string[]> {
  const events = await prisma.reviewEvent.findMany({
    where: {
      reviewedAt: { gte: since },
      ...withOptionalUserWhere(userId),
    },
    select: { noteId: true },
    distinct: ["noteId"],
  });

  return events.map((event) => event.noteId);
}

export async function findReviewedNoteIdsOnDate(
  reviewBatchDate: Date,
  userId?: string,
  noteIds?: string[],
): Promise<string[]> {
  const events = await prisma.reviewEvent.findMany({
    where: {
      reviewBatchDate,
      ...(noteIds && noteIds.length > 0 ? { noteId: { in: noteIds } } : {}),
      ...withOptionalUserWhere(userId),
    },
    select: { noteId: true },
    distinct: ["noteId"],
  });

  return events.map((event) => event.noteId);
}

export async function hardDeleteReviewDataByBatchId(batchId: string): Promise<void> {
  await prisma.reviewEvent.deleteMany({
    where: {
      note: { reviewBatchItems: { some: { batchId } } },
    },
  });
  await prisma.reviewBatchItem.deleteMany({ where: { batchId } });
  await prisma.reviewBatch.deleteMany({ where: { id: batchId } });
}
