import { NextResponse } from "next/server";
import { createNote, listNotes } from "@/lib/services/noteService";

type NoteCreateBody = {
  title?: string | null;
  content?: unknown;
  userId?: unknown;
};

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
}

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);

    const sortByRaw = searchParams.get("sortBy");
    if (sortByRaw && sortByRaw !== "createdAt" && sortByRaw !== "updatedAt") {
      return badRequest("sortBy must be either 'createdAt' or 'updatedAt'.");
    }
    const sortBy = sortByRaw === "createdAt" || sortByRaw === "updatedAt" ? sortByRaw : undefined;

    const sortOrderRaw = searchParams.get("sortOrder");
    if (sortOrderRaw && sortOrderRaw !== "asc" && sortOrderRaw !== "desc") {
      return badRequest("sortOrder must be either 'asc' or 'desc'.");
    }
    const sortOrder = sortOrderRaw === "asc" || sortOrderRaw === "desc" ? sortOrderRaw : undefined;

    const take = parsePositiveInt(searchParams.get("take"));
    if (searchParams.get("take") && take === undefined) {
      return badRequest("take must be a non-negative integer.");
    }

    const skip = parsePositiveInt(searchParams.get("skip"));
    if (searchParams.get("skip") && skip === undefined) {
      return badRequest("skip must be a non-negative integer.");
    }

    const includeDeletedRaw = searchParams.get("includeDeleted");
    const includeDeleted =
      includeDeletedRaw === "true" ? true : includeDeletedRaw === "false" ? false : undefined;
    if (includeDeletedRaw && includeDeleted === undefined) {
      return badRequest("includeDeleted must be either 'true' or 'false'.");
    }

    const notes = await listNotes({
      userId: searchParams.get("userId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      sortBy,
      sortOrder,
      take,
      skip,
      includeDeleted,
    });

    return NextResponse.json({ data: notes });
  } catch {
    return NextResponse.json({ error: "Failed to list notes." }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as NoteCreateBody;
    const { title, content, userId } = body;

    if (typeof content !== "string" || content.trim().length === 0) {
      return badRequest("content is required and must be a non-empty string.");
    }
    if (content.length > 20000) {
      return badRequest("content must be at most 20000 characters.");
    }

    if (title !== undefined && title !== null && typeof title !== "string") {
      return badRequest("title must be a string or null.");
    }
    if (typeof title === "string" && title.length > 120) {
      return badRequest("title must be at most 120 characters.");
    }

    if (userId !== undefined && typeof userId !== "string") {
      return badRequest("userId must be a string when provided.");
    }

    const note = await createNote(
      {
        title: title ?? null,
        content,
      },
      userId,
    );

    return NextResponse.json({ data: note }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create note." }, { status: 500 });
  }
}
