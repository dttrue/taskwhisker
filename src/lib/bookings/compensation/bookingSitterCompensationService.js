import "server-only";
import { prisma } from "../../db.js";
import { commitBookingSitterCompensationWithDb } from "./commitBookingSitterCompensation.js";

// Internal service, deliberately unwired to public actions and booking activation.
export function commitBookingSitterCompensation({ bookingId } = {}) {
  return commitBookingSitterCompensationWithDb({ db: prisma, bookingId });
}
