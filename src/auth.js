// src/auth.js
import { getServerSession } from "next-auth";
import { authConfig } from "@/auth.config";

// Simple wrapper so we can call `auth()` in server components
export async function auth() {
  return getServerSession(authConfig);
}
