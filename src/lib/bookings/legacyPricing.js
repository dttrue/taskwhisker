// The active Service contract: a price per visit plus explicitly selected extras.
// Preserve the public writer's existing 10% split and rounding.
export function legacyBookingPrice(pricePerVisitCents, visitsCount, addOns = []) {
  const baseServiceTotalCents = pricePerVisitCents * visitsCount;
  const clientTotalCents = baseServiceTotalCents + addOns.reduce((sum, item) => sum + item.totalPriceCents, 0);
  const platformFeeCents = Math.round(clientTotalCents * 0.1);
  return { baseServiceTotalCents, clientTotalCents, platformFeeCents, sitterPayoutCents: clientTotalCents - platformFeeCents };
}
