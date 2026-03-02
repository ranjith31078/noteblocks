import { NextResponse } from "next/server";
import { getNoteColumns, setNoteColumns } from "@/lib/store";

/**
 * Reads the persisted note column layout preference.
 */
export async function GET(): Promise<Response> {
  try {
    return NextResponse.json({ value: await getNoteColumns() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get note columns" },
      { status: 500 }
    );
  }
}

/**
 * Updates the persisted note column layout preference.
 */
export async function PUT(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { value?: number };
    const value = Number(body.value);

    if (value !== 1 && value !== 2) {
      return NextResponse.json({ error: "Invalid note column value" }, { status: 400 });
    }

    await setNoteColumns(value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to set note columns" },
      { status: 500 }
    );
  }
}