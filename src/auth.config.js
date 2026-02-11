// src/auth.config.js
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export const authConfig = {
  // ✅ Use Prisma adapter (even with JWT sessions)
  adapter: PrismaAdapter(prisma),

  // ✅ Secret for signing/encrypting JWT + CSRF tokens
  secret: process.env.NEXTAUTH_SECRET,

  session: {
    strategy: "jwt", // simpler for Phase 1
  },

  pages: {
    signIn: "/login",
    // we can add a nicer error page later if you want
    // error: "/login"
  },

  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.hashedPassword) return null;

        const isValid = await bcrypt.compare(
          credentials.password,
          user.hashedPassword
        );

        if (!isValid) return null;

        // 👇 This object becomes `user` in the jwt callback
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // On login, copy role into token
      if (user) {
        token.role = user.role;
      }
      return token;
    },

    async session({ session, token }) {
      // Expose id + role to the client
      if (session.user && token) {
        session.user.id = token.sub;
        session.user.role = token.role;
      }
      return session;
    },
  },

  // Optional but handy while we’re wiring all this
  debug: process.env.NODE_ENV === "development",
};
