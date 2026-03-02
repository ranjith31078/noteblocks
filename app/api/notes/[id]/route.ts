import { NextResponse } from "next/server";
import { deleteNote, updateNote } from "@/lib/store";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Updates a single note by route ID.
 */
export async function PUT(request: Request, { params }: Params): Promise<Response> {
  try {
    const { id } = await params;
    const noteId = Number(id);

    if (!Number.isInteger(noteId)) {
      return NextResponse.json({ error: "Invalid note ID" }, { status: 400 });
    }

    const body = (await request.json()) as { title?: string; content?: string };
    await updateNote(noteId, body.title ?? "", body.content ?? "");

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update note" },
      { status: 400 }
    );
  }
}

/**
 * Deletes a single note by route ID.
 */
export async function DELETE(_request: Request, { params }: Params): Promise<Response> {
  try {
    const { id } = await params;
    const noteId = Number(id);

    if (!Number.isInteger(noteId)) {
      return NextResponse.json({ error: "Invalid note ID" }, { status: 400 });
    }

    await deleteNote(noteId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete note" },
      { status: 500 }
    );
  }
}
