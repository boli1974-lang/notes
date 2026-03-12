"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageViewer } from "@/components/ImageViewer";
import { LanguageToggle } from "@/components/LanguageToggle";
import { EDIT_ERROR } from "@/lib/constants/editErrorCodes";
import { Locale, getInitialLocale, getMessages, persistLocale } from "@/lib/i18n";
import {
  computeTagDiff,
  getActiveTagToken,
  isTagNameTooLong,
  mergeTagNames,
  parseNormalizedTagNames,
  removeActiveTagToken,
} from "@/lib/utils/tagDraft";

type ReviewNote = {
  id: string;
  title: string | null;
  content: string;
};

type ReviewBatchItem = {
  position: number;
  note: ReviewNote;
};

type ReviewBatch = {
  batchId: string;
  reviewDate: string;
  notes: ReviewBatchItem[];
  reviewedNoteIds?: string[];
};

type Tag = {
  id: string;
  name: string;
};

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

type NoteImageItem = {
  id: string;
  url: string;
  fileName?: string;
};

async function readJson<T>(response: Response): Promise<ApiResponse<T>> {
  return (await response.json()) as ApiResponse<T>;
}

const MIN_REVIEW_DWELL_MS = 3000;
const MAX_IMAGES_PER_NOTE = 5;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

type DraftImage = { file: File; previewUrl: string };

function revokeDraftPreviews(items: DraftImage[]): void {
  items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
}

type ReviewPersistResult = "saved" | "skipped" | "failed";

