import { randomUUID } from "node:crypto";
import {
  countReviewEventsForNoteOnDate,
  hardDeleteReviewDataByBatchId,
} from "@/lib/repositories/reviewRepo";
import { hardDeleteNote } from "@/lib/services/noteService";
import { hardDeleteTag } from "@/lib/services/tagService";

type ApiResult<T> = {
  data?: T;
  error?: string;
};

type NoteResponse = {
  id: string;
  title: string | null;
  content: string;
};

type ReviewTodayResponse = {
  batchId: string;
  reviewDate: string;
  reviewedNoteIds?: string[];
  notes: Array<{ position: number; note: { id: string } }>;
};

type TagResponse = {
  id: string;
  name: string;
};

type TagWithCountResponse = TagResponse & {
  noteCount: number;
};

function removeTagFromCleanup(createdTagIds: string[], tagId: string): void {
  const index = createdTagIds.indexOf(tagId);
  if (index >= 0) {
    createdTagIds.splice(index, 1);
  }
}

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

async function parseJson<T>(response: Response): Promise<ApiResult<T>> {
  return (await response.json()) as ApiResult<T>;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function main(): Promise<void> {
  const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
  const marker = `smoke-api-${Date.now()}`;
  const tagMarker = `t-${Date.now().toString().slice(-6)}`;
  const userId = randomUUID();
  const createdNoteIds: string[] = [];
  const createdTagIds: string[] = [];
  const createdBatchIds = new Set<string>();

  try {
    const health = await fetch(`${baseUrl}/api/notes`);
    if (!health.ok && health.status >= 500) {
      fail("API server is not healthy. Start dev server with npm run dev.");
    }

    const invalidCreate = await fetch(`${baseUrl}/api/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "missing content" }),
    });
    assert(invalidCreate.status === 400, "invalid note create should return 400");
    pass("invalid note payload is rejected with 4xx");

    const createRes = await fetch(`${baseUrl}/api/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: marker, content: `content-${marker}`, userId }),
    });
    assert(createRes.status === 201, "create note should return 201");
    const createdPayload = await parseJson<NoteResponse>(createRes);
    assert(createdPayload.data?.id, "create note should return note data");
    const noteId = createdPayload.data.id;
    createdNoteIds.push(noteId);
    pass("created note via API");

    const getRes = await fetch(`${baseUrl}/api/notes/${noteId}?userId=${encodeURIComponent(userId)}`);
    assert(getRes.status === 200, "get note should return 200");
    pass("fetched note by id via API");

    const invalidNoteIdRes = await fetch(`${baseUrl}/api/notes/not-a-uuid`);
    assert(invalidNoteIdRes.status === 400, "invalid note id path should return 400");
    pass("invalid note id path is rejected with 4xx");

    const listRes = await fetch(
      `${baseUrl}/api/notes?search=${encodeURIComponent(marker)}&userId=${encodeURIComponent(userId)}`,
    );
    assert(listRes.status === 200, "list notes should return 200");
    const listPayload = await parseJson<NoteResponse[]>(listRes);
    assert(
      listPayload.data?.some((note) => note.id === noteId),
      "list notes should include created note",
    );
    pass("listed notes includes created note");

    const patchRes = await fetch(`${baseUrl}/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${marker}-updated`, userId }),
    });
    assert(patchRes.status === 200, "update note should return 200");
    pass("updated note via API");

    const invalidTagCreate = await fetch(`${baseUrl}/api/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    assert(invalidTagCreate.status === 400, "invalid tag create should return 400");
    pass("invalid tag payload is rejected with 4xx");

    const createTagRes = await fetch(`${baseUrl}/api/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${tagMarker}-tag`, userId }),
    });
    assert(createTagRes.status === 201, "create tag should return 201");
    const createdTagPayload = await parseJson<TagResponse>(createTagRes);
    assert(createdTagPayload.data?.id, "create tag should return tag data");
    const existingTagId = createdTagPayload.data.id;
    createdTagIds.push(existingTagId);
    pass("created tag via API");

    const createUnusedTagRes = await fetch(`${baseUrl}/api/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${tagMarker}-unused`, userId }),
    });
    assert(createUnusedTagRes.status === 201, "create unused tag should return 201");
    const createUnusedTagPayload = await parseJson<TagResponse>(createUnusedTagRes);
    assert(createUnusedTagPayload.data?.id, "create unused tag should return tag data");
    const unusedTagId = createUnusedTagPayload.data.id;
    createdTagIds.push(unusedTagId);
    pass("created unused tag via API");

    const listTagsRes = await fetch(`${baseUrl}/api/tags?userId=${encodeURIComponent(userId)}`);
    assert(listTagsRes.status === 200, "list tags should return 200");
    const listTagsPayload = await parseJson<TagResponse[]>(listTagsRes);
    assert(
      listTagsPayload.data?.some((tag) => tag.id === existingTagId),
      "list tags should include created tag",
    );
    pass("listed tags includes created tag");

    const listTagsWithCountsRes = await fetch(
      `${baseUrl}/api/tags?userId=${encodeURIComponent(userId)}&includeCounts=true`,
    );
    assert(listTagsWithCountsRes.status === 200, "list tags with counts should return 200");
    const listTagsWithCountsPayload = await parseJson<TagWithCountResponse[]>(listTagsWithCountsRes);
    const countedTag = listTagsWithCountsPayload.data?.find((tag) => tag.id === existingTagId);
    assert(countedTag !== undefined, "list tags with counts should include created tag");
    assert(typeof countedTag.noteCount === "number", "tag count should be a number");
    pass("listed tags with counts via API");

    const attachExistingTagRes = await fetch(`${baseUrl}/api/notes/${noteId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId: existingTagId, userId }),
    });
    assert(attachExistingTagRes.status === 201, "attach existing tag should return 201");
    pass("attached existing tag to note via API");

    const listNotesByTagRes = await fetch(
      `${baseUrl}/api/notes?userId=${encodeURIComponent(userId)}&tagId=${encodeURIComponent(existingTagId)}`,
    );
    assert(listNotesByTagRes.status === 200, "list notes by tagId should return 200");
    const listNotesByTagPayload = await parseJson<NoteResponse[]>(listNotesByTagRes);
    assert(
      listNotesByTagPayload.data?.some((note) => note.id === noteId),
      "list notes by tagId should include tagged note",
    );
    pass("filtered notes by tagId via API");

    const invalidAttachTagPayloadRes = await fetch(`${baseUrl}/api/notes/${noteId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagName: 123, userId }),
    });
    assert(invalidAttachTagPayloadRes.status === 400, "invalid attach tag payload should return 400");
    pass("invalid attach tag payload is rejected with 4xx");

    const attachNewTagRes = await fetch(`${baseUrl}/api/notes/${noteId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagName: `${tagMarker}-new-tag`, userId }),
    });
    assert(attachNewTagRes.status === 201, "attach new tag by name should return 201");
    const attachNewTagPayload = await parseJson<{ tag: TagResponse }>(attachNewTagRes);
    assert(attachNewTagPayload.data?.tag.id, "attach new tag should return created/selected tag");
    createdTagIds.push(attachNewTagPayload.data.tag.id);
    pass("created-and-attached tag by name via API");

    const listNoteTagsRes = await fetch(
      `${baseUrl}/api/notes/${noteId}/tags?userId=${encodeURIComponent(userId)}`,
    );
    assert(listNoteTagsRes.status === 200, "list note tags should return 200");
    const listNoteTagsPayload = await parseJson<TagResponse[]>(listNoteTagsRes);
    assert(
      listNoteTagsPayload.data?.some((tag) => tag.id === existingTagId),
      "list note tags should include attached existing tag",
    );
    assert(
      listNoteTagsPayload.data?.some((tag) => tag.id === attachNewTagPayload.data?.tag.id),
      "list note tags should include attached new tag",
    );
    pass("listed tags for note via API");

    const detachTagRes = await fetch(
      `${baseUrl}/api/notes/${noteId}/tags/${existingTagId}?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    assert(detachTagRes.status === 200, "detach tag should return 200");
    pass("detached tag from note via API");

    const invalidDetachTagPathRes = await fetch(
      `${baseUrl}/api/notes/${noteId}/tags/not-a-tag-id?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    assert(invalidDetachTagPathRes.status === 400, "invalid detach tag path should return 400");
    pass("invalid detach tag path is rejected with 4xx");

    const deleteRes = await fetch(
      `${baseUrl}/api/notes/${noteId}?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    assert(deleteRes.status === 200, "soft delete note should return 200");
    pass("soft-deleted note via API");

    const getAfterDeleteRes = await fetch(
      `${baseUrl}/api/notes/${noteId}?userId=${encodeURIComponent(userId)}`,
    );
    assert(getAfterDeleteRes.status === 404, "deleted note should be hidden by default");
    pass("default read excludes soft-deleted note");

    const restoreRes = await fetch(`${baseUrl}/api/notes/${noteId}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    assert(restoreRes.status === 200, "restore note should return 200");
    pass("restored soft-deleted note via API");

    const getAfterRestoreRes = await fetch(
      `${baseUrl}/api/notes/${noteId}?userId=${encodeURIComponent(userId)}`,
    );
    assert(getAfterRestoreRes.status === 200, "restored note should be visible again");
    const getAfterRestorePayload = await parseJson<NoteResponse>(getAfterRestoreRes);
    assert(getAfterRestorePayload.data, "restored note response should include data");
    assert(
      getAfterRestorePayload.data.title === `${marker}-updated`,
      "restored note should keep previous title",
    );
    assert(
      getAfterRestorePayload.data.content === `content-${marker}`,
      "restored note should keep previous content",
    );
    pass("restore returns previous note title/content");

    const listNoteTagsAfterRestoreRes = await fetch(
      `${baseUrl}/api/notes/${noteId}/tags?userId=${encodeURIComponent(userId)}`,
    );
    assert(listNoteTagsAfterRestoreRes.status === 200, "list note tags after restore should return 200");
    const listNoteTagsAfterRestorePayload = await parseJson<TagResponse[]>(listNoteTagsAfterRestoreRes);
    assert(
      listNoteTagsAfterRestorePayload.data?.some((tag) => tag.id === attachNewTagPayload.data?.tag.id),
      "restored note should keep previously attached tags",
    );
    assert(
      !listNoteTagsAfterRestorePayload.data?.some((tag) => tag.id === existingTagId),
      "restored note should keep previous detached-tag state",
    );
    pass("restore returns previous note tags state");

    const secondDeleteRes = await fetch(
      `${baseUrl}/api/notes/${noteId}?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    assert(secondDeleteRes.status === 200, "second soft delete after restore should return 200");
    const getAfterSecondDeleteRes = await fetch(
      `${baseUrl}/api/notes/${noteId}?userId=${encodeURIComponent(userId)}`,
    );
    assert(getAfterSecondDeleteRes.status === 404, "note should be hidden after second soft delete");
    pass("delete-restore-delete remains stable");

    const secondRestoreRes = await fetch(`${baseUrl}/api/notes/${noteId}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    assert(secondRestoreRes.status === 200, "second restore should return 200");
    const getAfterSecondRestoreRes = await fetch(
      `${baseUrl}/api/notes/${noteId}?userId=${encodeURIComponent(userId)}`,
    );
    assert(getAfterSecondRestoreRes.status === 200, "note should be visible after second restore");
    pass("delete-restore-delete-restore repeatability works");

    const deleteUnusedTagRes = await fetch(
      `${baseUrl}/api/tags/${unusedTagId}?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    assert(deleteUnusedTagRes.status === 200, "delete unused tag should return 200");
    removeTagFromCleanup(createdTagIds, unusedTagId);
    pass("deleted unused tag via API");

    const deleteUsedTagRes = await fetch(
      `${baseUrl}/api/tags/${attachNewTagPayload.data!.tag.id}?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    assert(deleteUsedTagRes.status === 409, "delete in-use tag should return 409");
    pass("in-use tag cannot be deleted");

    // Create isolated review notes.
    for (let i = 0; i < 4; i += 1) {
      const res = await fetch(`${baseUrl}/api/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `${marker}-review-${i}`, content: `review-${i}`, userId }),
      });
      const payload = await parseJson<NoteResponse>(res);
      assert(res.status === 201 && payload.data?.id, "review seed note create should succeed");
      createdNoteIds.push(payload.data.id);
    }
    pass("created review seed notes via API");

    const todayRes1 = await fetch(
      `${baseUrl}/api/review/today?userId=${encodeURIComponent(userId)}&batchSize=3`,
    );
    assert(todayRes1.status === 200, "review today should return 200");
    const today1 = await parseJson<ReviewTodayResponse>(todayRes1);
    assert(today1.data && today1.data.notes.length === 3, "review batch should contain 3 notes");
    createdBatchIds.add(today1.data.batchId);
    const firstBatchIds = today1.data.notes.map((item) => item.note.id);
    pass("fetched daily review batch via API");

    const firstNoteId = firstBatchIds[0];
    const prevOnlyNoteId = firstBatchIds[1];
    const exitReviewNoteId = firstBatchIds[2];
    const reviewDay = startOfUtcDay(new Date());

    const prevOnlyCountBefore = await countReviewEventsForNoteOnDate(prevOnlyNoteId, reviewDay, userId);
    assert(prevOnlyCountBefore === 0, "note with no record-review call should have 0 events");
    pass("prev-only note has no review event when record endpoint is not called");

    const firstReviewTime = new Date();
    const sameDaySecondReviewTime = new Date(firstReviewTime.getTime() + 2 * 60 * 60 * 1000);

    const recordRes1 = await fetch(`${baseUrl}/api/review/mark-reviewed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: firstNoteId, reviewedAt: firstReviewTime.toISOString(), userId }),
    });
    assert(recordRes1.status === 201, "record review event should return 201");
    pass("recorded review event via API");

    const recordRes2 = await fetch(`${baseUrl}/api/review/mark-reviewed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: firstNoteId, reviewedAt: sameDaySecondReviewTime.toISOString(), userId }),
    });
    assert(recordRes2.status === 201, "same-day second record review event should still return 201");

    const dedupedFirstCount = await countReviewEventsForNoteOnDate(firstNoteId, reviewDay, userId);
    assert(dedupedFirstCount === 1, "same-day review event writes should dedupe to one event");
    pass("same-day review event writes are deduplicated to one event");

    // Product decision: undo restore preserves review status/history.
    const deleteReviewedNoteRes = await fetch(
      `${baseUrl}/api/notes/${firstNoteId}?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    assert(deleteReviewedNoteRes.status === 200, "soft delete reviewed note should return 200");
    const restoreReviewedNoteRes = await fetch(`${baseUrl}/api/notes/${firstNoteId}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    assert(restoreReviewedNoteRes.status === 200, "restore reviewed note should return 200");
    const reviewedCountAfterRestore = await countReviewEventsForNoteOnDate(firstNoteId, reviewDay, userId);
    assert(
      reviewedCountAfterRestore === 1,
      "restoring a deleted reviewed note should preserve review event history",
    );
    pass("undo restore preserves reviewed status/history");

    const invalidMarkReviewedPayloadRes = await fetch(`${baseUrl}/api/review/mark-reviewed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: firstNoteId, reviewedAt: 123, userId }),
    });
    assert(
      invalidMarkReviewedPayloadRes.status === 400,
      "invalid record-review-event payload should return 400",
    );
    pass("invalid record-review-event payload is rejected with 4xx");

    // Simulate "last note has no Next": user exits review from last note.
    const exitReviewRecordRes = await fetch(`${baseUrl}/api/review/mark-reviewed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: exitReviewNoteId, reviewedAt: new Date().toISOString(), userId }),
    });
    assert(exitReviewRecordRes.status === 201, "record review event for last note (exit-review simulation) should return 201");

    const exitReviewCount = await countReviewEventsForNoteOnDate(exitReviewNoteId, reviewDay, userId);
    assert(exitReviewCount === 1, "last note should have one review event in exit-review simulation");
    pass("last note review event is recorded in exit-review simulation");

    const todayRes2 = await fetch(
      `${baseUrl}/api/review/today?userId=${encodeURIComponent(userId)}&batchSize=3`,
    );
    assert(todayRes2.status === 200, "second review today should return 200");
    const today2 = await parseJson<ReviewTodayResponse>(todayRes2);
    assert(today2.data, "second review today should return data");
    createdBatchIds.add(today2.data.batchId);

    const secondBatchIds = today2.data.notes.map((item) => item.note.id);
    assert(today1.data.batchId === today2.data.batchId, "same-day batch id should be stable");
    assert(
      JSON.stringify(firstBatchIds) === JSON.stringify(secondBatchIds),
      "recording review events should not reshuffle today's batch",
    );
    pass("review batch remains stable after recording review events");

    const reviewedFromToday = new Set(today2.data.reviewedNoteIds ?? []);
    assert(
      reviewedFromToday.has(firstNoteId),
      "today batch response should include first note in reviewedNoteIds after recording",
    );
    assert(
      reviewedFromToday.has(exitReviewNoteId),
      "today batch response should include exit-review note in reviewedNoteIds after recording",
    );
    pass("today batch response includes reviewed note ids");

    const prevOnlyCountAfter = await countReviewEventsForNoteOnDate(prevOnlyNoteId, reviewDay, userId);
    assert(prevOnlyCountAfter === 0, "prev-only note should remain at 0 events");
    pass("prev-only note still has no review event");

    pass("API smoke test completed");
  } finally {
    for (const batchId of createdBatchIds) {
      await hardDeleteReviewDataByBatchId(batchId);
    }
    for (const noteId of createdNoteIds) {
      await hardDeleteNote(noteId, userId);
    }
    for (const tagId of createdTagIds) {
      await hardDeleteTag(tagId, userId);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
