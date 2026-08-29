import "server-only";

import { prisma } from "../db.js";
import {
  createSitterReferralCode as createSitterReferralCodeWithDb,
  revokeSitterReferralCode as revokeSitterReferralCodeWithDb,
  rotateSitterReferralCode as rotateSitterReferralCodeWithDb,
  verifySitterReferralCode as verifySitterReferralCodeWithDb,
} from "./sitterReferralCodeWrites.js";
import { resolveClientOriginWriteIntentFromReferralCode as resolveClientOriginWriteIntentFromReferralCodeWithDb } from "./referralAttributionWrites.js";

export function createSitterReferralCode(input) {
  return createSitterReferralCodeWithDb({ db: prisma, ...input });
}

export function verifySitterReferralCode(publicCode) {
  return verifySitterReferralCodeWithDb({ db: prisma, publicCode });
}

export function revokeSitterReferralCode(input) {
  return revokeSitterReferralCodeWithDb({ db: prisma, ...input });
}

export function rotateSitterReferralCode(input) {
  return rotateSitterReferralCodeWithDb({ db: prisma, ...input });
}

export function resolveClientOriginWriteIntentFromReferralCode(input) {
  return resolveClientOriginWriteIntentFromReferralCodeWithDb({
    db: prisma,
    ...input,
  });
}
