// src/app/dashboard/operator/blocked-clients/actions.js
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import {
  normalizeEmail,
  normalizePhone,
  normalizeText,
  normalizePostalCode,
} from "@/lib/blocklist/normalizeBlockedClientInput";

const BLOCKED_CLIENTS_PATH = "/dashboard/operator/blocked-clients";

export async function createBlockedClient(formData) {
  const session = await requireRole(["OPERATOR"]);
  const operatorId = session.user?.id;

  if (!operatorId) {
    return {
      ok: false,
      error: "You must be signed in as an operator.",
    };
  }

  const name = normalizeText(formData.get("name"));
  const email = normalizeEmail(formData.get("email"));
  const phone = normalizePhone(formData.get("phone"));
  const addressLine1 = normalizeText(formData.get("addressLine1"));
  const addressLine2 = normalizeText(formData.get("addressLine2"));
  const city = normalizeText(formData.get("city"));
  const state = normalizeText(formData.get("state"));
  const postalCode = normalizePostalCode(formData.get("postalCode"));
  const reason = String(formData.get("reason") || "").trim();

  const hasStrongIdentifier = Boolean(
    email || phone || (addressLine1 && postalCode)
  );

  if (!hasStrongIdentifier) {
    return {
      ok: false,
      error:
        "Add at least an email, phone number, or address with ZIP code before blocking a client.",
    };
  }

  await prisma.blockedClient.create({
    data: {
      name: name || null,
      email: email || null,
      phone: phone || null,
      addressLine1: addressLine1 || null,
      addressLine2: addressLine2 || null,
      city: city || null,
      state: state || null,
      postalCode: postalCode || null,
      reason: reason || null,
      isActive: true,
      createdByUserId: operatorId,
    },
  });

  revalidatePath(BLOCKED_CLIENTS_PATH);

  return {
    ok: true,
  };
}

export async function deactivateBlockedClient(formData) {
  await requireRole(["OPERATOR"]);

  const blockedClientId = String(formData.get("blockedClientId") || "");

  if (!blockedClientId) {
    return {
      ok: false,
      error: "Missing blocked client ID.",
    };
  }

  await prisma.blockedClient.update({
    where: {
      id: blockedClientId,
    },
    data: {
      isActive: false,
    },
  });

  revalidatePath(BLOCKED_CLIENTS_PATH);

  return {
    ok: true,
  };
}

export async function reactivateBlockedClient(formData) {
  await requireRole(["OPERATOR"]);

  const blockedClientId = String(formData.get("blockedClientId") || "");

  if (!blockedClientId) {
    return {
      ok: false,
      error: "Missing blocked client ID.",
    };
  }

  await prisma.blockedClient.update({
    where: {
      id: blockedClientId,
    },
    data: {
      isActive: true,
    },
  });

  revalidatePath(BLOCKED_CLIENTS_PATH);

  return {
    ok: true,
  };
}
