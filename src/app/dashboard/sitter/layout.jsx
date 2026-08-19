// src/app/dashboard/sitter/layout.jsx
import { requireRole } from "@/auth";
import SitterMobileDock from "./_components/SitterMobileDock";

export default async function SitterLayout({ children }) {
  await requireRole("SITTER");

  return (
    <>
      <div className="pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</div>
      <SitterMobileDock />
    </>
  );
}
