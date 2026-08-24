export const CLIENT_FEE_BPS = 1000;
export const SITTER_FEE_BPS = 1000;

// Prisma Int fields use signed 32-bit storage. Keeping every result within this
// range also keeps the basis-point multiplication safely inside JS safe integers.
export const MAX_MONEY_CENTS = 2_147_483_647;
export const MAX_BASIS_POINTS = 10_000;

function assertMoneyCents(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_MONEY_CENTS) {
    throw new RangeError(
      `${label} must be a non-negative integer no greater than ${MAX_MONEY_CENTS}.`,
    );
  }
}

function assertBasisPoints(basisPoints) {
  if (
    !Number.isInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > MAX_BASIS_POINTS
  ) {
    throw new RangeError(
      `basisPoints must be an integer between 0 and ${MAX_BASIS_POINTS}.`,
    );
  }
}

function assertMoneyResult(value, label) {
  if (!Number.isSafeInteger(value) || value > MAX_MONEY_CENTS) {
    throw new RangeError(`${label} exceeds the supported monetary range.`);
  }
}

// Fees are rounded once, half up, on an aggregated integer-cent subtotal.
export function calculatePercentageFeeCents(amountCents, basisPoints) {
  assertMoneyCents(amountCents, "amountCents");
  assertBasisPoints(basisPoints);

  const feeCents = Math.floor(
    (amountCents * basisPoints + MAX_BASIS_POINTS / 2) / MAX_BASIS_POINTS,
  );
  assertMoneyResult(feeCents, "feeCents");
  return feeCents;
}

export function calculateClientEconomics(serviceSubtotalCents) {
  assertMoneyCents(serviceSubtotalCents, "serviceSubtotalCents");

  const clientFeeCents = calculatePercentageFeeCents(
    serviceSubtotalCents,
    CLIENT_FEE_BPS,
  );
  const clientTotalCents = serviceSubtotalCents + clientFeeCents;
  assertMoneyResult(clientTotalCents, "clientTotalCents");

  return {
    serviceSubtotalCents,
    clientFeeCents,
    clientTotalCents,
  };
}

export function calculateSitterEconomics(sitterCompensationSubtotalCents) {
  assertMoneyCents(
    sitterCompensationSubtotalCents,
    "sitterCompensationSubtotalCents",
  );

  const sitterFeeCents = calculatePercentageFeeCents(
    sitterCompensationSubtotalCents,
    SITTER_FEE_BPS,
  );
  const sitterPayoutCents =
    sitterCompensationSubtotalCents - sitterFeeCents;

  return {
    sitterCompensationSubtotalCents,
    sitterFeeCents,
    sitterPayoutCents,
  };
}

export function calculatePlatformRevenueCents(
  clientFeeCents,
  sitterFeeCents,
) {
  assertMoneyCents(clientFeeCents, "clientFeeCents");
  assertMoneyCents(sitterFeeCents, "sitterFeeCents");

  const platformRevenueCents = clientFeeCents + sitterFeeCents;
  assertMoneyResult(platformRevenueCents, "platformRevenueCents");
  return platformRevenueCents;
}
