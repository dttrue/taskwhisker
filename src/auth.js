// src/auth.js
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authConfig } from "@/auth.config";

// Simple wrapper so we can call `auth()` in server components
export async function auth() {
  return getServerSession(authConfig);
}

// Redirects to /login if not signed in
export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session;
}

// Redirects to /dashboard if signed in but wrong role
export async function requireRole(allowedRoles = []) {
  const session = await requireAuth();
  const role = session?.user?.role;

  if (!role || (allowedRoles.length && !allowedRoles.includes(role))) {
    redirect("/dashboard");
  }

  return session;
}
