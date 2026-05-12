// src/app/dashboard/operator/lib/sitterReliability.js

export function getSitterReliability({
  sitterFaultCount = 0,
  excusedCount = 0, // not used in penalty but useful later
  followUpCount = 0,
  unresolvedMissedCount = 0,
  lateCount = 0,
}) {
  const score = Math.max(
    0,
    100 -
      sitterFaultCount * 25 -
      followUpCount * 10 -
      unresolvedMissedCount * 35 -
      lateCount * 10
  );

  let level = "excellent";
  let label = "Reliable";
  let tone = "green";

  if (score < 85) {
    level = "watch";
    label = "Needs watching";
    tone = "amber";
  }

  if (score < 65) {
    level = "risky";
    label = "Risky sitter";
    tone = "red";
  }

  return {
    score,
    level,
    label,
    tone,
  };
}