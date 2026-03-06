"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Locale, getInitialLocale, getMessages, persistLocale } from "@/lib/i18n";

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

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

async function readJson<T>(response: Response): Promise<ApiResponse<T>> {
  return (await response.json()) as ApiResponse<T>;
}

function normalizeTagName(value: string): string {
  return value.trim().toLowerCase();
}

export default function NotesPage() {
  const [locale, setLocale] = useState<Locale>("en");
  const localeRef = useRef<Locale>("en");
  const t = getMessages(locale).notes;
  const [notes, setNotes] = useState<Note[]>([]);
  const [tagsByNote, setTagsByNote] = useState<Record<string, Tag[]>>({});
  const [tagSummary, setTagSummary] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [tagInputByNote, setTagInputByNote] = useState<Record<string, string>>({});
  const [tagBusyNoteId, setTagBusyNoteId] = useState<string | null>(null);

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
    const query = normalizeTagName(createTagInput);
    if (!query) {
      return [];
    }
    const selected = new Set(createTagNames);
    return tagSummary
      .filter((tag) => tag.name.startsWith(query) && !selected.has(tag.name))
      .slice(0, 6);
  }, [createTagInput, createTagNames, tagSummary]);

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
      await loadTagSummary();
    } catch {
      setError(getMessages(localeRef.current).notes.errorLoadNotes);
    } finally {
      setLoading(false);
    }
  }, [loadTagSummary, loadTagsForNote, queryString]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  function addCreateTagName(rawTag: string): void {
    const normalized = normalizeTagName(rawTag);
    if (!normalized) {
      return;
    }
    setCreateTagNames((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setCreateTagInput("");
  }

  function removeCreateTagName(tagName: string): void {
    setCreateTagNames((prev) => prev.filter((tag) => tag !== tagName));
  }

  async function attachTagToNote(
    noteId: string,
    input: { tagId?: string; tagName?: string },
  ): Promise<{ tag: Tag } | null> {
    const res = await fetch(`/api/notes/${noteId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await readJson<{ tag: Tag }>(res);
    if (!res.ok || !payload.data) {
      throw new Error(payload.error ?? t.errorAttachTag);
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

      const pendingTagFromInput = normalizeTagName(createTagInput);
      const tagsToAttach = Array.from(
        new Set([
          ...createTagNames,
          ...(pendingTagFromInput ? [pendingTagFromInput] : []),
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
  }

  async function saveEdit(noteId: string): Promise<void> {
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

      setEditingNoteId(null);
      await loadNotes();
    } catch {
      setError(t.errorUpdateNote);
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function softDelete(noteId: string): Promise<void> {
    setError(null);
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
      await loadTagSummary();
    } catch {
      setError(t.errorDeleteNote);
    }
  }

  async function attachTag(noteId: string): Promise<void> {
    const tagName = normalizeTagName(tagInputByNote[noteId] ?? "");
    if (!tagName) {
      return;
    }

    setTagBusyNoteId(noteId);
    setError(null);
    try {
      const payload = await attachTagToNote(noteId, { tagName });
      if (!payload) {
        return;
      }
      const attachedTag = payload.tag;

      setTagInputByNote((prev) => ({ ...prev, [noteId]: "" }));
      setTagsByNote((prev) => {
        const existing = prev[noteId] ?? [];
        if (existing.some((tag) => tag.id === attachedTag.id)) {
          return prev;
        }
        return { ...prev, [noteId]: [attachedTag, ...existing] };
      });
      await loadTagSummary();
    } catch {
      setError(t.errorAttachTag);
    } finally {
      setTagBusyNoteId(null);
    }
  }

  async function attachExistingTag(noteId: string, tag: Tag): Promise<void> {
    setTagBusyNoteId(noteId);
    setError(null);
    try {
      const payload = await attachTagToNote(noteId, { tagId: tag.id });
      if (!payload) {
        return;
      }
      setTagInputByNote((prev) => ({ ...prev, [noteId]: "" }));
      setTagsByNote((prev) => {
        const existing = prev[noteId] ?? [];
        if (existing.some((item) => item.id === payload.tag.id)) {
          return prev;
        }
        return { ...prev, [noteId]: [payload.tag, ...existing] };
      });
      await loadTagSummary();
    } catch {
      setError(t.errorAttachTag);
    } finally {
      setTagBusyNoteId(null);
    }
  }

  async function detachTag(noteId: string, tagId: string): Promise<void> {
    setTagBusyNoteId(noteId);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${noteId}/tags/${tagId}`, {
        method: "DELETE",
      });
      const payload = await readJson<{ detached: boolean }>(res);
      if (!res.ok) {
        setError(payload.error ?? t.errorDetachTag);
        return;
      }

      setTagsByNote((prev) => ({
        ...prev,
        [noteId]: (prev[noteId] ?? []).filter((tag) => tag.id !== tagId),
      }));
      await loadTagSummary();
    } catch {
      setError(t.errorDetachTag);
    } finally {
      setTagBusyNoteId(null);
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
              className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
            >
              {t.addTag}
            </button>
          </div>
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
          {notes.map((note) => {
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
                        onClick={() => setEditingNoteId(null)}
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
                          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                        >
                          #{tag.name}
                          <button
                            onClick={() => {
                              void detachTag(note.id, tag.id);
                            }}
                            disabled={tagBusyNoteId === note.id}
                            className="text-slate-500 hover:text-red-600"
                            aria-label={`${t.removeTagAriaPrefix} ${tag.name}`}
                          >
                            x
                          </button>
                        </span>
                      ))}
                      {tags.length === 0 ? (
                        <span className="text-xs text-slate-500">{t.noTags}</span>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        value={tagInputByNote[note.id] ?? ""}
                        onChange={(event) =>
                          setTagInputByNote((prev) => ({ ...prev, [note.id]: event.target.value }))
                        }
                        placeholder={t.addTagPlaceholder}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs outline-none ring-slate-300 focus:ring"
                      />
                      <button
                        onClick={() => {
                          void attachTag(note.id);
                        }}
                        disabled={tagBusyNoteId === note.id}
                        className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        {t.addTag}
                      </button>
                    </div>
                    {(() => {
                      const query = normalizeTagName(tagInputByNote[note.id] ?? "");
                      if (!query) {
                        return null;
                      }
                      const attachedIds = new Set(tags.map((tag) => tag.id));
                      const suggestions = tagSummary
                        .filter((tag) => tag.name.startsWith(query) && !attachedIds.has(tag.id))
                        .slice(0, 6);
                      if (suggestions.length === 0) {
                        return null;
                      }
                      return (
                        <div className="flex flex-wrap gap-2">
                          {suggestions.map((tag) => (
                            <button
                              key={tag.id}
                              onClick={() => {
                                void attachExistingTag(note.id, tag);
                              }}
                              disabled={tagBusyNoteId === note.id}
                              className="rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                            >
                              #{tag.name}
                            </button>
                          ))}
                        </div>
                      );
                    })()}

                    <p className="text-xs text-slate-500">
                      {t.createdAtPrefix} {new Date(note.createdAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
