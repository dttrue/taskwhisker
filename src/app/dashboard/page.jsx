// src/app/dashboard/page.jsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  // Server-side session check
  const session = await auth();

  // No session? Kick to login.
  if (!session?.user) {
    redirect("/login");
  }

  const { user } = session;

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          Internal MVP
        </div>

        <h1 className="text-2xl font-semibold text-zinc-900">
          TaskWhisker Dashboard
        </h1>

        <p className="text-sm text-zinc-600">
          Signed in as <span className="font-medium">{user.email}</span>
          {user.role && (
            <>
              {" "}
              ·{" "}
              <span className="uppercase text-xs tracking-wide">
                {user.role}
              </span>
            </>
          )}
        </p>

        <div className="h-px bg-zinc-200" />

        <p className="text-sm text-zinc-600">
          This is just a placeholder shell so we can verify:
        </p>
        <ul className="list-disc list-inside text-sm text-zinc-600 space-y-1">
          <li>Credentials login works</li>
          <li>Session is available on the server</li>
          <li>Role is coming through from Prisma → JWT → session</li>
        </ul>
      </div>
    </main>
  );
}
