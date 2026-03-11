import { NextResponse } from "next/server";
import { restoreImagesByNoteId } from "@/lib/services/noteImageService";
import { restoreNote } from "@/lib/services/noteService";

type RestoreBody = {
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
    const { id } = await context.params;
    if (!isUuid(id)) {
      return badRequest("id must be a valid UUID.");
    }

    let body: RestoreBody = {};
    try {
      body = (await request.json()) as RestoreBody;
    } catch {
      body = {};
    }
    if (body.userId !== undefined && typeof body.userId !== "string") {
      return badRequest("userId must be a string when provided.");
    }
    const userId = typeof body.userId === "string" ? body.userId : undefined;

    const restored = await restoreNote(id, userId);
    if (!restored) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }
    await restoreImagesByNoteId(id, userId);

    return NextResponse.json({ data: { restored: true } });
  } catch {
    return NextResponse.json({ error: "Failed to restore note." }, { status: 500 });
  }
}
