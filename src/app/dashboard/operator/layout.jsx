// src/app/dashboard/operator/layout.jsx
import { requireRole } from "@/auth";
import { Toaster } from "react-hot-toast";
import OperatorNavigation from "./_components/OperatorNavigation";

export default async function OperatorLayout({ children }) {
  const session = await requireRole(["OPERATOR"]);

  return (
    <>
      <div className="min-h-screen bg-[var(--task-canvas)] lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
        <OperatorNavigation
          accountLabel={session.user.email || session.user.name || "Operator"}
        />
        <div className="min-w-0">{children}</div>
      </div>
      <Toaster position="top-right" />
    </>
  );
}
