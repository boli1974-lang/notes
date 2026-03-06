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

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

async function readJson<T>(response: Response): Promise<ApiResponse<T>> {
  return (await response.json()) as ApiResponse<T>;
}

const MIN_REVIEW_DWELL_MS = 3000;

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

  const currentItem = useMemo(() => batch?.notes[index] ?? null, [batch, index]);
  const total = batch?.notes.length ?? 0;

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

  useEffect(() => {
    void loadBatch();
  }, [loadBatch]);

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

  async function saveEdit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!currentItem) {
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
      setEditing(false);
    } catch {
      setError(t.errorUpdateNote);
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
