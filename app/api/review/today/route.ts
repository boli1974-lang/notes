import { NextResponse } from "next/server";
import { getOrCreateTodayBatch, listReviewedNoteIdsForDate } from "@/lib/services/reviewService";

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? undefined;

    const batchSizeRaw = searchParams.get("batchSize");
    let batchSize: number | undefined;
    if (batchSizeRaw) {
      const parsed = Number.parseInt(batchSizeRaw, 10);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 100) {
        return badRequest("batchSize must be an integer between 1 and 100.");
      }
      batchSize = parsed;
    }

    const nowRaw = searchParams.get("now");
    let now: Date | undefined;
    if (nowRaw) {
      now = new Date(nowRaw);
      if (Number.isNaN(now.getTime())) {
        return badRequest("now must be a valid ISO datetime.");
      }
    }

    const batch = await getOrCreateTodayBatch({ userId, batchSize, now });
    const reviewedNoteIds = await listReviewedNoteIdsForDate(
      batch.reviewDate,
      userId,
      batch.notes.map((item) => item.note.id),
    );

    return NextResponse.json({
      data: {
        ...batch,
        reviewedNoteIds,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch review batch." }, { status: 500 });
  }
}
