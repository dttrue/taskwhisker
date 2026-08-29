import { resolveClientOriginWriteIntent } from "../attribution/clientAttributionWrites.js";
import { verifySitterReferralCode } from "./sitterReferralCodeWrites.js";

export async function resolveClientOriginWriteIntentFromReferralCode({
  db,
  email,
  phone,
  publicReferralCode = null,
}) {
  const verifiedReferral =
    publicReferralCode == null
      ? null
      : await verifySitterReferralCode({
          db,
          publicCode: publicReferralCode,
        });

  return resolveClientOriginWriteIntent({
    db,
    email,
    phone,
    verifiedReferral,
  });
}
