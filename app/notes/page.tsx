"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageViewer } from "@/components/ImageViewer";
import { LanguageToggle } from "@/components/LanguageToggle";
import {
  getNotesCache,
  invalidateNotesCache,
  invalidateReviewCache,
  setNotesCache,
} from "@/lib/cache/revisitCache";
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

type NoteImageItem = {
  id: string;
  url: string;
  fileName?: string;
};

const MAX_IMAGES_PER_NOTE = 5;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

type DraftImage = { file: File; previewUrl: string };

function revokeDraftPreviews(items: DraftImage[]): void {
  items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
}

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
  const [imagesByNote, setImagesByNote] = useState<Record<string, NoteImageItem[]>>({});
  const [createDraftFiles, setCreateDraftFiles] = useState<DraftImage[]>([]);
  const [editDraftFiles, setEditDraftFiles] = useState<DraftImage[]>([]);
  const [editPendingDeleteIds, setEditPendingDeleteIds] = useState<string[]>([]);
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);

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

  const loadTagSummary = useCallback(async (): Promise<TagWithCount[] | undefined> => {
    const res = await fetch("/api/tags?includeCounts=true");
    const payload = await readJson<TagWithCount[]>(res);
    if (!res.ok || !payload.data) {
      return;
    }
    setTagSummary(payload.data);
    return payload.data;
  }, []);

  const loadUnusedTags = useCallback(async (): Promise<Tag[]> => {
    const res = await fetch("/api/tags/unused");
    const payload = await readJson<Tag[]>(res);
    if (!res.ok || !payload.data) {
      throw new Error(payload.error ?? getMessages(localeRef.current).notes.errorLoadUnusedTags);
    }
    setUnusedTags(payload.data);
    return payload.data;
  }, []);

  const loadImagesForNote = useCallback(async (noteId: string): Promise<void> => {
    const res = await fetch(`/api/notes/${noteId}/images`);
    const payload = await readJson<NoteImageItem[]>(res);
    if (!res.ok || !payload.data) {
      return;
    }
    setImagesByNote((prev) => ({ ...prev, [noteId]: payload.data ?? [] }));
  }, []);

  const loadNotes = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes?${queryString}`);
      const payload = await readJson<(Note & { tags?: Tag[] })[]>(res);
      if (!res.ok || !payload.data) {
        setError(payload.error ?? getMessages(localeRef.current).notes.errorLoadNotes);
        setNotes([]);
        setTagsByNote({});
        return;
      }

      const data = payload.data;
      const notesData = data.map((n) => ({ id: n.id, title: n.title, content: n.content, createdAt: n.createdAt }));
      setNotes(notesData);
      const tagsByNoteAcc: Record<string, Tag[]> = {};
      for (let i = 0; i < data.length; i++) {
        const n = data[i];
        tagsByNoteAcc[n.id] = n.tags ?? [];
      }
      setTagsByNote(tagsByNoteAcc);
      const [tagSummaryData, unusedTagsData] = await Promise.all([loadTagSummary(), loadUnusedTags()]);
      setNotesCache(queryString, {
        notes: notesData,
        tagsByNote: tagsByNoteAcc,
        tagSummary: tagSummaryData ?? [],
        unusedTags: unusedTagsData ?? [],
      });
      await Promise.all(data.map((note) => loadImagesForNote(note.id)));
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message) {
        setError(loadError.message);
      } else {
        setError(getMessages(localeRef.current).notes.errorLoadNotes);
      }
    } finally {
      setLoading(false);
    }
  }, [loadImagesForNote, loadTagSummary, loadUnusedTags, queryString]);

  const queryStringRef = useRef(queryString);
  useEffect(() => {
    queryStringRef.current = queryString;
  }, [queryString]);

  const revalidateNotes = useCallback(async (): Promise<void> => {
    const queryStringForFetch = queryString;
    try {
      const res = await fetch(`/api/notes?${queryStringForFetch}`);
      const payload = await readJson<(Note & { tags?: Tag[] })[]>(res);
      if (!res.ok || !payload.data) return;
      if (queryStringRef.current !== queryStringForFetch) return;

      const data = payload.data;
      const notesData = data.map((n) => ({ id: n.id, title: n.title, content: n.content, createdAt: n.createdAt }));
      const tagsByNoteAcc: Record<string, Tag[]> = {};
      for (let i = 0; i < data.length; i++) {
        const n = data[i];
        tagsByNoteAcc[n.id] = n.tags ?? [];
      }
      setNotes(notesData);
      setTagsByNote(tagsByNoteAcc);
      const [tagSummaryData, unusedTagsData] = await Promise.all([loadTagSummary(), loadUnusedTags()]);
      if (queryStringRef.current !== queryStringForFetch) return;
      setNotesCache(queryStringForFetch, {
        notes: notesData,
        tagsByNote: tagsByNoteAcc,
        tagSummary: tagSummaryData ?? [],
        unusedTags: unusedTagsData ?? [],
      });
      await Promise.all(data.map((note) => loadImagesForNote(note.id)));
    } catch {
      // Keep current state; do not overwrite with error
    }
  }, [queryString, loadImagesForNote, loadTagSummary, loadUnusedTags]);

  const lastLoadedQueryRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastLoadedQueryRef.current !== queryString) {
      lastLoadedQueryRef.current = queryString;
      const cached = getNotesCache(queryString);
      if (cached) {
        setNotes(cached.notes);
        setTagsByNote(cached.tagsByNote);
        setTagSummary(cached.tagSummary);
        setUnusedTags(cached.unusedTags);
        setError(null);
        setLoading(false);
        void revalidateNotes();
      } else {
        void loadNotes();
      }
    }
  }, [loadNotes, queryString, revalidateNotes, loadImagesForNote]);

  useEffect(() => {
    return () => {
      if (pendingDeletedNote) {
        clearTimeout(pendingDeletedNote.timeoutId);
      }
    };
  }, [pendingDeletedNote]);

  const createDraftRef = useRef(createDraftFiles);
  const editDraftRef = useRef(editDraftFiles);
  createDraftRef.current = createDraftFiles;
  editDraftRef.current = editDraftFiles;
  useEffect(() => {
    return () => {
      revokeDraftPreviews(createDraftRef.current);
      revokeDraftPreviews(editDraftRef.current);
    };
  }, []);

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
      let imageUploadFailed = false;
      if (payload.data?.id && createDraftFiles.length > 0) {
        for (const draft of createDraftFiles) {
          const { file } = draft;
          if (!ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE_BYTES) continue;
          const form = new FormData();
          form.append("file", file);
          const imgRes = await fetch(`/api/notes/${payload.data!.id}/images`, {
            method: "POST",
            body: form,
          });
          if (!imgRes.ok) {
            imageUploadFailed = true;
            setError(t.errorImageUpload);
          }
        }
        if (imageUploadFailed) {
          await loadImagesForNote(payload.data!.id);
        }
      }

      setQuickTitle("");
      setQuickContent("");
      setCreateTagInput("");
      setCreateTagNames([]);
      revokeDraftPreviews(createDraftFiles);
      setCreateDraftFiles([]);
      invalidateNotesCache();
      invalidateReviewCache();
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
    setEditDraftFiles([]);
    setEditPendingDeleteIds([]);
    void loadImagesForNote(note.id);
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
    revokeDraftPreviews(editDraftFiles);
    setEditingNoteId(null);
    setEditTagInput("");
    setEditTagNames([]);
    setEditDraftFiles([]);
    setEditPendingDeleteIds([]);
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
      let imageOpFailed = false;
      for (const draft of editDraftFiles) {
        const { file } = draft;
        if (!ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE_BYTES) continue;
        const form = new FormData();
        form.append("file", file);
        const imgRes = await fetch(`/api/notes/${noteId}/images`, { method: "POST", body: form });
        if (!imgRes.ok) {
          imageOpFailed = true;
          setError(t.errorImageUpload);
        }
      }
      for (const imageId of editPendingDeleteIds) {
        const delRes = await fetch(`/api/notes/${noteId}/images/${imageId}`, { method: "DELETE" });
        if (!delRes.ok) {
          imageOpFailed = true;
          setError(t.errorImageUpload);
        }
      }

      setNotes((prev) =>
        prev.map((note) => (note.id === noteId ? { ...note, ...payload.data } : note)),
      );
      invalidateNotesCache();
      invalidateReviewCache();
      await loadImagesForNote(noteId);
      await Promise.all([loadTagsForNote(noteId), loadTagSummary(), loadUnusedTags()]);
      if (imageOpFailed) {
        setError(t.errorImageUpload);
      }
      resetNotesEditState();
    } catch (saveError) {
      if (saveError instanceof Error && saveError.message === EDIT_ERROR.DETACH_TAG) {
        setError(t.errorDetachTag);
      } else if (saveError instanceof Error && saveError.message === EDIT_ERROR.ATTACH_TAG) {
        setError(t.errorAttachTag);
      } else {
        setError(t.errorUpdateNote);
      }
      invalidateNotesCache();
      invalidateReviewCache();
      await Promise.all([
        loadNotes(),
        loadTagsForNote(noteId),
        loadImagesForNote(noteId),
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
      const noteIdToCleanup = noteToDelete.id;
      const timeoutId = setTimeout(() => {
        fetch(`/api/notes/${noteIdToCleanup}/images/cleanup-after-undo-expiry`, {
          method: "POST",
        }).catch((err) => console.error("Cleanup after undo expiry failed", err));
        setPendingDeletedNote(null);
      }, 8000);
      setPendingDeletedNote({
        note: noteToDelete,
        index: noteIndex >= 0 ? noteIndex : 0,
        timeoutId,
      });
      invalidateNotesCache();
      invalidateReviewCache();
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
      invalidateNotesCache();
      invalidateReviewCache();
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
      invalidateNotesCache();
      invalidateReviewCache();
      await loadTagSummary();
    } catch {
      setError(t.errorDeleteUnusedTag);
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
          <label className="block text-xs font-medium text-slate-700">{t.imagesLabel}</label>
          {createDraftFiles.length >= MAX_IMAGES_PER_NOTE ? (
            <p className="text-[11px] text-amber-600">{t.imageLimitReached}</p>
          ) : (
            <input
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              className="block w-full text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-slate-700"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                const valid = files.filter(
                  (f) => ALLOWED_IMAGE_TYPES.includes(f.type) && f.size <= MAX_IMAGE_SIZE_BYTES,
                );
                setCreateDraftFiles((prev) => {
                  const next = prev.concat(
                    valid.slice(0, Math.max(0, MAX_IMAGES_PER_NOTE - prev.length)).map((file) => ({
                      file,
                      previewUrl: URL.createObjectURL(file),
                    })),
                  );
                  return next.slice(0, MAX_IMAGES_PER_NOTE);
                });
                e.target.value = "";
              }}
            />
          )}
          {createDraftFiles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {createDraftFiles.map((draft, i) => (
                <div key={i} className="relative inline-block">
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
                      setCreateDraftFiles((prev) => prev.filter((_, j) => j !== i));
                    }}
                    className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white"
                    aria-label={t.removeImage}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
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

      {loading && notes.length === 0 ? (
        <div className="text-sm text-slate-600">
          {t.loadingNotes}
        </div>
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
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-slate-700">{t.imagesLabel}</span>
                      {(imagesByNote[note.id] ?? [])
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
                              disabled={isSavingEdit}
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
                            disabled={isSavingEdit}
                            className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white disabled:opacity-60"
                            aria-label={t.removeImage}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {(imagesByNote[note.id] ?? []).filter((img) => !editPendingDeleteIds.includes(img.id)).length + editDraftFiles.length < MAX_IMAGES_PER_NOTE ? (
                        <input
                          type="file"
                          accept={ALLOWED_IMAGE_TYPES.join(",")}
                          disabled={isSavingEdit}
                          className="block text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-slate-700 disabled:opacity-60"
                          onChange={(e) => {
                            const files = Array.from(e.target.files ?? []);
                            const valid = files.filter(
                              (f) => ALLOWED_IMAGE_TYPES.includes(f.type) && f.size <= MAX_IMAGE_SIZE_BYTES,
                            );
                            const visible = (imagesByNote[note.id] ?? []).filter((img) => !editPendingDeleteIds.includes(img.id)).length;
                            setEditDraftFiles((prev) => {
                              const maxNew = MAX_IMAGES_PER_NOTE - visible - prev.length;
                              return prev.concat(
                                valid.slice(0, Math.max(0, maxNew)).map((file) => ({
                                  file,
                                  previewUrl: URL.createObjectURL(file),
                                })),
                              );
                            });
                            e.target.value = "";
                          }}
                        />
                      ) : (
                        <p className="text-[11px] text-amber-600">{t.imageLimitReached}</p>
                      )}
                    </div>
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
                        {(imagesByNote[note.id] ?? []).length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(imagesByNote[note.id] ?? []).map((img) => (
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
