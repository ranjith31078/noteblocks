import { NextResponse } from "next/server";
import { getFontSize, setFontSize } from "@/lib/store";

/**
 * Reads the persisted font size preference.
 */
export async function GET(): Promise<Response> {
  try {
    return NextResponse.json({ value: await getFontSize() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get font size" },
      { status: 500 }
    );
  }
}

/**
 * Updates the persisted font size preference.
 */
export async function PUT(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { value?: number };
    const value = Number(body.value);

    if (!Number.isFinite(value)) {
      return NextResponse.json({ error: "Invalid font size" }, { status: 400 });
    }

    await setFontSize(value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to set font size" },
      { status: 500 }
    );
  }
}
