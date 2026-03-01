import { NextResponse } from "next/server";
import { detachTagFromNote } from "@/lib/services/tagService";

type RouteContext = {
  params: Promise<{
    id: string;
    tagId: string;
  }>;
};

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: noteId, tagId } = await context.params;
    if (!isUuid(noteId)) {
      return badRequest("id must be a valid UUID.");
    }
    if (!isUuid(tagId)) {
      return badRequest("tagId must be a valid UUID.");
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? undefined;

    const removed = await detachTagFromNote(noteId, tagId, userId);
    if (!removed) {
      return NextResponse.json({ error: "Tag is not attached to note." }, { status: 404 });
    }

    return NextResponse.json({ data: { detached: true } });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOTE_NOT_FOUND") {
        return NextResponse.json({ error: "Note not found." }, { status: 404 });
      }
      if (error.message === "TAG_NOT_FOUND") {
        return NextResponse.json({ error: "Tag not found." }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Failed to detach tag from note." }, { status: 500 });
  }
}
