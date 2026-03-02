import { NextResponse } from "next/server";
import { setNoteTags } from "@/lib/store";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Replaces all tags on a given note by route ID.
 */
export async function PUT(request: Request, { params }: Params): Promise<Response> {
  try {
    const { id } = await params;
    const noteId = Number(id);

    if (!Number.isInteger(noteId)) {
      return NextResponse.json({ error: "Invalid note ID" }, { status: 400 });
    }

    const body = (await request.json()) as { tagNames?: string[] };
    await setNoteTags(noteId, Array.isArray(body.tagNames) ? body.tagNames : []);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to set note tags" },
      { status: 400 }
    );
  }
}
