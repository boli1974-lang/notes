import { NextResponse } from "next/server";
import { deleteImage, IMAGE_NOT_FOUND } from "@/lib/services/noteImageService";

type RouteContext = {
  params: Promise<{ id: string; imageId: string }>;
};

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: noteId, imageId } = await context.params;
    if (!isUuid(noteId) || !isUuid(imageId)) {
      return badRequest("id and imageId must be valid UUIDs.");
    }
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? undefined;

    await deleteImage(imageId, userId);
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    if (error instanceof Error && error.message === IMAGE_NOT_FOUND) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete image." }, { status: 500 });
  }
}
