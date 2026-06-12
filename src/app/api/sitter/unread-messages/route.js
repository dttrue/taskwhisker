// src/app/api/sitter/unread-messages/route.js
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getUnreadMessageCountForSitter } from "@/lib/messaging/getUnreadMessageCountForSitter";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
};

export async function GET() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json(
      { count: 0 },
      {
        status: 401,
        headers: NO_STORE_HEADERS,
      }
    );
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
    return NextResponse.json(
      { count: 0 },
      {
        status: 403,
        headers: NO_STORE_HEADERS,
      }
    );
  }

  const count = await getUnreadMessageCountForSitter({
    sitterId: sitter.id,
  });

  return NextResponse.json(
    { count },
    {
      headers: NO_STORE_HEADERS,
    }
  );
}
