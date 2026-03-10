/**
 * Shared tag-draft helpers for Notes and Review edit-mode tag editing.
 * Used for buffered tag add/remove (applied only on Save).
 */

export const TAG_NAME_MAX_LENGTH = 30;

export function normalizeTagName(value: string): string {
  return value.trim().toLowerCase();
}

export function isTagNameTooLong(normalizedTagName: string): boolean {
  return normalizedTagName.length > TAG_NAME_MAX_LENGTH;
}

export function getActiveTagToken(rawInput: string): string {
  const segments = rawInput.split(";");
  return normalizeTagName(segments[segments.length - 1] ?? "");
}

/**
 * Removes the last (active) token from semicolon-separated input.
 * Used when applying a suggestion so earlier tokens are preserved.
 */
export function removeActiveTagToken(rawInput: string): string {
  const segments = rawInput.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
  if (segments.length <= 1) return "";
  return segments.slice(0, -1).join("; ").trim();
}

export function parseNormalizedTagNames(rawInput: string): {
  tagNames: string[];
  hasTooLongTag: boolean;
} {
  const deduped = new Set<string>();
  let hasTooLongTag = false;

  for (const segment of rawInput.split(";")) {
    const normalized = normalizeTagName(segment);
    if (!normalized) continue;
    if (isTagNameTooLong(normalized)) {
      hasTooLongTag = true;
      continue;
    }
    deduped.add(normalized);
  }

  return { tagNames: Array.from(deduped), hasTooLongTag };
}

export function mergeTagNames(
  existingTagNames: string[],
  addedTagNames: string[],
): string[] {
  const deduped = new Set(existingTagNames.map(normalizeTagName));
  for (const tagName of addedTagNames) {
    deduped.add(normalizeTagName(tagName));
  }
  return Array.from(deduped);
}

export type TagWithName = { id: string; name: string };

/**
 * Computes which tags to detach and which tag names to attach
 * when syncing draft tag names to the server.
 */
export function computeTagDiff(
  originalTags: TagWithName[],
  draftTagNames: string[],
): { tagsToDetach: TagWithName[]; tagNamesToAttach: string[] } {
  const draftSet = new Set(draftTagNames);
  const originalNames = new Set(originalTags.map((t) => t.name));
  const tagsToDetach = originalTags.filter((tag) => !draftSet.has(tag.name));
  const tagNamesToAttach = draftTagNames.filter((name) => !originalNames.has(name));
  return { tagsToDetach, tagNamesToAttach };
}
