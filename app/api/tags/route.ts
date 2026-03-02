import { NextResponse } from "next/server";
import { getAllTags } from "@/lib/store";

/**
 * Returns all tags for sidebar/filter UI usage.
 */
export async function GET(): Promise<Response> {
  try {
    return NextResponse.json(await getAllTags());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch tags" },
      { status: 500 }
    );
  }
}
