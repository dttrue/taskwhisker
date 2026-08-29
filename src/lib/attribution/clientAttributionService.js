import "server-only";

import { prisma } from "../db.js";
import {
  correctClientOrigin as correctClientOriginWithDb,
  createBookingAttributionSnapshot as createBookingAttributionSnapshotWithDb,
  createOrVerifyClientOrigin as createOrVerifyClientOriginWithDb,
  findClientIdentity as findClientIdentityWithDb,
  resolveClientOriginWriteIntent as resolveClientOriginWriteIntentWithDb,
  resolveRequestedSitter as resolveRequestedSitterWithDb,
} from "./clientAttributionWrites.js";

export function findClientIdentity(input) {
  return findClientIdentityWithDb({ db: prisma, ...input });
}

export function resolveClientOriginWriteIntent(input) {
  return resolveClientOriginWriteIntentWithDb({ db: prisma, ...input });
}

export function createOrVerifyClientOrigin(input) {
  return createOrVerifyClientOriginWithDb({ db: prisma, ...input });
}

export function correctClientOrigin(input) {
  return correctClientOriginWithDb({ db: prisma, ...input });
}

export function resolveRequestedSitter(input) {
  return resolveRequestedSitterWithDb({ db: prisma, ...input });
}

export function createBookingAttributionSnapshot(input) {
  return createBookingAttributionSnapshotWithDb({ db: prisma, ...input });
}
