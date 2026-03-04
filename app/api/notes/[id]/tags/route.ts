import { NextResponse } from "next/server";
import { attachTagToNote, listTagsForNote } from "@/lib/services/tagService";

type AttachTagBody = {
  tagId?: unknown;
  tagName?: unknown;
  userId?: unknown;
};

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: noteId } = await context.params;
    if (!isUuid(noteId)) {
      return badRequest("id must be a valid UUID.");
    }

    const body = (await request.json()) as AttachTagBody;
    if (body.userId !== undefined && typeof body.userId !== "string") {
      return badRequest("userId must be a string when provided.");
    }
    if (body.tagId !== undefined && typeof body.tagId !== "string") {
      return badRequest("tagId must be a string when provided.");
    }
    if (body.tagName !== undefined && typeof body.tagName !== "string") {
      return badRequest("tagName must be a string when provided.");
    }
    if (typeof body.tagId !== "string" && typeof body.tagName !== "string") {
      return badRequest("Either tagId or tagName is required.");
    }
    if (typeof body.tagId === "string" && !isUuid(body.tagId)) {
      return badRequest("tagId must be a valid UUID.");
    }

    const result = await attachTagToNote(
      noteId,
      {
        tagId: typeof body.tagId === "string" ? body.tagId : undefined,
        tagName: typeof body.tagName === "string" ? body.tagName : undefined,
      },
      body.userId,
    );

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NOTE_NOT_FOUND") {
        return NextResponse.json({ error: "Note not found." }, { status: 404 });
      }
      if (error.message === "TAG_NOT_FOUND") {
        return NextResponse.json({ error: "Tag not found." }, { status: 404 });
      }
      if (error.message === "TAG_INPUT_REQUIRED") {
        return badRequest("Either tagId or tagName is required.");
      }
      if (error.message === "INVALID_TAG_NAME") {
        return badRequest("tagName must not be empty.");
      }
      if (error.message === "TAG_NAME_TOO_LONG") {
        return badRequest("tagName must be at most 30 characters after normalization.");
      }
    }
    return NextResponse.json({ error: "Failed to attach tag to note." }, { status: 500 });
  }
}

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: noteId } = await context.params;
    if (!isUuid(noteId)) {
      return badRequest("id must be a valid UUID.");
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? undefined;

    const tags = await listTagsForNote(noteId, userId);
    return NextResponse.json({ data: tags });
  } catch (error) {
    if (error instanceof Error && error.message === "NOTE_NOT_FOUND") {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to list note tags." }, { status: 500 });
  }
}
