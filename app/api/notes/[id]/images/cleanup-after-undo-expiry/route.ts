import { NextResponse } from "next/server";
import { deleteStorageObjectsForNoteId } from "@/lib/services/noteImageService";
import { getNoteById } from "@/lib/services/noteService";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Called by the UI when the Undo toast window expires after a note delete.
 * Invokes deleteStorageObjectsForNoteId(noteId) to permanently delete storage objects
 * for that note's images. Note and image metadata are already soft-deleted.
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: noteId } = await context.params;
    if (!isUuid(noteId)) {
      return badRequest("id must be a valid UUID.");
    }
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? undefined;

    const note = await getNoteById(noteId, userId, true);
    if (!note || !note.deletedAt) {
      return NextResponse.json(
        { error: "Note not found or not deleted." },
        { status: 404 },
      );
    }

    await deleteStorageObjectsForNoteId(noteId, userId);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    console.error("Cleanup after undo expiry failed", err);
    return NextResponse.json(
      { error: "Failed to cleanup storage after undo expiry." },
      { status: 500 },
    );
  }
}
