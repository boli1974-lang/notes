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

async function attachTagByName(
  baseUrl: string,
  noteId: string,
  tagName: string,
  userId: string,
): Promise<TagResponse> {
  const res = await fetch(`${baseUrl}/api/notes/${noteId}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagName, userId }),
  });
  const payload = await parseJson<{ tag: TagResponse }>(res);
  assert(res.status === 201, "attach tag by name should return 201");
  assert(payload.data?.tag.id, "attach tag by name should return tag");
  return payload.data.tag;
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

    const createComposerRes = await fetch(`${baseUrl}/api/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${marker}-composer`, content: `composer-${marker}`, userId }),
    });
    assert(createComposerRes.status === 201, "create composer note should return 201");
    const createComposerPayload = await parseJson<NoteResponse>(createComposerRes);
    assert(createComposerPayload.data?.id, "create composer note should return note data");
    const composerNoteId = createComposerPayload.data.id;
    createdNoteIds.push(composerNoteId);

    const createExistingSemicolonTagRes = await fetch(`${baseUrl}/api/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${tagMarker}-existing-semicolon`, userId }),
    });
    assert(createExistingSemicolonTagRes.status === 201, "create existing semicolon tag should return 201");
    const createExistingSemicolonTagPayload = await parseJson<TagResponse>(createExistingSemicolonTagRes);
    assert(createExistingSemicolonTagPayload.data?.id, "create existing semicolon tag should return tag data");
    const existingSemicolonTag = createExistingSemicolonTagPayload.data;
    createdTagIds.push(existingSemicolonTag.id);

    // Milestone 4: simulate semicolon multi-tag input in one continuous create flow.
    // UI parses semicolon input then sends attach requests for each token.
    const semicolonTagInput = `${existingSemicolonTag.name}; ${tagMarker}-s1; ${tagMarker}-s2; ${existingSemicolonTag.name}; ${tagMarker}-s1`;
    const parsedSemicolonNames = Array.from(
      new Set(
        semicolonTagInput
          .split(";")
          .map((part) => part.trim().toLowerCase())
          .filter((part) => part.length > 0),
      ),
    );
    const semicolonAttachedTags = await Promise.all(
      parsedSemicolonNames.map((tagName) => attachTagByName(baseUrl, composerNoteId, tagName, userId)),
    );
    for (const tag of semicolonAttachedTags) {
      if (!createdTagIds.includes(tag.id)) {
        createdTagIds.push(tag.id);
      }
    }

    const listComposerTagsRes = await fetch(
      `${baseUrl}/api/notes/${composerNoteId}/tags?userId=${encodeURIComponent(userId)}`,
    );
    assert(listComposerTagsRes.status === 200, "list composer note tags should return 200");
    const listComposerTagsPayload = await parseJson<TagResponse[]>(listComposerTagsRes);
    assert(
      listComposerTagsPayload.data?.length === parsedSemicolonNames.length,
      "semicolon duplicate entries should not create duplicate attachments",
    );
    for (const tagName of parsedSemicolonNames) {
      assert(
        listComposerTagsPayload.data?.some((tag) => tag.name === tagName),
        "composer note should include each semicolon-parsed tag",
      );
    }
    assert(
      listComposerTagsPayload.data?.some((tag) => tag.id === existingSemicolonTag.id),
      "semicolon flow should reuse pre-existing tag when included",
    );

    const listTagsAfterSemicolonRes = await fetch(
      `${baseUrl}/api/tags?userId=${encodeURIComponent(userId)}`,
    );
    assert(listTagsAfterSemicolonRes.status === 200, "list tags after semicolon flow should return 200");
    const listTagsAfterSemicolonPayload = await parseJson<TagResponse[]>(listTagsAfterSemicolonRes);
    const existingSemicolonTagCount =
      listTagsAfterSemicolonPayload.data?.filter((tag) => tag.name === existingSemicolonTag.name).length ?? 0;
    assert(existingSemicolonTagCount === 1, "semicolon flow should not create duplicate existing tag records");
    pass("create note + mixed existing/new semicolon flow is supported with dedupe");

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

    // Milestone 5: image attachments API (single-file-per-request; GET list returns signed URLs).
    const listImagesEmptyRes = await fetch(
      `${baseUrl}/api/notes/${noteId}/images?userId=${encodeURIComponent(userId)}`,
    );
    assert(listImagesEmptyRes.status === 200, "list images (empty) should return 200");
    const listImagesEmptyPayload = await parseJson<Array<{ id: string; url?: string }>>(listImagesEmptyRes);
    assert(Array.isArray(listImagesEmptyPayload.data), "list images should return data array");
    assert(listImagesEmptyPayload.data.length === 0, "new note should have no images");
    pass("GET note images returns empty array when no images");

    const minimalJpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
      0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
      0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
      0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xd9,
    ]);
    const imageFormData = new FormData();
    imageFormData.append("file", new Blob([minimalJpeg], { type: "image/jpeg" }), "smoke.jpg");
    imageFormData.append("userId", userId);
    const uploadImageRes = await fetch(`${baseUrl}/api/notes/${noteId}/images`, {
      method: "POST",
      body: imageFormData,
    });
    if (uploadImageRes.status === 201) {
      const uploadImagePayload = await parseJson<{ id: string; noteId: string }>(uploadImageRes);
      assert(uploadImagePayload.data?.id, "upload image should return created image");
      const imageId = uploadImagePayload.data.id;
      pass("uploaded image to note via API (single-file POST)");

      const listImagesRes = await fetch(
        `${baseUrl}/api/notes/${noteId}/images?userId=${encodeURIComponent(userId)}`,
      );
      assert(listImagesRes.status === 200, "list images after upload should return 200");
      const listImagesPayload = await parseJson<Array<{ id: string; url: string }>>(listImagesRes);
      assert(listImagesPayload.data?.length === 1, "list images should return one image");
      assert(typeof listImagesPayload.data[0].url === "string" && listImagesPayload.data[0].url.length > 0, "image should have signed url");
      pass("GET note images returns signed URLs");

      const deleteImageRes = await fetch(
        `${baseUrl}/api/notes/${noteId}/images/${imageId}?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      assert(deleteImageRes.status === 200, "delete image should return 200");
      pass("deleted image via API");

      const listImagesAfterDeleteRes = await fetch(
        `${baseUrl}/api/notes/${noteId}/images?userId=${encodeURIComponent(userId)}`,
      );
      assert(listImagesAfterDeleteRes.status === 200, "list images after delete should return 200");
      const listImagesAfterDeletePayload = await parseJson<unknown[]>(listImagesAfterDeleteRes);
      assert(listImagesAfterDeletePayload.data?.length === 0, "list images after delete should be empty");
      pass("list images after delete is empty or reduced");
    } else {
      const errPayload = await parseJson<{ error?: string }>(uploadImageRes);
      if (uploadImageRes.status === 500 && errPayload.error?.toLowerCase().includes("supabase")) {
        console.warn(
          "SKIP (partial verification): image upload not run — Supabase not configured. GET list empty and path exist; upload/delete/signed-URL assertions were skipped.",
        );
      } else {
        fail(`upload image failed: ${uploadImageRes.status} ${JSON.stringify(errPayload)}`);
      }
    }

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

    // Milestone 4: review edit-mode equivalent API checks.
    const reviewEditPatchRes = await fetch(`${baseUrl}/api/notes/${prevOnlyNoteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${marker}-review-edited`,
        content: `review-edited-${marker}`,
        userId,
      }),
    });
    assert(reviewEditPatchRes.status === 200, "review-edit equivalent PATCH should return 200");

    const reviewEditSemicolonInput = `${tagMarker}-re1; ${tagMarker}-re2`;
    const reviewEditTagNames = reviewEditSemicolonInput
      .split(";")
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part.length > 0);
    const reviewEditAttachedTags = await Promise.all(
      reviewEditTagNames.map((tagName) => attachTagByName(baseUrl, prevOnlyNoteId, tagName, userId)),
    );
    for (const tag of reviewEditAttachedTags) {
      createdTagIds.push(tag.id);
    }

    const reviewDetachRes = await fetch(
      `${baseUrl}/api/notes/${prevOnlyNoteId}/tags/${reviewEditAttachedTags[0].id}?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    assert(reviewDetachRes.status === 200, "review-edit equivalent detach should return 200");

    const reviewEditTagsRes = await fetch(
      `${baseUrl}/api/notes/${prevOnlyNoteId}/tags?userId=${encodeURIComponent(userId)}`,
    );
    assert(reviewEditTagsRes.status === 200, "list review-edit tags should return 200");
    const reviewEditTagsPayload = await parseJson<TagResponse[]>(reviewEditTagsRes);
    assert(
      !reviewEditTagsPayload.data?.some((tag) => tag.id === reviewEditAttachedTags[0].id),
      "detached review-edit tag should be removed",
    );
    assert(
      reviewEditTagsPayload.data?.some((tag) => tag.id === reviewEditAttachedTags[1].id),
      "remaining review-edit tag should stay attached",
    );

    const prevOnlyCountAfterEditOps = await countReviewEventsForNoteOnDate(prevOnlyNoteId, reviewDay, userId);
    assert(
      prevOnlyCountAfterEditOps === 0,
      "editing title/content/tags in review equivalent flow should not auto-record review event",
    );
    pass("review-edit equivalent tag attach/detach works and does not auto-record review");

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
