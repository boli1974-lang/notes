/**
 * Client-side revisit cache for Notes and Review pages.
 * Reduces perceived slowness when navigating between pages by reusing
 * recently fetched data for a short period (stale-while-revalidate).
 */

const CACHE_TTL_MS = 45_000;

export type NoteCacheEntry = {
  notes: Array<{ id: string; title: string | null; content: string; createdAt: string }>;
  tagsByNote: Record<string, Array<{ id: string; name: string }>>;
  tagSummary: Array<{ id: string; name: string; noteCount: number }>;
  unusedTags: Array<{ id: string; name: string }>;
  fetchedAt: number;
};

export type ReviewCacheEntry = {
  batch: {
    batchId: string;
    reviewDate: string;
    notes: Array<{ position: number; note: { id: string; title: string | null; content: string; tags?: Array<{ id: string; name: string }> } }>;
    reviewedNoteIds?: string[];
  };
  tagSummary: Array<{ id: string; name: string }>;
  fetchedAt: number;
};

const notesCache = new Map<string, NoteCacheEntry>();
const reviewCache = new Map<string, ReviewCacheEntry>();

function isFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < CACHE_TTL_MS;
}

export function getNotesCache(queryString: string): NoteCacheEntry | null {
  const entry = notesCache.get(queryString);
  if (!entry || !isFresh(entry.fetchedAt)) {
    return null;
  }
  return entry;
}

export function setNotesCache(queryString: string, entry: Omit<NoteCacheEntry, "fetchedAt">): void {
  notesCache.set(queryString, { ...entry, fetchedAt: Date.now() });
}

export function getReviewCache(reviewDate: string): ReviewCacheEntry | null {
  const entry = reviewCache.get(reviewDate);
  if (!entry || !isFresh(entry.fetchedAt)) {
    return null;
  }
  return entry;
}

export function setReviewCache(reviewDate: string, entry: Omit<ReviewCacheEntry, "fetchedAt">): void {
  reviewCache.set(reviewDate, { ...entry, fetchedAt: Date.now() });
}

/** Clears the entire Notes cache. Call after note/tag mutations. */
export function invalidateNotesCache(): void {
  notesCache.clear();
}

/** Clears the entire Review cache. Call after batch-affecting mutations or explicit Refresh Batch. */
export function invalidateReviewCache(): void {
  reviewCache.clear();
}
