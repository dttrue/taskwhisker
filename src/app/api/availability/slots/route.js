// src/app/api/availability/slots/route.js
import { NextResponse } from "next/server";
import { getAvailableTimesForDate } from "@/lib/calendar/getAvailableTimesForDate";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const sitterId = searchParams.get("sitterId");
    const date = searchParams.get("date");
    const durationMinutes = Number(
      searchParams.get("durationMinutes") || searchParams.get("duration") || 30
    );
    const bufferMinutes = Number(
      searchParams.get("bufferMinutes") || searchParams.get("buffer") || 15
    );

    if (!sitterId || !date) {
      return NextResponse.json(
        { ok: false, error: "missing_sitter_or_date" },
        { status: 400 }
      );
    }

    const result = await getAvailableTimesForDate({
      sitterId,
      date,
      durationMinutes,
      bufferMinutes,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("availability slots error:", error);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 }
    );
  }
}
