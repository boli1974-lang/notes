import { NextResponse } from "next/server";
import { createTag, listTags, listTagsWithCounts } from "@/lib/services/tagService";

type CreateTagBody = {
  name?: unknown;
  userId?: unknown;
};

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? undefined;
    const includeCountsRaw = searchParams.get("includeCounts");
    const includeCounts =
      includeCountsRaw === "true" ? true : includeCountsRaw === "false" ? false : undefined;
    if (includeCountsRaw && includeCounts === undefined) {
      return badRequest("includeCounts must be either 'true' or 'false'.");
    }

    const tags = includeCounts ? await listTagsWithCounts(userId) : await listTags(userId);
    return NextResponse.json({ data: tags });
  } catch {
    return NextResponse.json({ error: "Failed to list tags." }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as CreateTagBody;

    if (typeof body.name !== "string") {
      return badRequest("name is required and must be a string.");
    }
    if (body.userId !== undefined && typeof body.userId !== "string") {
      return badRequest("userId must be a string when provided.");
    }

    const tag = await createTag(body.name, body.userId);
    return NextResponse.json({ data: tag }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVALID_TAG_NAME") {
        return badRequest("name must not be empty.");
      }
      if (error.message === "TAG_NAME_TOO_LONG") {
        return badRequest("name must be at most 30 characters after normalization.");
      }
    }
    return NextResponse.json({ error: "Failed to create tag." }, { status: 500 });
  }
}
