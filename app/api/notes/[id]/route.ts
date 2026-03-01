import { NextResponse } from "next/server";
import { getNoteById, softDeleteNote, updateNote } from "@/lib/services/noteService";

type NoteUpdateBody = {
  title?: unknown;
  content?: unknown;
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

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return badRequest("id must be a valid UUID.");
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? undefined;

    const note = await getNoteById(id, userId);
    if (!note) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    return NextResponse.json({ data: note });
  } catch {
    return NextResponse.json({ error: "Failed to fetch note." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return badRequest("id must be a valid UUID.");
    }

    const body = (await request.json()) as NoteUpdateBody;
    const userId = typeof body.userId === "string" ? body.userId : undefined;

    if (body.userId !== undefined && typeof body.userId !== "string") {
      return badRequest("userId must be a string when provided.");
    }

    if (body.title !== undefined && body.title !== null && typeof body.title !== "string") {
      return badRequest("title must be a string or null.");
    }
    if (typeof body.title === "string" && body.title.length > 120) {
      return badRequest("title must be at most 120 characters.");
    }

    if (body.content !== undefined && typeof body.content !== "string") {
      return badRequest("content must be a string when provided.");
    }
    if (typeof body.content === "string" && body.content.length > 20000) {
      return badRequest("content must be at most 20000 characters.");
    }

    if (body.title === undefined && body.content === undefined) {
      return badRequest("At least one of title or content is required.");
    }

    const updated = await updateNote(
      id,
      {
        title: body.title as string | null | undefined,
        content: body.content as string | undefined,
      },
      userId,
    );

    if (!updated) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update note." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return badRequest("id must be a valid UUID.");
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? undefined;

    const deleted = await softDeleteNote(id, userId);
    if (!deleted) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }

    return NextResponse.json({ data: { deleted: true } });
  } catch {
    return NextResponse.json({ error: "Failed to delete note." }, { status: 500 });
  }
}
