// src/app/dashboard/operator/layout.jsx
import { requireRole } from "@/auth";
import { Toaster } from "react-hot-toast";

export default async function OperatorLayout({ children }) {
  await requireRole(["OPERATOR"]);
  return (
    <>
      {children}
      <Toaster position="top-right" />
    </>
  );
}