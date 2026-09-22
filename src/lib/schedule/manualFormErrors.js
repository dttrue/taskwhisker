// Local recovery keys describe rendered controls, not trusted server validation.
const addressFields = ["addressLine1", "addressLine2", "city", "state", "postalCode"];
export const hasAddressError = (errors) => addressFields.some((key) => errors[`client.${key}`]);
export const hasExtrasError = (errors) => Object.keys(errors).some((key) => key === "extras" || key.startsWith("extra:"));

export function displayFieldErrors(errors = {}, extras = []) {
  return Object.fromEntries(Object.entries(errors).map(([key, message]) => {
    const match = /^extras\.(\d+)\.quantity$/.exec(key);
    return [match ? (extras[Number(match[1])] ? `extra:${extras[Number(match[1])].code}` : "extras") : key, message];
  }));
}
export function recoverFieldErrors(errors, id) {
  const clear = new Set();
  const related = (keys, edited) => {
    clear.add(edited);
    // Shared interval errors are dependent; independent syntax errors survive.
    for (const key of keys) if (errors[edited] && errors[key] === errors[edited]) clear.add(key);
  };
  const visit = /^(date|time|end)-(\d+)$/.exec(id || "");
  if (visit) {
    const prefix = `visits.${visit[2]}.`;
    const edited = prefix + ({ date: "date", time: "startTime", end: "endTime" }[visit[1]]);
    related(["date", "startTime", "endTime"].map((key) => prefix + key), edited);
    if (visit[1] === "time") clear.add(prefix + "endTime"); // Auto-calculated from start.
  } else if (id === "client-mode") {
    for (const key of Object.keys(errors)) if (key === "clientId" || key.startsWith("client.") || key === "petIds") clear.add(key);
  } else if (id === "client-select") { clear.add("clientId"); clear.add("petIds"); }
  else if (id?.startsWith("client-") && id !== "client-search") clear.add(`client.${id.slice(7)}`);
  else if (id?.startsWith("extra-")) { clear.add(`extra:${id.slice(6)}`); clear.add("extras"); }
  else if (id === "service" || id === "service-overnight") {
    clear.add("serviceCode"); clear.add("schedule");
    // Service changes replace visit end times and may switch schedule kind.
    for (const key of Object.keys(errors)) {
      const date = /^visits\.(\d+)\.date$/.exec(key);
      if (date && (errors[key] === errors[`visits.${date[1]}.startTime`] || errors[key] === errors[`visits.${date[1]}.endTime`])) clear.add(key);
      if (id === "service-overnight" && key.startsWith("visits.")) clear.add(key);
    }
    for (const key of Object.keys(errors)) {
      const start = /^visits\.(\d+)\.startTime$/.exec(key);
      if (start && errors[key] === errors[`visits.${start[1]}.endTime`]) clear.add(key);
      if (/^visits\.\d+\.endTime$/.test(key) || (id === "service" && /^(arrival|departure)/.test(key))) clear.add(key);
    }
  } else if (/^(arrival|departure)(Date|Time)$/.test(id || "")) related(["arrivalDate", "departureDate", "arrivalTime", "departureTime"], id);
  else if (id === "petIds" || id === "notes") clear.add(id);
  return Object.fromEntries(Object.entries(errors).filter(([key]) => !clear.has(key)));
}
export function removeVisitErrors(errors, removedIndex) {
  return Object.fromEntries(Object.entries(errors).flatMap(([key, message]) => {
    const match = /^visits\.(\d+)\.(.+)$/.exec(key);
    if (!match) return [[key, message]];
    const index = Number(match[1]);
    return index === removedIndex ? [] : [[`visits.${index > removedIndex ? index - 1 : index}.${match[2]}`, message]];
  }));
}
export function validationSummary(errors) {
  return [...new Set(Object.values(errors))].join(" ");
}
