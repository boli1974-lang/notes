import * as noteService from "@/lib/services/noteService";
import { hardDeleteReviewDataByBatchId } from "@/lib/repositories/reviewRepo";
import { getOrCreateTodayBatch, markNoteReviewed } from "@/lib/services/reviewService";
import { randomUUID } from "node:crypto";

function pass(message: string): void {
  console.log(`PASS: ${message}`);
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    fail(message);
  }
}

async function main(): Promise<void> {
  const marker = `smoke-review-service-${Date.now()}`;
  const testUserId = randomUUID();
  const createdNoteIds: string[] = [];
  const createdBatchIds = new Set<string>();
  const now = new Date();

  try {
    const noteA = await noteService.createNote({ title: `${marker}-a`, content: "a" }, testUserId);
    const noteB = await noteService.createNote({ title: `${marker}-b`, content: "b" }, testUserId);
    const noteC = await noteService.createNote({ title: `${marker}-c`, content: "c" }, testUserId);
    const noteD = await noteService.createNote({ title: `${marker}-d`, content: "d" }, testUserId);
    const noteE = await noteService.createNote({ title: `${marker}-e`, content: "e" }, testUserId);
    createdNoteIds.push(noteA.id, noteB.id, noteC.id, noteD.id, noteE.id);
    pass("created seed notes for review service smoke test");

    await markNoteReviewed(noteA.id, testUserId, new Date(now.getTime() - 24 * 60 * 60 * 1000));
    pass("created recent review event for one note");

    await noteService.softDeleteNote(noteD.id, testUserId);
    pass("soft-deleted one note before batch generation");

    const batch1 = await getOrCreateTodayBatch({ now, batchSize: 3, userId: testUserId });
    createdBatchIds.add(batch1.batchId);
    assert(batch1.notes.length === 3, "batch should contain expected number of notes");

    const batch1NoteIds = batch1.notes.map((item) => item.note.id);
    assert(!batch1NoteIds.includes(noteD.id), "batch should exclude deleted notes");
    assert(
      !batch1NoteIds.includes(noteA.id),
      "batch should prefer notes not reviewed in last 3 days when enough are available",
    );
    pass("batch generation respects exclusion and preference invariants");

    const batch2 = await getOrCreateTodayBatch({ now, batchSize: 3, userId: testUserId });
    createdBatchIds.add(batch2.batchId);
    const batch2NoteIds = batch2.notes.map((item) => item.note.id);

    assert(batch2.batchId === batch1.batchId, "same-day batch ID should be stable");
    assert(
      JSON.stringify(batch2NoteIds) === JSON.stringify(batch1NoteIds),
      "same-day batch note order should be stable",
    );
    pass("same-day batch is stable across repeated calls");

    await markNoteReviewed(batch1NoteIds[0], testUserId);
    const batch3 = await getOrCreateTodayBatch({ now, batchSize: 3, userId: testUserId });
    const batch3NoteIds = batch3.notes.map((item) => item.note.id);

    assert(
      JSON.stringify(batch3NoteIds) === JSON.stringify(batch1NoteIds),
      "mark reviewed should not reshuffle today's batch",
    );
    pass("mark reviewed does not reshuffle existing daily batch");

    pass("reviewService smoke test completed");
  } finally {
    for (const batchId of createdBatchIds) {
      await hardDeleteReviewDataByBatchId(batchId);
    }
    for (const noteId of createdNoteIds) {
      await noteService.hardDeleteNote(noteId, testUserId);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
