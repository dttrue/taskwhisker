// BookServiceChooserSkeleton.jsx
import { Card, PageShell } from "@/components/ui/Foundation";

export default function BookServiceChooserSkeleton({ variant = "chooser" }) {
  const isWizard = variant === "wizard";

  return (
    <PageShell containerClassName={isWizard ? "max-w-3xl" : "max-w-2xl"}>
      <Card
        aria-busy="true"
        aria-label={isWizard ? "Loading booking form" : "Loading services"}
        className="p-6 sm:p-8"
      >
        <span className="sr-only">
          {isWizard ? "Loading booking form" : "Loading services"}
        </span>
        <div aria-hidden="true">
          <div className="space-y-3">
            <div className="shimmer h-3 w-32 rounded"></div>
            <div className="shimmer h-9 w-56 max-w-full rounded-lg"></div>
            <div className="shimmer h-4 w-full max-w-md rounded"></div>
          </div>

          {isWizard ? (
            <div className="mt-8 space-y-5">
              <div className="shimmer h-16 w-full rounded-[var(--task-radius-control)]"></div>
              <div className="shimmer h-10 w-full rounded-[var(--task-radius-control)]"></div>
              <div className="rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] p-4 sm:p-6">
                <div className="shimmer h-5 w-36 rounded"></div>
                <div className="mt-4 shimmer h-72 w-full rounded-[var(--task-radius-control)]"></div>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-8 space-y-2">
                <div className="shimmer h-4 w-20 rounded"></div>
                <div className="shimmer h-12 w-full rounded-[var(--task-radius-control)]"></div>
              </div>

              <div className="mt-6 space-y-3 rounded-[var(--task-radius-card)] border border-[var(--task-border)] bg-[var(--task-surface-soft)] p-5">
                <div className="flex justify-between">
                  <div className="space-y-2">
                    <div className="shimmer h-3 w-16 rounded"></div>
                    <div className="shimmer h-6 w-44 rounded"></div>
                  </div>
                  <div className="shimmer h-6 w-20 rounded-full"></div>
                </div>
                <div className="shimmer h-4 w-full rounded"></div>
                <div className="shimmer h-4 w-5/6 rounded"></div>
              </div>
              <div className="mt-6 shimmer h-12 w-full rounded-[var(--task-radius-control)]"></div>
            </>
          )}
        </div>
      </Card>
    </PageShell>
  );
}
