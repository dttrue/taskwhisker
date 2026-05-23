// src/app/dashboard/sitter/layout.jsx
import { requireRole } from "@/auth";
import SitterMobileDock from "./_components/SitterMobileDock";

export default async function SitterLayout({ children }) {
  await requireRole(["SITTER"]);

  return (
    <>
      <div className="pb-16">{children}</div>
      <SitterMobileDock />
    </>
  );
}
