const sizes = { SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large' };
const weights = { TOY: 'Toy', SMALL_10_25: '10–25 lb', MEDIUM_26_50: '26–50 lb', LARGE_51_80: '51–80 lb', XL_81_PLUS: '81+ lb' };

// Only recognized care fields are rendered; unknown object keys never become copy.
export function formatPetCareDetails(details) {
  if (typeof details === 'string') return details.trim();
  if (!details || typeof details !== 'object' || Array.isArray(details)) return '';
  const size = Array.isArray(details.dogSize) ? [...new Set(details.dogSize.map(value => typeof value === 'string' && Object.hasOwn(sizes, value) ? sizes[value] : null).filter(Boolean))].join(', ') : '';
  const weight = typeof details.weightClass === 'string' && Object.hasOwn(weights, details.weightClass) ? weights[details.weightClass] : '';
  return [size && `Size: ${size}`, weight && `Weight: ${weight}`].filter(Boolean).join(' · ');
}
export function formatCareServiceLabel(label, durationMinutes) {
  const text = typeof label === 'string' ? label.trim() : 'Pet care';
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return text;
  const duration = new RegExp(`\\b${durationMinutes}[\\s-]*(?:min(?:ute)?s?)(?![a-z])`, 'i');
  return duration.test(text) ? text : `${text} · ${durationMinutes} minutes`;
}
export function formatCareVisitStart(startTime) {
  return new Date(startTime).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
