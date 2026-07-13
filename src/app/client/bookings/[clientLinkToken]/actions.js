// src/app/client/bookings/[clientLinkToken]/actions.js
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createSystemMessage } from "@/lib/messaging/createSystemMessage";

function formatTimeInputForDisplay(value) {
  if (!value) return "—";

  const [hourString, minuteString] = String(value).split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return value;
  }

  const date = new Date();
  date.setHours(hour, minute, 0, 0);

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateInputForDisplay(value) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function requestClientBookingCancellation(formData) {
  const clientLinkToken = String(formData.get("clientLinkToken") || "");
  const reason = String(formData.get("reason") || "").trim();

  if (!clientLinkToken) {
    return {
      ok: false,
      error: "Missing booking token.",
    };
  }

  if (!reason) {
    return {
      ok: false,
      error: "Please include a cancellation reason.",
    };
  }

  if (reason.length > 1000) {
    return {
      ok: false,
      error: "Cancellation reason must be under 1000 characters.",
    };
  }

  const booking = await prisma.booking.findUnique({
    where: {
      clientLinkToken,
    },
    include: {
      client: true,
      sitter: true,
    },
  });

  if (!booking) {
    return {
      ok: false,
      error: "Booking not found.",
    };
  }

  if (booking.status === "CANCELED") {
    return {
      ok: false,
      error: "This booking is already canceled.",
    };
  }

  if (booking.status === "COMPLETED") {
    return {
      ok: false,
      error: "Completed bookings cannot be canceled from this page.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.bookingHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: booking.status,
        changedByUserId: null,
        note: `Client requested cancellation. Reason: ${reason}`,
      },
    });

    const conversation = await tx.conversation.findFirst({
      where: {
        bookingId: booking.id,
      },
      select: {
        id: true,
      },
    });

    if (conversation) {
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderType: "CLIENT",
          messageType: "TEXT",
          body: `Cancellation request:\n\n${reason}`,
        },
      });
    } else {
      await createSystemMessage({
        tx,
        bookingId: booking.id,
        body: `Client requested cancellation.\n\nReason: ${reason}`,
      });
    }
  });

  revalidatePath(`/client/bookings/${clientLinkToken}`);
  revalidatePath(`/client/bookings/${clientLinkToken}/messages`);
  revalidatePath(`/dashboard/sitter/messages/${booking.id}`);
  revalidatePath("/dashboard/sitter/messages");

  return {
    ok: true,
  };
}

export async function requestClientScheduleChange(formData) {
  const clientLinkToken = String(formData.get("clientLinkToken") || "");
  const visitId = String(formData.get("visitId") || "");
  const requestedDate = String(formData.get("requestedDate") || "").trim();

  const requestedStartTime = String(
    formData.get("requestedStartTime") || ""
  ).trim();

  const requestedEndTime = String(
    formData.get("requestedEndTime") || ""
  ).trim();

  const reason = String(formData.get("reason") || "").trim();

  if (!clientLinkToken) {
    return {
      ok: false,
      error: "Missing booking token.",
    };
  }

  if (!visitId) {
    return {
      ok: false,
      error: "Please choose which visit you want to change.",
    };
  }

  if (!requestedDate) {
    return {
      ok: false,
      error: "Please choose the date you want to move to.",
    };
  }

  if (!requestedStartTime || !requestedEndTime) {
    return {
      ok: false,
      error: "Please include the requested start and end time.",
    };
  }

  if (requestedStartTime >= requestedEndTime) {
    return {
      ok: false,
      error: "End time must be after start time.",
    };
  }

  if (!reason) {
    return {
      ok: false,
      error: "Please include a reason for the schedule change.",
    };
  }

  if (reason.length > 1000) {
    return {
      ok: false,
      error: "Schedule change reason must be under 1000 characters.",
    };
  }

  const requestedDateLabel = formatDateInputForDisplay(requestedDate);
  const requestedStartTimeLabel = formatTimeInputForDisplay(requestedStartTime);
  const requestedEndTimeLabel = formatTimeInputForDisplay(requestedEndTime);

  const booking = await prisma.booking.findUnique({
    where: {
      clientLinkToken,
    },
    include: {
      client: true,
      sitter: true,
      visits: true,
    },
  });

  if (!booking) {
    return {
      ok: false,
      error: "Booking not found.",
    };
  }

  if (booking.status === "CANCELED") {
    return {
      ok: false,
      error: "Canceled bookings cannot be rescheduled.",
    };
  }

  if (booking.status === "COMPLETED") {
    return {
      ok: false,
      error: "Completed bookings cannot be rescheduled.",
    };
  }

  const visit = booking.visits.find((item) => item.id === visitId);

  if (!visit) {
    return {
      ok: false,
      error: "Selected visit was not found for this booking.",
    };
  }

  if (visit.status === "CANCELED") {
    return {
      ok: false,
      error: "Canceled visits cannot be rescheduled.",
    };
  }

  if (visit.status === "COMPLETED") {
    return {
      ok: false,
      error: "Completed visits cannot be rescheduled.",
    };
  }

  const currentStart = new Date(visit.startTime);
  const currentEnd = new Date(visit.endTime);

  const currentDateLabel = currentStart.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const currentStartLabel = currentStart.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const currentEndLabel = currentEnd.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const requestBody = [
    "Schedule change request:",
    "",
    "Current visit:",
    `${currentDateLabel}, ${currentStartLabel}–${currentEndLabel}`,
    "",
    "Requested change:",
    `Date: ${requestedDateLabel}`,
    `Time: ${requestedStartTimeLabel}–${requestedEndTimeLabel}`,
    "",
    `Reason: ${reason}`,
    "",
    `Visit ID: ${visit.id}`,
  ].join("\n");

  await prisma.$transaction(async (tx) => {
    await tx.bookingHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: booking.status,
        changedByUserId: null,
        note: `Client requested schedule change for visit ${visit.id}. Requested date: ${requestedDateLabel}. Requested time: ${requestedStartTimeLabel}–${requestedEndTimeLabel}. Reason: ${reason}`,
      },
    });

    const conversation = await tx.conversation.findFirst({
      where: {
        bookingId: booking.id,
      },
      select: {
        id: true,
      },
    });

    if (conversation) {
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderType: "CLIENT",
          messageType: "TEXT",
          body: requestBody,
        },
      });
    } else {
      await createSystemMessage({
        tx,
        bookingId: booking.id,
        body: requestBody,
      });
    }
  });

  revalidatePath(`/client/bookings/${clientLinkToken}`);
  revalidatePath(`/client/bookings/${clientLinkToken}/messages`);
  revalidatePath(`/dashboard/sitter/messages/${booking.id}`);
  revalidatePath("/dashboard/sitter/messages");
  revalidatePath("/dashboard/sitter");

  return {
    ok: true,
  };
}
