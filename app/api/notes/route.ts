import { NextResponse } from "next/server";
import { createNote, getNotesByTag, getRecentNotes, searchNotes } from "@/lib/store";

/**
 * Lists notes by query/tag filters or recent notes when no filters are set.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = (url.searchParams.get("query") ?? "").trim();
  const tag = (url.searchParams.get("tag") ?? "").trim();

  try {
    if (query) {
      const notes = await searchNotes(query);
      if (tag) {
        return NextResponse.json(
          notes.filter((note) =>
            note.tags.some((noteTag) => noteTag.name.toLowerCase() === tag.toLowerCase())
          )
        );
      }

      return NextResponse.json(notes);
    }

    if (tag) {
      return NextResponse.json(await getNotesByTag(tag));
    }

    return NextResponse.json(await getRecentNotes());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch notes" },
      { status: 500 }
    );
  }
}

/**
 * Creates a new note from the provided title/content payload.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { title?: string; content?: string };
    const id = await createNote(body.title ?? "", body.content ?? "");
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create note" },
      { status: 400 }
    );
  }
}
