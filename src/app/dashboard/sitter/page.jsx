// src/app/dashboard/sitter/page.jsx
import { requireRole } from "@/auth";

export default async function SitterDashboard() {
  const session = await requireRole(["SITTER"]);
  const { user } = session;

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          Internal MVP
        </div>

        <h1 className="text-2xl font-semibold text-zinc-900">
          Sitter Dashboard
        </h1>

        <p className="text-sm text-zinc-600">
          Signed in as <span className="font-medium">{user.email}</span> ·{" "}
          <span className="uppercase text-xs tracking-wide">{user.role}</span>
        </p>

        <div className="h-px bg-zinc-200" />

        <p className="text-sm text-zinc-600">Next: my upcoming visits.</p>
      </div>
    </main>
  );
}
