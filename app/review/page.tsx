"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Locale, getInitialLocale, getMessages, persistLocale } from "@/lib/i18n";

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

async function readJson<T>(response: Response): Promise<ApiResponse<T>> {
  return (await response.json()) as ApiResponse<T>;
}

const MIN_REVIEW_DWELL_MS = 3000;
const TAG_NAME_MAX_LENGTH = 30;

type ReviewPersistResult = "saved" | "skipped" | "failed";

function normalizeTagName(value: string): string {
  return value.trim().toLowerCase();
}

function isTagNameTooLong(normalizedTagName: string): boolean {
  return normalizedTagName.length > TAG_NAME_MAX_LENGTH;
}

function getActiveTagToken(rawInput: string): string {
  const segments = rawInput.split(";");
  return normalizeTagName(segments[segments.length - 1] ?? "");
}

function parseNormalizedTagNames(rawInput: string): { tagNames: string[]; hasTooLongTag: boolean } {
  const deduped = new Set<string>();
  let hasTooLongTag = false;

  for (const segment of rawInput.split(";")) {
    const normalized = normalizeTagName(segment);
    if (!normalized) {
      continue;
    }
    if (isTagNameTooLong(normalized)) {
      hasTooLongTag = true;
      continue;
    }
    deduped.add(normalized);
  }

  return { tagNames: Array.from(deduped), hasTooLongTag };
}

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
  const [tagSummary, setTagSummary] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagBusy, setTagBusy] = useState(false);

  const currentItem = useMemo(() => batch?.notes[index] ?? null, [batch, index]);
  const total = batch?.notes.length ?? 0;
  const tagInputToken = useMemo(() => getActiveTagToken(tagInput), [tagInput]);
  const isTagInputTooLong = useMemo(() => isTagNameTooLong(tagInputToken), [tagInputToken]);
  const tagSuggestions = useMemo(() => {
    if (!tagInputToken || isTagInputTooLong) {
      return [];
    }
    const attachedTagIds = new Set(currentTags.map((tag) => tag.id));
    return tagSummary
      .filter((tag) => tag.name.startsWith(tagInputToken) && !attachedTagIds.has(tag.id))
      .slice(0, 6);
  }, [currentTags, isTagInputTooLong, tagInputToken, tagSummary]);

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

  useEffect(() => {
    void loadBatch();
  }, [loadBatch]);

  useEffect(() => {
    setTagInput("");
    void loadTagsForCurrentNote();
    void loadTagSummary();
  }, [loadTagSummary, loadTagsForCurrentNote]);

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
    setEditing(true);
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
          throw new Error(payload.error ?? t.errorAttachTag);
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
        if (!prev) {
          return prev;
        }
        const nextItems = [...prev.notes];
        nextItems[index] = { ...nextItems[index], note: payload.data as ReviewNote };
        return { ...prev, notes: nextItems };
      });

      if (parsedInput.tagNames.length > 0) {
        const attachedTags = await attachTagNames(currentItem.note.id, parsedInput.tagNames);
        setCurrentTags((prev) => {
          const prevIds = new Set(prev.map((tag) => tag.id));
          const nextAdded = attachedTags.filter((tag) => !prevIds.has(tag.id));
          if (nextAdded.length === 0) {
            return prev;
          }
          return [...nextAdded, ...prev];
        });
        setTagInput("");
        void loadTagSummary();
      }

      setEditing(false);
    } catch (saveError) {
      if (saveError instanceof Error && saveError.message === t.errorAttachTag) {
        setError(t.errorAttachTag);
      } else {
        setError(t.errorUpdateNote);
      }
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
      setEditing(false);
    } catch {
      setError(t.errorDeleteNote);
    } finally {
      setBusy(false);
    }
  }

  async function attachTagsFromInput(): Promise<void> {
    if (!currentItem) {
      return;
    }

    const parsedInput = parseNormalizedTagNames(tagInput);
    if (parsedInput.tagNames.length === 0 && !parsedInput.hasTooLongTag) {
      return;
    }
    if (parsedInput.hasTooLongTag) {
      setError(t.errorTagTooLong);
      return;
    }

    setTagBusy(true);
    setError(null);
    try {
      const attachResults = await attachTagNames(currentItem.note.id, parsedInput.tagNames);

      setTagInput("");
      setCurrentTags((prev) => {
        const prevIds = new Set(prev.map((tag) => tag.id));
        const nextAdded = attachResults.filter((tag) => !prevIds.has(tag.id));
        if (nextAdded.length === 0) {
          return prev;
        }
        return [...nextAdded, ...prev];
      });
      void loadTagSummary();
    } catch {
      setError(t.errorAttachTag);
    } finally {
      setTagBusy(false);
    }
  }

  async function attachExistingTag(tag: Tag): Promise<void> {
    if (!currentItem) {
      return;
    }

    setTagBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${currentItem.note.id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: tag.id }),
      });
      const payload = await readJson<{ tag: Tag }>(res);
      if (!res.ok || !payload.data) {
        setError(payload.error ?? t.errorAttachTag);
        return;
      }

      setTagInput("");
      setCurrentTags((prev) => {
        if (prev.some((existing) => existing.id === payload.data!.tag.id)) {
          return prev;
        }
        return [payload.data!.tag, ...prev];
      });
      void loadTagSummary();
    } catch {
      setError(t.errorAttachTag);
    } finally {
      setTagBusy(false);
    }
  }

  async function detachTag(tagId: string): Promise<void> {
    if (!currentItem) {
      return;
    }

    setTagBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${currentItem.note.id}/tags/${tagId}`, {
        method: "DELETE",
      });
      const payload = await readJson<{ detached: boolean }>(res);
      if (!res.ok) {
        setError(payload.error ?? t.errorDetachTag);
        return;
      }

      setCurrentTags((prev) => prev.filter((tag) => tag.id !== tagId));
      void loadTagSummary();
    } catch {
      setError(t.errorDetachTag);
    } finally {
      setTagBusy(false);
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
                  {currentTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                    >
                      #{tag.name}
                      <button
                        type="button"
                        onClick={() => {
                          void detachTag(tag.id);
                        }}
                        disabled={busy || tagBusy}
                        className="text-slate-500 hover:text-red-600 disabled:opacity-60"
                        aria-label={`${t.removeTagAriaPrefix} ${tag.name}`}
                      >
                        x
                      </button>
                    </span>
                  ))}
                  {currentTags.length === 0 ? (
                    <span className="text-xs text-slate-500">{t.noTags}</span>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    placeholder={t.addTagPlaceholder}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs outline-none ring-slate-300 focus:ring"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void attachTagsFromInput();
                    }}
                    disabled={busy || tagBusy || isTagInputTooLong}
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
                        onClick={() => {
                          void attachExistingTag(tag);
                        }}
                        disabled={busy || tagBusy}
                        className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        #{tag.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-60"
                >
                  {t.save}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
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
