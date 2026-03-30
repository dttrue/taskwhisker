// src/app/dashboard/sitter/_components/Section.jsx
import BookingCard from "./BookingCard";
import BookingTable from "./BookingTable";

export default function Section({
  title,
  description,
  bookings = [],
  view,
  nextUp,
  emptyMessage = "Nothing to show here.",
  muted = false,
  showTable = true,
}) {
  const hasBookings = bookings.length > 0;

  return (
    <section
      className={`space-y-3 rounded-xl ${
        muted ? "border border-zinc-200 bg-white/70 p-4" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            {title}
            <span className="ml-2 text-sm font-medium text-zinc-500">
              ({bookings.length})
            </span>
          </h2>

          {description ? (
            <p className="mt-1 text-sm text-zinc-600">{description}</p>
          ) : null}
        </div>
      </div>

      {!hasBookings ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-4 text-sm text-zinc-500">
          {emptyMessage}
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {bookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                view={view}
                isNextStop={booking.id === nextUp?.id}
              />
            ))}
          </div>

          {showTable ? <BookingTable bookings={bookings} /> : null}
        </>
      )}
    </section>
  );
}
