import { randomUUID } from "node:crypto";
import { hardDeleteReviewDataByBatchId } from "@/lib/repositories/reviewRepo";
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
  notes: Array<{ position: number; note: { id: string } }>;
};

type TagResponse = {
  id: string;
  name: string;
};

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

    const listTagsRes = await fetch(`${baseUrl}/api/tags?userId=${encodeURIComponent(userId)}`);
    assert(listTagsRes.status === 200, "list tags should return 200");
    const listTagsPayload = await parseJson<TagResponse[]>(listTagsRes);
    assert(
      listTagsPayload.data?.some((tag) => tag.id === existingTagId),
      "list tags should include created tag",
    );
    pass("listed tags includes created tag");

    const attachExistingTagRes = await fetch(`${baseUrl}/api/notes/${noteId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagId: existingTagId, userId }),
    });
    assert(attachExistingTagRes.status === 201, "attach existing tag should return 201");
    pass("attached existing tag to note via API");

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

    const markRes = await fetch(`${baseUrl}/api/review/mark-reviewed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: firstBatchIds[0], userId }),
    });
    assert(markRes.status === 201, "mark-reviewed should return 201");
    pass("marked note reviewed via API");

    const invalidMarkReviewedPayloadRes = await fetch(`${baseUrl}/api/review/mark-reviewed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: firstBatchIds[0], reviewedAt: 123, userId }),
    });
    assert(
      invalidMarkReviewedPayloadRes.status === 400,
      "invalid mark-reviewed payload should return 400",
    );
    pass("invalid mark-reviewed payload is rejected with 4xx");

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
      "mark-reviewed should not reshuffle today's batch",
    );
    pass("review batch remains stable after mark-reviewed");

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
