import { compensationFixture } from "../compensation/fixtures.js";
import { captureCareInstructions } from "./contract.js";
export async function participantFixture(text = 'Feeding: one bowl.\nMedication: follow the provided label.\nRoutine: short walk.') {
  const f = compensationFixture({ quantity: 2 }); await f.commit();
  const b = Object.assign(f.state.booking, { rewardReservation: null, ...captureCareInstructions(text),
    client: { name: 'Client', phone: '555', email: 'PRIVATE' }, notes: 'PRIVATE', history: 'PRIVATE', conversation: 'PRIVATE',
    petNames: ['Milo'], serviceSummary: 'Drop-in', serviceLat: 40, serviceLng: -74 });
  const v = b.visits[1], a = v.compensationAuthorizations[0];
  v.sitterId = 'bob'; v.sitter = { name: 'Bob' };
  v.compensationAuthorizations.push({ ...a, id: 'replacement', revision: 2, predecessorId: a.id, sitterId: 'bob', compensationLane: 'BUSINESS_ASSIGNED', rateSource: 'DEFAULT_RATE', sourceRateId: 'rate', rateVersion: 1, sitterBaseCents: 2000, sitterPetCents: 0, sitterCompensationSubtotalCents: 2000, sitterFeeCents: 200, sitterPayoutCents: 1800, reason: 'handoff', operationId: 'handoff' });
  return b;
}
