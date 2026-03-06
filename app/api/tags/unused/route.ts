import { NextResponse } from "next/server";
import { listUnusedTags } from "@/lib/services/tagService";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? undefined;

    const tags = await listUnusedTags(userId);
    return NextResponse.json({ data: tags });
  } catch {
    return NextResponse.json({ error: "Failed to list unused tags." }, { status: 500 });
  }
}
