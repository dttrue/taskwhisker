// src/app/dashboard/sitter/_components/Section.jsx
import BookingCard from "./BookingCard";
import BookingTable from "./BookingTable";

export default function Section({ title, description, bookings }) {
  if (!bookings.length) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
        ) : null}
      </div>

      <div className="space-y-3 md:hidden">
        {bookings.map((booking) => (
          <BookingCard key={booking.id} booking={booking} />
        ))}
      </div>

      <BookingTable bookings={bookings} />
    </section>
  );
}
