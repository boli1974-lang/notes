import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Bucket name for note images (private). */
export const NOTE_IMAGES_BUCKET = "note-images";

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase URL and service role key are required for storage.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Upload a file to the note-images bucket at the given path.
 * @param buffer - File contents
 * @param path - Full object path (e.g. notes/{noteId}/{uuid}-{fileName})
 * @param contentType - MIME type (e.g. image/jpeg)
 */
export async function uploadImage(
  buffer: Buffer,
  path: string,
  contentType: string,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.storage.from(NOTE_IMAGES_BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}

/**
 * Delete an object from the note-images bucket. Treats 404 as success (idempotent).
 */
export async function deleteImage(path: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.storage.from(NOTE_IMAGES_BUCKET).remove([path]);
  if (error && error.message !== "Object not found" && error.message?.toLowerCase().indexOf("not found") === -1) {
    throw new Error(`Storage delete failed: ${error.message}`);
  }
}

/**
 * Create a signed URL for private bucket access. Used by the service layer when listing images.
 * @param path - Full object path in the bucket
 * @param expirySeconds - URL validity in seconds (e.g. 3600 for 1 hour)
 */
export async function createSignedUrl(
  path: string,
  expirySeconds: number,
): Promise<string> {
  const supabase = getClient();
  const { data, error } = await supabase.storage
    .from(NOTE_IMAGES_BUCKET)
    .createSignedUrl(path, expirySeconds);
  if (error) {
    throw new Error(`Signed URL failed: ${error.message}`);
  }
  if (!data?.signedUrl) {
    throw new Error("Signed URL not returned.");
  }
  return data.signedUrl;
}
