import ScheduleLink from "../schedule/ScheduleLink";
// src/app/dashboard/sitter/layout.jsx
import { requireRole } from "@/auth";
import SitterMobileDock from "./_components/SitterMobileDock";

export default async function SitterLayout({ children }) {
  const session = await requireRole(["SITTER"]);

  return (
    <>
      <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]"><ScheduleLink actorId={session.user.id} />{children}</div>
      <SitterMobileDock />
    </>
  );
}
