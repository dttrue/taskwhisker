// src/app/dashboard/operator/blocked-clients/page.jsx
import Link from "next/link";
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import BlockedClientForm from "./BlockedClientForm";
import { deactivateBlockedClient, reactivateBlockedClient } from "./actions";

function formatDate(value) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Detail({ label, value }) {
  if (!value) return null;

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-sm text-zinc-800">{value}</div>
    </div>
  );
}

export default async function OperatorBlockedClientsPage() {
  await requireRole(["OPERATOR"]);

  const blockedClients = await prisma.blockedClient.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: {
      createdByUser: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  const activeCount = blockedClients.filter((client) => client.isActive).length;

  return (
    <main className="min-h-screen bg-zinc-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link
            href="/dashboard/operator"
            className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
          >
            ← Back to operator dashboard
          </Link>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Operator tools
              </p>
              <h1 className="text-3xl font-bold text-zinc-950">
                Blocked clients
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-zinc-600">
                Prevent problem clients from creating new bookings based on
                email, phone, or service address.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Active blocks
              </div>
              <div className="mt-1 text-2xl font-bold text-zinc-950">
                {activeCount}
              </div>
            </div>
          </div>
        </div>

        <BlockedClientForm />

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-zinc-950">
                Current blocklist
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Active entries will prevent matching clients from booking.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {blockedClients.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-500">
                No blocked clients yet.
              </p>
            ) : (
              blockedClients.map((client) => (
                <div
                  key={client.id}
                  className={`rounded-2xl border p-4 ${
                    client.isActive
                      ? "border-red-200 bg-red-50/50"
                      : "border-zinc-200 bg-zinc-50"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-zinc-950">
                          {client.name ||
                            client.email ||
                            client.phone ||
                            "Blocked client"}
                        </h3>

                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            client.isActive
                              ? "bg-red-100 text-red-700"
                              : "bg-zinc-200 text-zinc-600"
                          }`}
                        >
                          {client.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-zinc-500">
                        Added {formatDate(client.createdAt)}
                        {client.createdByUser?.name
                          ? ` by ${client.createdByUser.name}`
                          : ""}
                      </p>
                    </div>

                    <form
                      action={
                        client.isActive
                          ? deactivateBlockedClient
                          : reactivateBlockedClient
                      }
                    >
                      <input
                        type="hidden"
                        name="blockedClientId"
                        value={client.id}
                      />

                      <button
                        type="submit"
                        className={`inline-flex w-full items-center justify-center rounded-xl px-3 py-2 text-sm font-bold sm:w-auto ${
                          client.isActive
                            ? "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"
                            : "bg-zinc-950 text-white hover:bg-zinc-800"
                        }`}
                      >
                        {client.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    </form>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Detail label="Email" value={client.email} />
                    <Detail label="Phone" value={client.phone} />
                    <Detail label="Address" value={client.addressLine1} />
                    <Detail label="City" value={client.city} />
                    <Detail label="State" value={client.state} />
                    <Detail label="ZIP" value={client.postalCode} />
                  </div>

                  {client.reason ? (
                    <div className="mt-4 rounded-xl border border-zinc-200 bg-white/70 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Internal reason
                      </div>
                      <p className="mt-1 text-sm text-zinc-700">
                        {client.reason}
                      </p>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
