// src/app/dashboard/operator/blocked-clients/page.jsx
import { requireRole } from "@/auth";
import { prisma } from "@/lib/db";
import BlockedClientForm from "./BlockedClientForm";
import { deactivateBlockedClient, reactivateBlockedClient } from "./actions";
import { Button, Card, Eyebrow, StatusBadge } from "@/components/ui/Foundation";

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
    <main className="min-h-screen bg-[var(--task-canvas)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Eyebrow>Admin tools</Eyebrow>
              <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-[var(--task-text)] sm:text-4xl">
                Blocked clients
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--task-text-muted)] sm:text-base">
                Prevent problem clients from creating new bookings based on
                email, phone, or service address.
              </p>
            </div>

            <Card className="min-w-36 px-4 py-3 shadow-none">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--task-primary)]">
                Active blocks
              </div>
              <div className="mt-1 text-2xl font-bold text-[var(--task-text)]">
                {activeCount}
              </div>
            </Card>
          </div>
        </header>

        <BlockedClientForm />

        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-[-0.025em] text-[var(--task-text)]">
                Current blocklist
              </h2>
              <p className="mt-1 text-sm text-[var(--task-text-muted)]">
                Active entries will prevent matching clients from booking.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {blockedClients.length === 0 ? (
              <p className="rounded-[var(--task-radius-control)] border border-dashed border-[var(--task-border-strong)] bg-[var(--task-surface-soft)] p-5 text-sm text-[var(--task-text-muted)]">
                No clients are currently blocked.
              </p>
            ) : (
              blockedClients.map((client) => (
                <div
                  key={client.id}
                  className={`rounded-[var(--task-radius-control)] border p-4 sm:p-5 ${
                    client.isActive
                      ? "border-[#e8c8c3] bg-[var(--task-danger-soft)]/45"
                      : "border-[var(--task-border)] bg-[var(--task-surface-soft)]"
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

                        <StatusBadge tone={client.isActive ? "danger" : "neutral"}>
                          {client.isActive ? "Active" : "Inactive"}
                        </StatusBadge>
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

                      <Button
                        type="submit"
                        variant={client.isActive ? "secondary" : "primary"}
                        className="w-full sm:w-auto"
                      >
                        {client.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    </form>
                  </div>

                  <div className="mt-4 grid gap-x-6 gap-y-4 border-t border-[var(--task-border)] pt-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Detail label="Email" value={client.email} />
                    <Detail label="Phone" value={client.phone} />
                    <Detail label="Address" value={client.addressLine1} />
                    <Detail label="City" value={client.city} />
                    <Detail label="State" value={client.state} />
                    <Detail label="ZIP" value={client.postalCode} />
                  </div>

                  {client.reason ? (
                    <div className="mt-4 rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-white/75 p-3">
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
        </Card>
      </div>
    </main>
  );
}
