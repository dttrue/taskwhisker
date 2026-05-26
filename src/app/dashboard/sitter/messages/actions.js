// src/app/dashboard/sitter/messages/actions.js
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function sendSitterBookingMessage(formData) {
  const bookingId = String(formData.get("bookingId") || "");
  const body = String(formData.get("body") || "").trim();

  if (!bookingId) {
    throw new Error("bookingId is required.");
  }

  if (!body) {
    throw new Error("Message cannot be empty.");
  }

  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login");
  }

  const sitter = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
  });

  if (!sitter) {
    redirect("/login");
  }

  if (sitter.role !== "SITTER") {
    redirect("/dashboard/operator");
  }

  const booking = await prisma.booking.findUnique({
    where: {
      id: bookingId,
    },
    select: {
      id: true,
      sitterId: true,
    },
  });

  if (!booking) {
    throw new Error("Booking not found.");
  }

  if (booking.sitterId !== sitter.id) {
    throw new Error("You do not have permission to message this client.");
  }

  const conversation = await prisma.conversation.upsert({
    where: {
      bookingId,
    },
    update: {},
    create: {
      bookingId,
    },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderUserId: sitter.id,
      senderType: "SITTER",
      messageType: "TEXT",
      body,
    },
  });

  revalidatePath(`/dashboard/sitter/messages/${bookingId}`);
  revalidatePath(`/dashboard/sitter/messages`);
  revalidatePath(`/dashboard/messages/${bookingId}`);
}
