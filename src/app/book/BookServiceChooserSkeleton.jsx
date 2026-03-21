// BookServiceChooserSkeleton.jsx
export default function BookServiceChooserSkeleton() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
        <div className="space-y-3 text-center">
          <div className="shimmer mx-auto h-8 w-48 rounded-lg"></div>
          <div className="shimmer mx-auto h-4 w-72 rounded"></div>
        </div>

        <div className="mt-6 space-y-2">
          <div className="shimmer h-4 w-20 rounded"></div>
          <div className="shimmer h-12 w-full rounded-xl"></div>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
          <div className="flex justify-between">
            <div className="space-y-2">
              <div className="shimmer h-3 w-16 rounded"></div>
              <div className="shimmer h-6 w-44 rounded"></div>
            </div>
            <div className="shimmer h-6 w-20 rounded-full"></div>
          </div>

          <div className="shimmer h-4 w-full rounded"></div>
          <div className="shimmer h-4 w-5/6 rounded"></div>

          <div className="space-y-2 pt-2">
            <div className="shimmer h-4 w-40 rounded"></div>
            <div className="shimmer h-4 w-32 rounded"></div>
          </div>
        </div>

        <div className="mt-6">
          <div className="shimmer h-12 w-full rounded-xl"></div>
        </div>
      </div>
    </div>
  );
}