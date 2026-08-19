import {
  Button,
  Card,
  Eyebrow,
  PageHeader,
  PageShell,
} from "@/components/ui/Foundation";

export default function Home() {
  return (
    <PageShell className="flex items-center" containerClassName="max-w-5xl">
      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative flex min-h-64 flex-col justify-between overflow-hidden bg-[var(--task-primary)] p-6 text-white sm:p-10 lg:min-h-[520px]">
            <div
              aria-hidden="true"
              className="absolute -right-20 -top-20 h-64 w-64 rounded-full border border-white/15"
            />
            <div
              aria-hidden="true"
              className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-white/[0.06]"
            />

            <div className="relative">
              <p className="text-sm font-bold tracking-[-0.02em]">TaskWhisker</p>
              <p className="mt-2 max-w-xs text-sm leading-6 text-white/75">
                Thoughtful coordination for dependable pet care.
              </p>
            </div>

            <div className="relative mt-12 max-w-sm">
              <p className="text-2xl font-semibold leading-tight tracking-[-0.025em] sm:text-3xl">
                Every visit, schedule, and conversation in one calm workspace.
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-14">
            <PageHeader
              eyebrow="Pet-care operations"
              title="Care teams can stay focused on the work that matters."
              description="TaskWhisker brings bookings, sitter schedules, client communication, and daily operations together in a clear, dependable workspace."
            />

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] p-4">
                <Eyebrow className="text-[var(--task-accent)]">For teams</Eyebrow>
                <p className="mt-2 text-sm leading-6 text-[var(--task-text-muted)]">
                  Coordinate bookings, assignments, and client updates with less friction.
                </p>
              </div>
              <div className="rounded-[var(--task-radius-control)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] p-4">
                <Eyebrow className="text-[var(--task-accent)]">For sitters</Eyebrow>
                <p className="mt-2 text-sm leading-6 text-[var(--task-text-muted)]">
                  Keep each day organized with clear visit details and communication.
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/login" className="sm:min-w-36">
                Sign in
              </Button>
              <Button href="/book" variant="secondary" className="sm:min-w-36">
                Request pet care
              </Button>
            </div>

            <p className="mt-5 text-xs leading-5 text-[var(--task-text-muted)]">
              Team access is limited to authorized TaskWhisker operators and sitters.
            </p>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
