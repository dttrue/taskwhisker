// src/app/dashboard/sitter/settings/page.jsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export default async function SitterSettingsPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login");
  }

  const sitter = await prisma.user.findUnique({
    where: {
      email: session.user.email,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  if (!sitter) {
    redirect("/login");
  }

  if (sitter.role !== "SITTER") {
    redirect("/dashboard/operator");
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 pb-24">
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

          <h1 className="mt-1 text-2xl font-bold text-zinc-950">
            Signed in as
          </h1>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950 text-lg font-bold text-white">
                {(sitter.name || sitter.email || "S").slice(0, 1).toUpperCase()}
              </div>

              <div className="min-w-0">
                <p className="truncate text-base font-bold text-zinc-950">
                  {sitter.name || "Unnamed sitter"}
                </p>

                <p className="truncate text-sm text-zinc-600">{sitter.email}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 text-sm text-zinc-700">
              <p>
                <span className="font-semibold text-zinc-950">Role:</span>{" "}
                {sitter.role}
              </p>

              <p>
                <span className="font-semibold text-zinc-950">Account ID:</span>{" "}
                <span className="break-all">{sitter.id}</span>
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-zinc-950">Quick actions</h2>

          <div className="mt-4 grid gap-3">
            <Link
              href="/dashboard/sitter/messages"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-900 shadow-sm transition hover:border-zinc-400"
            >
              Open inbox
            </Link>

            <Link
              href="/dashboard/sitter"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-900 shadow-sm transition hover:border-zinc-400"
            >
              Return to route dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
