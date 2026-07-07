// src/lib/blocklist/checkBlockedClient.js

import { prisma } from "@/lib/db";
import {
  normalizeBlockedClientInput,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  normalizePostalCode,
} from "./normalizeBlockedClientInput";

function normalizeBlockedRecord(record) {
  return {
    id: record.id,
    name: normalizeText(record.name),
    email: normalizeEmail(record.email),
    phone: normalizePhone(record.phone),
    addressLine1: normalizeText(record.addressLine1),
    addressLine2: normalizeText(record.addressLine2),
    city: normalizeText(record.city),
    state: normalizeText(record.state),
    postalCode: normalizePostalCode(record.postalCode),
    reason: record.reason || null,
  };
}

function hasEmailMatch(input, blocked) {
  return Boolean(input.email && blocked.email && input.email === blocked.email);
}

function hasPhoneMatch(input, blocked) {
  return Boolean(input.phone && blocked.phone && input.phone === blocked.phone);
}

function hasAddressMatch(input, blocked) {
  return Boolean(
    input.addressLine1 &&
      input.postalCode &&
      blocked.addressLine1 &&
      blocked.postalCode &&
      input.addressLine1 === blocked.addressLine1 &&
      input.postalCode === blocked.postalCode
  );
}

function hasNameAndLocationMatch(input, blocked) {
  return Boolean(
    input.name &&
      input.postalCode &&
      blocked.name &&
      blocked.postalCode &&
      input.name === blocked.name &&
      input.postalCode === blocked.postalCode
  );
}

export async function checkBlockedClient(input = {}) {
  const normalizedInput = normalizeBlockedClientInput(input);

  const possibleMatches = await prisma.blockedClient.findMany({
    where: {
      isActive: true,
      OR: [
        normalizedInput.email
          ? {
              email: {
                equals: normalizedInput.email,
                mode: "insensitive",
              },
            }
          : undefined,
        normalizedInput.phone
          ? {
              phone: {
                contains: normalizedInput.phone,
              },
            }
          : undefined,
        normalizedInput.postalCode
          ? {
              postalCode: {
                equals: normalizedInput.postalCode,
                mode: "insensitive",
              },
            }
          : undefined,
        normalizedInput.name
          ? {
              name: {
                equals: normalizedInput.name,
                mode: "insensitive",
              },
            }
          : undefined,
      ].filter(Boolean),
    },
  });

  for (const record of possibleMatches) {
    const blocked = normalizeBlockedRecord(record);

    if (hasEmailMatch(normalizedInput, blocked)) {
      return {
        blocked: true,
        matchType: "EMAIL",
        blockedClientId: record.id,
      };
    }

    if (hasPhoneMatch(normalizedInput, blocked)) {
      return {
        blocked: true,
        matchType: "PHONE",
        blockedClientId: record.id,
      };
    }

    if (hasAddressMatch(normalizedInput, blocked)) {
      return {
        blocked: true,
        matchType: "ADDRESS",
        blockedClientId: record.id,
      };
    }

    if (hasNameAndLocationMatch(normalizedInput, blocked)) {
      return {
        blocked: true,
        matchType: "NAME_AND_POSTAL_CODE",
        blockedClientId: record.id,
      };
    }
  }

  return {
    blocked: false,
    matchType: null,
    blockedClientId: null,
  };
}
