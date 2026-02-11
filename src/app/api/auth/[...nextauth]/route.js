// src/app/api/auth/[...nextauth]/route.js
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// NextAuth v4 returns a single handler function.
// We then map that handler to both GET and POST.
const handler = NextAuth(authConfig);

export { handler as GET, handler as POST };
