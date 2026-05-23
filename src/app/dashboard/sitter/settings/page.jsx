// src/app/dashboard/sitter/settings/page.jsx
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function SitterSettingsPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login");
  }

  const sitter = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
  });

  if (!sitter) {
    redirect("/login");
  }

  if (sitter.role !== "SITTER") {
    redirect("/dashboard/operator");
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="mx-auto max-w-xl space-y-4">
        <Link
          href="/dashboard/sitter"
          className="text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          Back to sitter dashboard
        </Link>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Sitter settings
          </p>

          <h1 className="mt-1 text-2xl font-bold text-zinc-950">Settings</h1>

          <p className="mt-2 text-sm text-zinc-500">
            Manage your sitter profile, communication preferences, and account
            details.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Profile</h2>

          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Name
              </p>
              <p className="mt-1 font-medium text-zinc-900">
                {sitter.name || "No name set"}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Email
              </p>
              <p className="mt-1 font-medium text-zinc-900">{sitter.email}</p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Role
              </p>
              <p className="mt-1 font-medium text-zinc-900">{sitter.role}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Notifications</h2>

          <p className="mt-2 text-sm text-zinc-500">
            Notification controls will go here later. For now, messages refresh
            automatically inside active conversations.
          </p>

          <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
            SMS and email notifications are not enabled yet.
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Sitter tools</h2>

          <div className="mt-4 grid gap-3">
            <Link
              href="/dashboard/sitter/messages"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm hover:border-zinc-400"
            >
              Open inbox
            </Link>

            <Link
              href="/dashboard/sitter"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm hover:border-zinc-400"
            >
              Today’s visits
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
