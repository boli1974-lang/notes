import { NextResponse } from "next/server";
import { deleteUnusedTag } from "@/lib/services/tagService";

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

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) {
      return badRequest("id must be a valid UUID.");
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? undefined;

    await deleteUnusedTag(id, userId);
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "TAG_NOT_FOUND") {
        return NextResponse.json({ error: "Tag not found." }, { status: 404 });
      }
      if (error.message === "TAG_IN_USE") {
        return NextResponse.json({ error: "Tag is in use and cannot be deleted." }, { status: 409 });
      }
    }
    return NextResponse.json({ error: "Failed to delete tag." }, { status: 500 });
  }
}
