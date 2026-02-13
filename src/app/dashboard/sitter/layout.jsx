// src/app/dashboard/sitter/layout.jsx
import { requireRole } from "@/auth";

export default async function SitterLayout({ children }) {
  await requireRole(["SITTER"]);
  return <>{children}</>;
}
