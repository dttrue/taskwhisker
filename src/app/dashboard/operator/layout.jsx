// src/app/dashboard/operator/layout.jsx
import { requireRole } from "@/auth";

export default async function OperatorLayout({ children }) {
  await requireRole(["OPERATOR"]);
  return <>{children}</>;
}
