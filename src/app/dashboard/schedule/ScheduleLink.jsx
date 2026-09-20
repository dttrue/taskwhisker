import { Button } from "@/components/ui/Foundation";

export default function ScheduleLink({ actorId }) {
  // Navigation visibility only. The destination independently validates both DB
  // identities and the actor through scheduleAccess on every read and write.
  const ids = [process.env.BUSINESS_OWNER_OPERATOR_USER_ID?.trim(), process.env.BUSINESS_OWNER_SITTER_USER_ID?.trim()];
  if (!actorId || !ids.includes(actorId)) return null;
  return <div className="px-4 pt-4"><Button href="/dashboard/schedule" variant="secondary">Bridget’s schedule</Button></div>;
}
