// Fake identities used only by isolated tests; never production configuration.
export const ownerConfiguration = { operatorId: "fixture-owner-operator", sitterId: "fixture-owner-sitter" };
export function ownerFixtureUser(id) {
  if (id === ownerConfiguration.operatorId) return { id, role: "OPERATOR" };
  if (id === ownerConfiguration.sitterId) return { id, role: "SITTER" };
  return null;
}
