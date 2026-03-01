import { NextResponse } from "next/server";
import { markNoteReviewed } from "@/lib/services/reviewService";

type MarkReviewedBody = {
  noteId?: unknown;
  userId?: unknown;
  reviewedAt?: unknown;
};

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as MarkReviewedBody;

    if (typeof body.noteId !== "string" || !isUuid(body.noteId)) {
      return badRequest("noteId is required and must be a valid UUID.");
    }
    if (body.userId !== undefined && typeof body.userId !== "string") {
      return badRequest("userId must be a string when provided.");
    }

    let reviewedAt: Date | undefined;
    if (body.reviewedAt !== undefined) {
      if (typeof body.reviewedAt !== "string") {
        return badRequest("reviewedAt must be an ISO datetime string.");
      }
      reviewedAt = new Date(body.reviewedAt);
      if (Number.isNaN(reviewedAt.getTime())) {
        return badRequest("reviewedAt must be a valid ISO datetime.");
      }
    }

    const event = await markNoteReviewed(body.noteId, body.userId, reviewedAt ?? new Date());
    return NextResponse.json({ data: event }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to mark note reviewed." }, { status: 500 });
  }
}
