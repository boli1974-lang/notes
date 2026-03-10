"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  TAG_NAME_MAX_LENGTH,
} from "@/lib/utils/tagDraft";

type Note = {
  id: string;
  title: string | null;
  content: string;
  createdAt: string;
};

type Tag = {
  id: string;
  name: string;
};

type TagWithCount = Tag & {
  noteCount: number;
};

type PendingDeletedNote = {
  note: Note;
  index: number;
  timeoutId: ReturnType<typeof setTimeout>;
};

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

async function readJson<T>(response: Response): Promise<ApiResponse<T>> {
  return (await response.json()) as ApiResponse<T>;
}

export default function NotesPage() {
  const [locale, setLocale] = useState<Locale>("en");
  const localeRef = useRef<Locale>("en");
  const t = getMessages(locale).notes;
  const [notes, setNotes] = useState<Note[]>([]);
  const [tagsByNote, setTagsByNote] = useState<Record<string, Tag[]>>({});
  const [tagSummary, setTagSummary] = useState<TagWithCount[]>([]);
  const [unusedTags, setUnusedTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeletedNote, setPendingDeletedNote] = useState<PendingDeletedNote | null>(null);

  const [quickTitle, setQuickTitle] = useState("");
  const [quickContent, setQuickContent] = useState("");
  const [createTagInput, setCreateTagInput] = useState("");
  const [createTagNames, setCreateTagNames] = useState<string[]>([]);
  const [isSavingQuick, setIsSavingQuick] = useState(false);

  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTagNames, setEditTagNames] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    const initialLocale = getInitialLocale();
    setLocale(initialLocale);
    localeRef.current = initialLocale;
  }, []);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  function updateLocale(nextLocale: Locale): void {
    setLocale(nextLocale);
    persistLocale(nextLocale);
  }

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set("search", search.trim());
    }
    if (selectedTagId) {
      params.set("tagId", selectedTagId);
    }
    params.set("sortBy", "createdAt");
    params.set("sortOrder", sortOrder);
    return params.toString();
  }, [search, selectedTagId, sortOrder]);

  const selectedTag = useMemo(
    () => tagSummary.find((tag) => tag.id === selectedTagId) ?? null,
    [selectedTagId, tagSummary],
  );
  const createTagSuggestions = useMemo(() => {
    const query = getActiveTagToken(createTagInput);
    if (isTagNameTooLong(query)) {
      return [];
    }
    if (!query) {
      return [];
    }
    const selected = new Set(createTagNames);
    return tagSummary
      .filter((tag) => tag.name.startsWith(query) && !selected.has(tag.name))
      .slice(0, 6);
  }, [createTagInput, createTagNames, tagSummary]);
  const createTagInputNormalized = useMemo(
    () => getActiveTagToken(createTagInput),
    [createTagInput],
  );
  const isCreateTagInputTooLong = useMemo(
    () => isTagNameTooLong(createTagInputNormalized),
    [createTagInputNormalized],
  );
  const editTagInputNormalized = useMemo(() => getActiveTagToken(editTagInput), [editTagInput]);
  const isEditTagInputTooLong = useMemo(
    () => isTagNameTooLong(editTagInputNormalized),
    [editTagInputNormalized],
  );
  const editTagSuggestions = useMemo(() => {
    if (!editTagInputNormalized || isEditTagInputTooLong) {
      return [];
    }
    const selected = new Set(editTagNames);
    return tagSummary
      .filter((tag) => tag.name.startsWith(editTagInputNormalized) && !selected.has(tag.name))
      .slice(0, 6);
  }, [editTagInputNormalized, editTagNames, isEditTagInputTooLong, tagSummary]);

  const loadTagsForNote = useCallback(async (noteId: string): Promise<void> => {
    const res = await fetch(`/api/notes/${noteId}/tags`);
    const payload = await readJson<Tag[]>(res);
    if (!res.ok || !payload.data) {
      return;
    }

    setTagsByNote((prev) => ({
      ...prev,
      [noteId]: payload.data ?? [],
    }));
  }, []);

  const loadTagSummary = useCallback(async (): Promise<void> => {
    const res = await fetch("/api/tags?includeCounts=true");
    const payload = await readJson<TagWithCount[]>(res);
    if (!res.ok || !payload.data) {
      return;
    }
    setTagSummary(payload.data);
  }, []);

  const loadUnusedTags = useCallback(async (): Promise<void> => {
    const res = await fetch("/api/tags/unused");
    const payload = await readJson<Tag[]>(res);
    if (!res.ok || !payload.data) {
      throw new Error(payload.error ?? getMessages(localeRef.current).notes.errorLoadUnusedTags);
    }
    setUnusedTags(payload.data);
  }, []);

  const loadNotes = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes?${queryString}`);
      const payload = await readJson<Note[]>(res);
      if (!res.ok || !payload.data) {
        setError(payload.error ?? getMessages(localeRef.current).notes.errorLoadNotes);
        setNotes([]);
        return;
      }

      setNotes(payload.data);
      setTagsByNote({});
      await Promise.all(payload.data.map((note) => loadTagsForNote(note.id)));
      await Promise.all([loadTagSummary(), loadUnusedTags()]);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message) {
        setError(loadError.message);
      } else {
        setError(getMessages(localeRef.current).notes.errorLoadNotes);
      }
    } finally {
      setLoading(false);
    }
  }, [loadTagSummary, loadTagsForNote, loadUnusedTags, queryString]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    return () => {
      if (pendingDeletedNote) {
        clearTimeout(pendingDeletedNote.timeoutId);
      }
    };
  }, [pendingDeletedNote]);

  function addCreateTagName(rawTag: string): void {
    const { tagNames, hasTooLongTag } = parseNormalizedTagNames(rawTag);
    if (tagNames.length === 0 && !hasTooLongTag) {
      return;
    }
    if (hasTooLongTag) {
      setError(t.errorTagTooLong);
      return;
    }
    setCreateTagNames((prev) => {
      const deduped = new Set(prev);
      for (const tagName of tagNames) {
        deduped.add(tagName);
      }
      return Array.from(deduped);
    });
    setCreateTagInput("");
  }

  function removeCreateTagName(tagName: string): void {
    setCreateTagNames((prev) => prev.filter((tag) => tag !== tagName));
  }

  async function attachTagToNote(
    noteId: string,
    input: { tagId?: string; tagName?: string },
  ): Promise<{ tag: Tag }> {
    const res = await fetch(`/api/notes/${noteId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await readJson<{ tag: Tag }>(res);
    if (!res.ok || !payload.data) {
      throw new Error(EDIT_ERROR.ATTACH_TAG);
    }
    return payload.data;
  }

  async function onQuickAdd(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!quickContent.trim()) {
      setError(t.errorContentRequired);
      return;
    }

    setIsSavingQuick(true);
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quickTitle || null,
          content: quickContent,
        }),
      });
      const payload = await readJson<Note>(res);
      if (!res.ok) {
        setError(payload.error ?? t.errorCreateNote);
        return;
      }

      const parsedInput = parseNormalizedTagNames(createTagInput);
      if (parsedInput.hasTooLongTag) {
        setError(t.errorTagTooLong);
        return;
      }
      const tagsToAttach = Array.from(
        new Set([
          ...createTagNames,
          ...parsedInput.tagNames,
        ]),
      );
      if (payload.data?.id && tagsToAttach.length > 0) {
        try {
          await Promise.all(
            tagsToAttach.map((tagName) =>
              attachTagToNote(payload.data!.id, { tagName }),
            ),
          );
        } catch {
          setError(t.errorAttachTag);
        }
      }

      setQuickTitle("");
      setQuickContent("");
      setCreateTagInput("");
      setCreateTagNames([]);
      await loadNotes();
    } catch {
      setError(t.errorCreateNote);
    } finally {
      setIsSavingQuick(false);
    }
  }

  function beginEdit(note: Note): void {
    setEditingNoteId(note.id);
    setEditTitle(note.title ?? "");
    setEditContent(note.content);
    setEditTagNames((tagsByNote[note.id] ?? []).map((tag) => tag.name));
    setEditTagInput("");
  }

  function addEditTagNames(rawTagInput: string): void {
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
    setEditTagInput("");
  }

  function removeEditTagName(tagName: string): void {
    setError(null);
    setEditTagNames((prev) => prev.filter((existingTagName) => existingTagName !== tagName));
  }

  function applySuggestionTag(tagName: string): void {
    setError(null);
    setEditTagNames((prev) => mergeTagNames(prev, [tagName]));
    setEditTagInput(removeActiveTagToken(editTagInput));
  }

  function resetNotesEditState(): void {
    setEditingNoteId(null);
    setEditTagInput("");
    setEditTagNames([]);
  }

  async function attachTagNames(noteId: string, tagNames: string[]): Promise<Tag[]> {
    if (tagNames.length === 0) {
      return [];
    }

    const attachedPayloads = await Promise.all(
      tagNames.map((tagName) => attachTagToNote(noteId, { tagName })),
    );

    return attachedPayloads.map((payload) => payload.tag);
  }

  async function saveEdit(noteId: string): Promise<void> {
    const parsedInput = parseNormalizedTagNames(editTagInput);
    if (parsedInput.hasTooLongTag) {
      setError(t.errorTagTooLong);
      return;
    }
    const draftTagNames = mergeTagNames(editTagNames, parsedInput.tagNames);
    const originalTags = tagsByNote[noteId] ?? [];
    const { tagsToDetach, tagNamesToAttach } = computeTagDiff(originalTags, draftTagNames);

    setIsSavingEdit(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle || null,
          content: editContent,
        }),
      });
      const payload = await readJson<Note>(res);
      if (!res.ok || !payload.data) {
        setError(payload.error ?? t.errorUpdateNote);
        return;
      }

      if (tagsToDetach.length > 0) {
        await Promise.all(
          tagsToDetach.map(async (tag) => {
            const delRes = await fetch(`/api/notes/${noteId}/tags/${tag.id}`, {
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
        await attachTagNames(noteId, tagNamesToAttach);
      }

      setNotes((prev) =>
        prev.map((note) => (note.id === noteId ? { ...note, ...payload.data } : note)),
      );
      await Promise.all([loadTagsForNote(noteId), loadTagSummary(), loadUnusedTags()]);
      resetNotesEditState();
    } catch (saveError) {
      if (saveError instanceof Error && saveError.message === EDIT_ERROR.DETACH_TAG) {
        setError(t.errorDetachTag);
      } else if (saveError instanceof Error && saveError.message === EDIT_ERROR.ATTACH_TAG) {
        setError(t.errorAttachTag);
      } else {
        setError(t.errorUpdateNote);
      }
      await Promise.all([
        loadNotes(),
        loadTagsForNote(noteId),
        loadTagSummary(),
        loadUnusedTags(),
      ]);
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function softDelete(noteId: string): Promise<void> {
    setError(null);
    const noteToDelete = notes.find((note) => note.id === noteId);
    const noteIndex = notes.findIndex((note) => note.id === noteId);
    if (!noteToDelete) {
      return;
    }

    try {
      const res = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
      const payload = await readJson<{ deleted: boolean }>(res);
      if (!res.ok) {
        setError(payload.error ?? t.errorDeleteNote);
        return;
      }

      setNotes((prev) => prev.filter((note) => note.id !== noteId));
      setTagsByNote((prev) => {
        const next = { ...prev };
        delete next[noteId];
        return next;
      });
      if (pendingDeletedNote) {
        clearTimeout(pendingDeletedNote.timeoutId);
      }
      const timeoutId = setTimeout(() => {
        setPendingDeletedNote(null);
      }, 8000);
      setPendingDeletedNote({
        note: noteToDelete,
        index: noteIndex >= 0 ? noteIndex : 0,
        timeoutId,
      });
      await Promise.all([loadTagSummary(), loadUnusedTags()]);
    } catch {
      setError(t.errorDeleteNote);
    }
  }

  async function undoSoftDelete(): Promise<void> {
    if (!pendingDeletedNote) {
      return;
    }

    clearTimeout(pendingDeletedNote.timeoutId);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${pendingDeletedNote.note.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await readJson<{ restored: boolean }>(res);
      if (!res.ok) {
        setError(payload.error ?? t.errorRestoreNote);
        return;
      }

      setPendingDeletedNote(null);
      await loadNotes();
    } catch {
      setError(t.errorRestoreNote);
    }
  }

  async function deleteUnusedTag(tagId: string): Promise<void> {
    setError(null);
    try {
      const res = await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
      const payload = await readJson<{ deleted: boolean }>(res);
      if (!res.ok) {
        setError(payload.error ?? t.errorDeleteUnusedTag);
        return;
      }

      setUnusedTags((prev) => prev.filter((tag) => tag.id !== tagId));
      await loadTagSummary();
    } catch {
      setError(t.errorDeleteUnusedTag);
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

      <form
        onSubmit={(event) => {
          void onQuickAdd(event);
        }}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-700">{t.quickAddTitle}</h2>
        <input
          value={quickTitle}
          onChange={(event) => setQuickTitle(event.target.value)}
          placeholder={t.titlePlaceholder}
          maxLength={120}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-300 focus:ring"
        />
        <textarea
          value={quickContent}
          onChange={(event) => setQuickContent(event.target.value)}
          placeholder={t.contentPlaceholder}
          maxLength={20000}
          rows={4}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-300 focus:ring"
        />
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700">{t.createTagsLabel}</label>
          <p className="text-[11px] text-slate-500">{t.tagMultiInputHint}</p>
          <p className="text-[11px] text-slate-500">{t.tagLengthHint}</p>
          <div className="flex gap-2">
            <input
              value={createTagInput}
              onChange={(event) => setCreateTagInput(event.target.value)}
              placeholder={t.createTagPlaceholder}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs outline-none ring-slate-300 focus:ring"
            />
            <button
              type="button"
              onClick={() => addCreateTagName(createTagInput)}
              disabled={isCreateTagInputTooLong}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
            >
              {t.addTag}
            </button>
          </div>
          {isCreateTagInputTooLong ? (
            <p className="text-[11px] text-red-600">{t.errorTagTooLong}</p>
          ) : null}
          {createTagSuggestions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {createTagSuggestions.map((tag) => (
                <button
                  type="button"
                  key={tag.id}
                  onClick={() => addCreateTagName(tag.name)}
                  className="rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                >
                  #{tag.name}
                </button>
              ))}
            </div>
          ) : null}
          {createTagNames.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {createTagNames.map((tagName) => (
                <span
                  key={tagName}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                >
                  #{tagName}
                  <button
                    type="button"
                    onClick={() => removeCreateTagName(tagName)}
                    className="text-slate-500 hover:text-red-600"
                    aria-label={`${t.removeTagAriaPrefix} ${tagName}`}
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={isSavingQuick}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSavingQuick ? t.saving : t.addNote}
        </button>
      </form>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{t.tagsTitle}</h2>
          <button
            onClick={() => setSelectedTagId(null)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            {t.clearTagFilter}
          </button>
        </div>
        {selectedTag ? (
          <p className="text-xs text-slate-600">
            {t.selectedTagPrefix}: <span className="font-medium">#{selectedTag.name}</span>
          </p>
        ) : (
          <p className="text-xs text-slate-600">{t.allTags}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {tagSummary.map((tag) => {
            const selected = tag.id === selectedTagId;
            return (
              <button
                key={tag.id}
                onClick={() => setSelectedTagId(selected ? null : tag.id)}
                className={`rounded-full border px-2 py-1 text-xs ${
                  selected
                    ? "border-slate-700 bg-slate-800 text-white"
                    : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                #{tag.name} ({tag.noteCount})
              </button>
            );
          })}
          {tagSummary.length === 0 ? (
            <span className="text-xs text-slate-500">{t.noTags}</span>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">{t.unusedTagsTitle}</h2>
        <div className="flex flex-wrap gap-2">
          {unusedTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700"
            >
              #{tag.name}
              <button
                onClick={() => {
                  void deleteUnusedTag(tag.id);
                }}
                className="rounded border border-red-300 px-1.5 py-0.5 text-[10px] text-red-700 hover:bg-red-50"
              >
                {t.deleteUnusedTag}
              </button>
            </span>
          ))}
          {unusedTags.length === 0 ? (
            <span className="text-xs text-slate-500">{t.noUnusedTags}</span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-300 focus:ring"
        />
        <select
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value as "desc" | "asc")}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-300 focus:ring"
        >
          <option value="desc">{t.newest}</option>
          <option value="asc">{t.oldest}</option>
        </select>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-600">{t.loadingNotes}</div>
      ) : notes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          {t.noNotesFound}
        </div>
      ) : (
        <ul className="space-y-4">
          {(() => {
            const items: Array<{ kind: "note"; note: Note } | { kind: "undo" }> = notes.map((note) => ({
              kind: "note",
              note,
            }));
            if (pendingDeletedNote) {
              const insertAt = Math.max(0, Math.min(pendingDeletedNote.index, items.length));
              items.splice(insertAt, 0, { kind: "undo" });
            }

            return items.map((item, idx) => {
              if (item.kind === "undo") {
                if (!pendingDeletedNote) {
                  return null;
                }
                return (
                  <li key={`undo-${pendingDeletedNote.note.id}-${idx}`} className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3 text-sm text-amber-800">
                      <span>
                        {t.noteDeletedUndoPrefix} {pendingDeletedNote.note.title?.trim() || t.untitled}
                      </span>
                      <button
                        onClick={() => {
                          void undoSoftDelete();
                        }}
                        className="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
                      >
                        {t.undoDelete}
                      </button>
                    </div>
                  </li>
                );
              }

              const note = item.note;
              const isEditing = editingNoteId === note.id;
              const tags = tagsByNote[note.id] ?? [];
            return (
              <li key={note.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                {isEditing ? (
                  <div className="space-y-3">
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
                      maxLength={20000}
                      rows={4}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-300 focus:ring"
                    />
                    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-wrap gap-2">
                        {editTagNames.map((tagName) => (
                          <span
                            key={tagName}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                          >
                            #{tagName}
                            <button
                              type="button"
                              onClick={() => removeEditTagName(tagName)}
                              disabled={isSavingEdit}
                              className="text-slate-500 hover:text-red-600 disabled:opacity-60"
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
                          value={editTagInput}
                          onChange={(event) => setEditTagInput(event.target.value)}
                          placeholder={t.addTagPlaceholder}
                          disabled={isSavingEdit}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs outline-none ring-slate-300 focus:ring disabled:opacity-60"
                        />
                        <button
                          type="button"
                          onClick={() => addEditTagNames(editTagInput)}
                          disabled={isSavingEdit || isEditTagInputTooLong}
                          className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {t.addTag}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500">{t.tagMultiInputHint}</p>
                      <p className="text-[11px] text-slate-500">{t.tagLengthHint}</p>
                      {isEditTagInputTooLong ? (
                        <p className="text-[11px] text-red-600">{t.errorTagTooLong}</p>
                      ) : null}
                      {editTagSuggestions.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {editTagSuggestions.map((tag) => (
                            <button
                              key={tag.id}
                              type="button"
                              onClick={() => applySuggestionTag(tag.name)}
                              disabled={isSavingEdit}
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
                        onClick={() => {
                          void saveEdit(note.id);
                        }}
                        disabled={isSavingEdit}
                        className="rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                      >
                        {isSavingEdit ? t.saving : t.save}
                      </button>
                      <button
                        onClick={resetNotesEditState}
                        className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-slate-800">
                          {note.title?.trim() ? note.title : t.untitled}
                        </h3>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{note.content}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => beginEdit(note)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          {t.edit}
                        </button>
                        <button
                          onClick={() => {
                            void softDelete(note.id);
                          }}
                          className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          {t.delete}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                        >
                          #{tag.name}
                        </span>
                      ))}
                      {tags.length === 0 ? (
                        <span className="text-xs text-slate-500">{t.noTags}</span>
                      ) : null}
                    </div>

                    <p className="text-xs text-slate-500">
                      {t.createdAtPrefix} {new Date(note.createdAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </li>
            );
            });
          })()}
        </ul>
      )}
    </div>
  );
}
