// src/app/dashboard/page.jsx
import { requireAuth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await requireAuth();
  const role = session.user?.role;

  if (role === "OPERATOR") redirect("/dashboard/operator");
  if (role === "SITTER") redirect("/dashboard/sitter");

  // Fallback (shouldn't happen)
  redirect("/login");
}