export default function ReviewPage() {
  const [locale, setLocale] = useState<Locale>("en");
  const localeRef = useRef<Locale>("en");
  const t = getMessages(locale).review;
  const [batch, setBatch] = useState<ReviewBatch | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [navigationAction, setNavigationAction] = useState<"next" | null>(null);
  const reviewedNoteIdsRef = useRef<Set<string>>(new Set());
  const currentNoteIdRef = useRef<string | null>(null);
  const noteEnteredAtRef = useRef<number>(Date.now());
  const reviewRequestInFlightRef = useRef<Promise<ReviewPersistResult> | null>(null);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [currentTags, setCurrentTags] = useState<Tag[]>([]);
  const [editTagNames, setEditTagNames] = useState<string[]>([]);
  const [tagSummary, setTagSummary] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [currentImages, setCurrentImages] = useState<NoteImageItem[]>([]);
  const [editDraftFiles, setEditDraftFiles] = useState<DraftImage[]>([]);
  const [editPendingDeleteIds, setEditPendingDeleteIds] = useState<string[]>([]);
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);

  const currentItem = useMemo(() => batch?.notes[index] ?? null, [batch, index]);
  const total = batch?.notes.length ?? 0;
  const tagInputToken = useMemo(() => getActiveTagToken(tagInput), [tagInput]);
  const isTagInputTooLong = useMemo(() => isTagNameTooLong(tagInputToken), [tagInputToken]);
  const tagSuggestions = useMemo(() => {
    if (!tagInputToken || isTagInputTooLong) {
      return [];
    }
    const attachedTagNames = new Set(editTagNames);
    return tagSummary
      .filter((tag) => tag.name.startsWith(tagInputToken) && !attachedTagNames.has(tag.name))
      .slice(0, 6);
  }, [editTagNames, isTagInputTooLong, tagInputToken, tagSummary]);

  useEffect(() => {
    const initialLocale = getInitialLocale();
    setLocale(initialLocale);
    localeRef.current = initialLocale;
  }, []);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    const noteId = currentItem?.note.id ?? null;
    if (currentNoteIdRef.current !== noteId) {
      currentNoteIdRef.current = noteId;
      noteEnteredAtRef.current = Date.now();
    }
  }, [currentItem]);

  const editDraftRef = useRef(editDraftFiles);
  editDraftRef.current = editDraftFiles;
  useEffect(() => {
    return () => revokeDraftPreviews(editDraftRef.current);
  }, []);

  function updateLocale(nextLocale: Locale): void {
    setLocale(nextLocale);
    persistLocale(nextLocale);
  }

  function hasMetMinReviewDwell(): boolean {
    return Date.now() - noteEnteredAtRef.current >= MIN_REVIEW_DWELL_MS;
  }

  async function persistReviewForCurrentNote(
    options: { silent?: boolean } = {},
  ): Promise<ReviewPersistResult> {
    const noteId = currentNoteIdRef.current;
    if (!noteId) {
      return "skipped";
    }
    if (!hasMetMinReviewDwell()) {
      return "skipped";
    }
    if (reviewedNoteIdsRef.current.has(noteId)) {
      return "saved";
    }
    if (reviewRequestInFlightRef.current) {
      return reviewRequestInFlightRef.current;
    }

    const requestPromise = (async (): Promise<ReviewPersistResult> => {
      try {
        const res = await fetch("/api/review/mark-reviewed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId }),
        });
        const payload = await readJson<{ id: string }>(res);
        if (!res.ok || !payload.data) {
          if (!options.silent) {
            setError(payload.error ?? getMessages(localeRef.current).review.errorMarkReviewed);
          }
          return "failed";
        }

        reviewedNoteIdsRef.current.add(noteId);
        return "saved";
      } catch {
        if (!options.silent) {
          setError(getMessages(localeRef.current).review.errorMarkReviewed);
        }
        return "failed";
      } finally {
        reviewRequestInFlightRef.current = null;
      }
    })();

    reviewRequestInFlightRef.current = requestPromise;
    return requestPromise;
  }

  const sendBeaconForCurrentNote = useCallback((): void => {
    const noteId = currentNoteIdRef.current;
    if (!noteId || !hasMetMinReviewDwell() || reviewedNoteIdsRef.current.has(noteId)) {
      return;
    }
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
      return;
    }

    const body = JSON.stringify({ noteId });
    const beaconOk = navigator.sendBeacon(
      "/api/review/mark-reviewed",
      new Blob([body], { type: "application/json" }),
    );
    if (beaconOk) {
      reviewedNoteIdsRef.current.add(noteId);
    }
  }, []);

  const loadBatch = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/review/today?batchSize=10");
      const payload = await readJson<ReviewBatch>(res);
      if (!res.ok || !payload.data) {
        setError(payload.error ?? getMessages(localeRef.current).review.errorLoadBatch);
        setBatch(null);
        return;
      }
      setBatch(payload.data);
      setIndex(0);
      reviewedNoteIdsRef.current = new Set<string>(payload.data.reviewedNoteIds ?? []);
      setEditing(false);
    } catch {
      setError(getMessages(localeRef.current).review.errorLoadBatch);
      setBatch(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTagSummary = useCallback(async (): Promise<void> => {
    const res = await fetch("/api/tags");
    const payload = await readJson<Tag[]>(res);
    if (!res.ok || !payload.data) {
      return;
    }
    setTagSummary(payload.data);
  }, []);

  const loadTagsForCurrentNote = useCallback(async (): Promise<void> => {
    const noteId = currentItem?.note.id;
    if (!noteId) {
      setCurrentTags([]);
      return;
    }

    const res = await fetch(`/api/notes/${noteId}/tags`);
    const payload = await readJson<Tag[]>(res);
    if (!res.ok || !payload.data) {
      setCurrentTags([]);
      return;
    }
    setCurrentTags(payload.data);
  }, [currentItem?.note.id]);

  const loadImagesForCurrentNote = useCallback(async (): Promise<void> => {
    const noteId = currentItem?.note.id;
    if (!noteId) {
      setCurrentImages([]);
      return;
    }
    const res = await fetch(`/api/notes/${noteId}/images`);
    const payload = await readJson<NoteImageItem[]>(res);
    if (!res.ok || !payload.data) {
      setCurrentImages([]);
      return;
    }
    setCurrentImages(payload.data ?? []);
  }, [currentItem?.note.id]);

  useEffect(() => {
    void loadBatch();
  }, [loadBatch]);

  // When the current review note changes: clear note-scoped image and edit state so we never
  // show or carry over data from the previous note; then load tags and images for the new note.
  useEffect(() => {
    setCurrentImages([]);
    revokeDraftPreviews(editDraftRef.current);
    setEditDraftFiles([]);
    setEditPendingDeleteIds([]);
    setEditing(false);
    setTagInput("");
    void loadTagsForCurrentNote();
    void loadImagesForCurrentNote();
    void loadTagSummary();
  }, [loadTagSummary, loadTagsForCurrentNote, loadImagesForCurrentNote]);

  useEffect(() => {
    const handlePageHide = (): void => {
      sendBeaconForCurrentNote();
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      sendBeaconForCurrentNote();
    };
  }, [sendBeaconForCurrentNote]);

  function beginEdit(): void {
    if (!currentItem) {
      return;
    }
    setEditTitle(currentItem.note.title ?? "");
    setEditContent(currentItem.note.content);
    setEditTagNames(currentTags.map((tag) => tag.name));
    setTagInput("");
    setEditDraftFiles([]);
    setEditPendingDeleteIds([]);
    setEditing(true);
  }

  function addDraftTagNames(rawTagInput: string): void {
    const parsedInput = parseNormalizedTagNames(rawTagInput);
    if (parsedInput.tagNames.length === 0 && !parsedInput.hasTooLongTag) {
      return;
    }
    if (parsedInput.hasTooLongTag) {
      setError(t.errorTagTooLong);
      return;
    }
    setError(null);
    setEditTagNames((prev) => mergeTagNames(prev, parsedInput.tagNames));
    setTagInput("");
  }

  function removeDraftTagName(tagName: string): void {
    setError(null);
    setEditTagNames((prev) => prev.filter((existingTagName) => existingTagName !== tagName));
  }

  function applySuggestionTag(tagName: string): void {
    setError(null);
    setEditTagNames((prev) => mergeTagNames(prev, [tagName]));
    setTagInput(removeActiveTagToken(tagInput));
  }

  function resetReviewEditState(): void {
    revokeDraftPreviews(editDraftFiles);
    setEditing(false);
    setEditTagNames([]);
    setTagInput("");
    setEditDraftFiles([]);
    setEditPendingDeleteIds([]);
  }

  async function attachTagNames(noteId: string, tagNames: string[]): Promise<Tag[]> {
    if (tagNames.length === 0) {
      return [];
    }

    const attachResults = await Promise.all(
      tagNames.map(async (tagName) => {
        const res = await fetch(`/api/notes/${noteId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagName }),
        });
        const payload = await readJson<{ tag: Tag }>(res);
        if (!res.ok || !payload.data) {
          throw new Error(EDIT_ERROR.ATTACH_TAG);
        }
        return payload.data.tag;
      }),
    );

    return attachResults;
  }

  async function saveEdit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!currentItem) {
      return;
    }
    const parsedInput = parseNormalizedTagNames(tagInput);
    if (parsedInput.hasTooLongTag) {
      setError(t.errorTagTooLong);
      return;
    }
    const draftTagNames = mergeTagNames(editTagNames, parsedInput.tagNames);
    const { tagsToDetach, tagNamesToAttach } = computeTagDiff(currentTags, draftTagNames);

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${currentItem.note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle || null,
          content: editContent,
        }),
      });
      const payload = await readJson<ReviewNote>(res);
      if (!res.ok || !payload.data) {
        setError(payload.error ?? t.errorUpdateNote);
        return;
      }

      setBatch((prev) => {
        if (!prev) return prev;
        const nextItems = [...prev.notes];
        nextItems[index] = { ...nextItems[index], note: payload.data as ReviewNote };
        return { ...prev, notes: nextItems };
      });

      if (tagsToDetach.length > 0) {
        await Promise.all(
          tagsToDetach.map(async (tag) => {
            const delRes = await fetch(`/api/notes/${currentItem.note.id}/tags/${tag.id}`, {
              method: "DELETE",
            });
            const detachPayload = await readJson<{ detached: boolean }>(delRes);
            if (!delRes.ok) {
              throw new Error(EDIT_ERROR.DETACH_TAG);
            }
          }),
        );
      }

      if (tagNamesToAttach.length > 0) {
        await attachTagNames(currentItem.note.id, tagNamesToAttach);
      }
      let imageOpFailed = false;
      for (const draft of editDraftFiles) {
        const { file } = draft;
        if (!ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE_BYTES) continue;
        const form = new FormData();
        form.append("file", file);
        const imgRes = await fetch(`/api/notes/${currentItem.note.id}/images`, { method: "POST", body: form });
        if (!imgRes.ok) {
          imageOpFailed = true;
          setError(t.errorImageUpload);
        }
      }
      for (const imageId of editPendingDeleteIds) {
        const delRes = await fetch(`/api/notes/${currentItem.note.id}/images/${imageId}`, { method: "DELETE" });
        if (!delRes.ok) {
          imageOpFailed = true;
          setError(t.errorImageUpload);
        }
      }

      setTagInput("");
      setEditTagNames([]);
      setEditDraftFiles([]);
      setEditPendingDeleteIds([]);
      await Promise.all([loadTagsForCurrentNote(), loadImagesForCurrentNote(), loadTagSummary()]);
      if (imageOpFailed) {
        setError(t.errorImageUpload);
      }
      setEditing(false);
    } catch (saveError) {
      if (saveError instanceof Error && saveError.message === EDIT_ERROR.DETACH_TAG) {
        setError(t.errorDetachTag);
      } else if (saveError instanceof Error && saveError.message === EDIT_ERROR.ATTACH_TAG) {
        setError(t.errorAttachTag);
      } else {
        setError(t.errorUpdateNote);
      }
      await Promise.all([loadTagsForCurrentNote(), loadImagesForCurrentNote(), loadTagSummary()]);
    } finally {
      setBusy(false);
    }
  }

  async function deleteCurrentNote(): Promise<void> {
    if (!currentItem) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${currentItem.note.id}`, { method: "DELETE" });
      const payload = await readJson<{ deleted: boolean }>(res);
      if (!res.ok) {
        setError(payload.error ?? t.errorDeleteNote);
        return;
      }

      setBatch((prev) => {
        if (!prev) {
          return prev;
        }
        const nextItems = prev.notes.filter((item) => item.note.id !== currentItem.note.id);
        const nextIndex = Math.max(0, Math.min(index, nextItems.length - 1));
        setIndex(nextIndex);
        return { ...prev, notes: nextItems };
      });
      resetReviewEditState();
    } catch {
      setError(t.errorDeleteNote);
    } finally {
      setBusy(false);
    }
  }

  async function goNextAndRecordReview(): Promise<void> {
    if (!currentItem) {
      return;
    }
    if (index >= total - 1) {
      return;
    }

    setBusy(true);
    setNavigationAction("next");
    setError(null);
    try {
      const result = await persistReviewForCurrentNote();
      if (result === "failed") {
        return;
      }
      setIndex((prev) => Math.min(total - 1, prev + 1));
    } finally {
      setBusy(false);
      setNavigationAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <ImageViewer
        src={viewerImageUrl}
        open={!!viewerImageUrl}
        onClose={() => setViewerImageUrl(null)}
        closeLabel={t.closeViewer}
      />
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-800">{t.title}</h1>
          <LanguageToggle locale={locale} onChange={updateLocale} />
        </div>
        <p className="text-sm text-slate-600">
          {t.subtitle}
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            void loadBatch();
          }}
          disabled={busy || loading}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t.refreshBatch}
        </button>
        <span className="text-sm text-slate-600">
          {t.progress}: {total === 0 ? "0/0" : `${Math.min(index + 1, total)}/${total}`}
        </span>
      </div>

      {loading ? (
        <div className="text-sm text-slate-600">{t.loadingBatch}</div>
      ) : !currentItem ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          {t.noNotesForToday}
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {editing ? (
            <form
              onSubmit={(event) => {
                void saveEdit(event);
              }}
              className="space-y-3"
            >
              <input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                placeholder={t.titlePlaceholder}
                maxLength={120}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-300 focus:ring"
              />
              <textarea
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                rows={6}
                maxLength={20000}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-300 focus:ring"
              />
              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-700">{t.addTag}</p>
                  <p className="text-[11px] text-slate-500">{t.tagMultiInputHint}</p>
                  <p className="text-[11px] text-slate-500">{t.tagLengthHint}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {editTagNames.map((tagName) => (
                    <span
                      key={tagName}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                    >
                      #{tagName}
                      <button
                        type="button"
                        onClick={() => removeDraftTagName(tagName)}
                        disabled={busy}
                        className="text-slate-500 hover:text-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
                        aria-label={`${t.removeTagAriaPrefix} ${tagName}`}
                      >
                        x
                      </button>
                    </span>
                  ))}
                  {editTagNames.length === 0 ? (
                    <span className="text-xs text-slate-500">{t.noTags}</span>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    placeholder={t.addTagPlaceholder}
                    disabled={busy}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs outline-none ring-slate-300 focus:ring disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => addDraftTagNames(tagInput)}
                    disabled={busy || isTagInputTooLong}
                    className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                  >
                    {t.addTag}
                  </button>
                </div>
                {isTagInputTooLong ? (
                  <p className="text-[11px] text-red-600">{t.errorTagTooLong}</p>
                ) : null}

                {tagSuggestions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {tagSuggestions.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => applySuggestionTag(tag.name)}
                        disabled={busy}
                        className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        #{tag.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-700">{t.imagesLabel}</p>
                {currentImages
                  .filter((img) => !editPendingDeleteIds.includes(img.id))
                  .map((img) => (
                    <div key={img.id} className="relative inline-block">
                      <button
                        type="button"
                        onClick={() => setViewerImageUrl(img.url)}
                        className="inline-block cursor-pointer rounded border-0 bg-transparent p-0 focus:outline-none focus:ring-2 focus:ring-slate-400"
                      >
                        <img
                          src={img.url}
                          alt={t.attachedImageAlt}
                          className="h-16 w-16 rounded border border-slate-200 object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditPendingDeleteIds((prev) => [...prev, img.id]);
                        }}
                        disabled={busy}
                        className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white disabled:opacity-60"
                        aria-label={t.removeImage}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                {editDraftFiles.map((draft, i) => (
                  <div key={`draft-${i}`} className="relative inline-block">
                    <button
                      type="button"
                      onClick={() => setViewerImageUrl(draft.previewUrl)}
                      className="inline-block cursor-pointer rounded border-0 bg-transparent p-0 focus:outline-none focus:ring-2 focus:ring-slate-400"
                    >
                      <img
                        src={draft.previewUrl}
                        alt={t.attachedImageAlt}
                        className="h-16 w-16 rounded border border-slate-200 object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        URL.revokeObjectURL(draft.previewUrl);
                        setEditDraftFiles((prev) => prev.filter((_, j) => j !== i));
                      }}
                      disabled={busy}
                      className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white disabled:opacity-60"
                      aria-label={t.removeImage}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {currentImages.filter((img) => !editPendingDeleteIds.includes(img.id)).length + editDraftFiles.length < MAX_IMAGES_PER_NOTE ? (
                  <input
                    type="file"
                    accept={ALLOWED_IMAGE_TYPES.join(",")}
                    disabled={busy}
                    className="block text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-slate-700 disabled:opacity-60"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      const valid = files.filter(
                        (f) => ALLOWED_IMAGE_TYPES.includes(f.type) && f.size <= MAX_IMAGE_SIZE_BYTES,
                      );
                      const visible = currentImages.filter((img) => !editPendingDeleteIds.includes(img.id)).length;
                      setEditDraftFiles((prev) =>
                        prev.concat(
                          valid.slice(0, Math.max(0, MAX_IMAGES_PER_NOTE - visible - prev.length)).map((file) => ({
                            file,
                            previewUrl: URL.createObjectURL(file),
                          })),
                        ),
                      );
                      e.target.value = "";
                    }}
                  />
                ) : (
                  <p className="text-[11px] text-amber-600">{t.imageLimitReached}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-60"
                >
                  {busy ? t.saving : t.save}
                </button>
                <button
                  type="button"
                  onClick={resetReviewEditState}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {t.cancel}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-800">
                  {currentItem.note.title?.trim() ? currentItem.note.title : t.untitled}
                </h2>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{currentItem.note.content}</p>
                {currentImages.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {currentImages.map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => setViewerImageUrl(img.url)}
                        className="inline-block cursor-pointer rounded border-0 bg-transparent p-0 focus:outline-none focus:ring-2 focus:ring-slate-400"
                      >
                        <img
                          src={img.url}
                          alt={t.attachedImageAlt}
                          className="h-12 w-12 rounded border border-slate-200 object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {currentTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                  >
                    #{tag.name}
                  </span>
                ))}
                {currentTags.length === 0 ? (
                  <span className="text-xs text-slate-500">{t.noTags}</span>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={beginEdit}
                  disabled={busy}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {t.edit}
                </button>
                <button
                  onClick={() => {
                    void deleteCurrentNote();
                  }}
                  disabled={busy}
                  className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  {t.softDelete}
                </button>
              </div>
            </>
          )}

          <div className="flex justify-between gap-2 border-t border-slate-200 pt-3">
            <button
              onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
              disabled={index <= 0 || busy}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {t.prev}
            </button>
            <button
              onClick={() => {
                void goNextAndRecordReview();
              }}
              disabled={index >= total - 1 || busy}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {navigationAction === "next" ? t.savingReview : t.next}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
