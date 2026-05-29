// src/app/api/sitter/unread-messages/route.js
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getUnreadMessageCountForSitter } from "@/lib/messaging/getUnreadMessageCountForSitter";

export async function GET() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ count: 0 }, { status: 401 });
  }

  const sitter = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!sitter || sitter.role !== "SITTER") {
    return NextResponse.json({ count: 0 }, { status: 403 });
  }

  const count = await getUnreadMessageCountForSitter({
    sitterId: sitter.id,
  });

  return NextResponse.json(
    { count },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
