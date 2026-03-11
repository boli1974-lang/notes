import { NextResponse } from "next/server";
import {
  listImagesByNoteId,
  uploadImage,
  IMAGE_LIMIT_REACHED,
  IMAGE_NOT_FOUND,
  IMAGE_TOO_LARGE,
  IMAGE_TYPE_NOT_ALLOWED,
  MAX_IMAGE_SIZE_BYTES,
  NOTE_NOT_FOUND,
} from "@/lib/services/noteImageService";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: noteId } = await context.params;
    if (!isUuid(noteId)) {
      return badRequest("id must be a valid UUID.");
    }
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? undefined;

    const images = await listImagesByNoteId(noteId, userId);
    return NextResponse.json({ data: images });
  } catch (error) {
    if (error instanceof Error && error.message === NOTE_NOT_FOUND) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to list images." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: noteId } = await context.params;
    if (!isUuid(noteId)) {
      return badRequest("id must be a valid UUID.");
    }
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return badRequest("A single file is required (field name: file).");
    }
    const userId = (formData.get("userId") as string) || undefined;

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";
    const sizeBytes = file.size;
    const fileName = file.name || "image";

    if (sizeBytes > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Image too large.", code: IMAGE_TOO_LARGE },
        { status: 400 },
      );
    }

    const image = await uploadImage(
      noteId,
      { buffer, fileName, contentType, sizeBytes },
      userId,
    );
    return NextResponse.json({ data: image }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === NOTE_NOT_FOUND) {
        return NextResponse.json({ error: "Note not found." }, { status: 404 });
      }
      if (error.message === IMAGE_LIMIT_REACHED) {
        return NextResponse.json(
          { error: "Image limit reached (max 5 per note).", code: IMAGE_LIMIT_REACHED },
          { status: 400 },
        );
      }
      if (error.message === IMAGE_TYPE_NOT_ALLOWED) {
        return NextResponse.json(
          { error: "Image type not allowed. Use JPEG, PNG, or WebP.", code: IMAGE_TYPE_NOT_ALLOWED },
          { status: 400 },
        );
      }
      if (error.message === IMAGE_TOO_LARGE) {
        return NextResponse.json(
          { error: "Image too large (max 5MB).", code: IMAGE_TOO_LARGE },
          { status: 400 },
        );
      }
    }
    return NextResponse.json({ error: "Failed to upload image." }, { status: 500 });
  }
}
