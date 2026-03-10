/**
 * Stable internal error codes for edit/save flows.
 * Use these when throwing so classification does not depend on localized strings.
 * Map to localized messages only when displaying to the user.
 */
export const EDIT_ERROR = {
  ATTACH_TAG: "ERR_ATTACH_TAG",
  DETACH_TAG: "ERR_DETACH_TAG",
} as const;

export type EditErrorCode = (typeof EDIT_ERROR)[keyof typeof EDIT_ERROR];
