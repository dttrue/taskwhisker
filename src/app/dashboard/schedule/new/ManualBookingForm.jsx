"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, FormField, FormFeedback, Notice } from "@/components/ui/Foundation";
import { addCalendarDays, timeMinutes } from "@/lib/calendar/businessTime";
import { reviewManualBooking, saveManualBooking, searchScheduleClients } from "../actions";

function BookingField({ className = "", ...props }) {
  return <FormField {...props} className={`min-w-0 ${className}`} inputClassName="min-w-0 max-w-full" />;
}

const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
function endTime(start, duration) {
  try {
    const minutes = timeMinutes(start) + (duration || 30);
    if (minutes >= 1440) return "23:59";
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  } catch { return ""; }
}

export default function ManualBookingForm({ clients: initialClients, services, sitterName, initialDate }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const primaryServices = services.filter((service) => service.category !== "EXTRA");
  const extraServices = services.filter((service) => service.category === "EXTRA");
  const [clients, setClients] = useState(initialClients);
  const [search, setSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [newClient, setNewClient] = useState(false);
  const [client, setClient] = useState({ name: "", email: "", phone: "", addressLine1: "", addressLine2: "", city: "", state: "NJ", postalCode: "" });
  const [serviceCode, setServiceCode] = useState(primaryServices[0]?.code || "");
  const service = primaryServices.find((item) => item.code === serviceCode);
  const [visits, setVisits] = useState([{ date: initialDate, startTime: "09:00", endTime: endTime("09:00", service?.durationMinutes) }]);
  const [stay, setStay] = useState({ arrivalDate: initialDate, departureDate: addCalendarDays(initialDate, 1), arrivalTime: "19:00", departureTime: "07:00" });
  const [petIds, setPetIds] = useState([]);
  const [extras, setExtras] = useState({});
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  // Errors belong to the last submitted snapshot, including its row positions.
  // Discard them on editing or structural changes; never shift errors to a row.
  function clearErrors() { setFieldErrors({}); setError(""); }
  function showFailure(result) { setError(result.error); setFieldErrors(result.fieldErrors || {}); }
  const selectedClient = clients.find((item) => item.id === clientId);
  const overnight = service?.category === "OVERNIGHT";
  const input = () => ({ clientId: newClient ? null : clientId, client: newClient ? client : null, serviceCode,
    schedule: overnight ? { kind: "OVERNIGHT_STAY", ...stay } : { kind: "TIMED_VISIT", visits },
    petIds: newClient ? [] : petIds, notes, extras: Object.entries(extras).filter(([, count]) => Number(count) > 0).map(([code, count]) => ({ code, quantity: Number(count) })) });

  async function run(work) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); clearErrors();
    try { await work(); }
    catch { setError("Connection interrupted. Retry with the same booking details."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault();
    await run(async () => {
      if (!newClient && !clientId) { showFailure({ error: "Select an existing client or choose New client.", fieldErrors: { clientId: "Select an existing client or choose New client." } }); return; }
      const reviewedInput = input();
      const result = await reviewManualBooking(reviewedInput);
      if (!result.ok) { showFailure(result); return; }
      setReview({ ...result, input: reviewedInput });
    });
  }
  async function save() {
    await run(async () => {
      const result = await saveManualBooking(review.input, review.token);
      if (!result.ok) {
        showFailure(result);
        if (Object.keys(result.fieldErrors || {}).length || ["PRICE_CHANGED", "REVIEW_REQUIRED", "VISIT_ALREADY_STARTED", "SCHEDULE_CONFLICT"].includes(result.code)) setReview(null);
        return;
      }
      const date = review.input.schedule.kind === "OVERNIGHT_STAY" ? review.input.schedule.arrivalDate : review.input.schedule.visits[0].date;
      router.push(`/dashboard/schedule?view=week&date=${date}`);
      router.refresh();
    });
  }

  if (review) return <section className="min-w-0 max-w-full space-y-4 [overflow-wrap:anywhere]" aria-label="Review booking">
    <Card className="space-y-4 p-5">
      <h2 className="text-xl font-bold">Review booking</h2>
      <p className="font-semibold">{newClient ? client.name : selectedClient?.name} · {review.summary.service}</p>
      <p>Sitter: {sitterName}</p>
      <div className="space-y-1 text-sm">{overnight ? <p>{stay.arrivalDate} at {stay.arrivalTime} through {stay.departureDate} at {stay.departureTime}</p> : visits.map((visit, index) => <p key={index}>{visit.date}: {visit.startTime}–{visit.endTime}</p>)}</div>
      <p>{review.summary.quantity} {review.summary.unit}{review.summary.quantity === 1 ? "" : "s"} × {money(review.summary.unitPriceCents)}</p>
      {review.summary.extras.map((extra) => <p key={extra.code}>{extra.name} × {extra.quantity}: {money(extra.totalPriceCents)}</p>)}
      <p className="border-t border-[var(--task-border)] pt-4 text-xl font-bold">Booking total: {money(review.summary.clientTotalCents)}</p>
      <p className="text-sm text-[var(--task-text-muted)]">Existing service pricing applies. The total includes the platform share of {money(review.summary.platformFeeCents)}; sitter payout is {money(review.summary.sitterPayoutCents)}. Saving records the booking without charging a payment or sending notifications.</p>
    </Card>
    {error && <FormFeedback>{error}</FormFeedback>}
    <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={save}>{busy ? "Saving…" : `Save Booking · ${money(review.summary.clientTotalCents)}`}</Button><Button disabled={busy} variant="secondary" onClick={() => { setReview(null); setError(""); }}>Edit details</Button></div>
  </section>;

  return <form onSubmit={submit} onChange={clearErrors} className="min-w-0 max-w-full space-y-5 [overflow-wrap:anywhere]">
    <fieldset disabled={busy} className="min-w-0 space-y-5">
      <Card className="space-y-4 p-4">
        <h2 className="text-lg font-bold">Client</h2>
        <div className="flex gap-2"><Button variant={!newClient ? "primary" : "secondary"} onClick={() => { clearErrors(); setNewClient(false); }}>Existing client</Button><Button variant={newClient ? "primary" : "secondary"} onClick={() => { clearErrors(); setNewClient(true); }}>New client</Button></div>
        {newClient ? <>
          <BookingField id="client-name" error={fieldErrors["client.name"]} label="Client name" required maxLength={200} autoComplete="name" value={client.name} onChange={(event) => setClient({ ...client, name: event.target.value })} />
          <BookingField id="client-email" error={fieldErrors["client.email"]} label="Email (optional)" type="email" maxLength={254} autoComplete="email" value={client.email} onChange={(event) => setClient({ ...client, email: event.target.value })} />
          <BookingField id="client-phone" error={fieldErrors["client.phone"]} label="Phone (optional)" type="tel" maxLength={50} autoComplete="tel" value={client.phone} onChange={(event) => setClient({ ...client, phone: event.target.value })} />
          <details open={Object.keys(fieldErrors).some((key) => ["client.addressLine1", "client.addressLine2", "client.city", "client.state", "client.postalCode"].includes(key)) || undefined}><summary className="cursor-pointer py-2 font-semibold">Address (optional)</summary><div className="mt-3 space-y-3">{[["addressLine1", "Street address"], ["addressLine2", "Apartment / unit"], ["city", "City"], ["state", "State"], ["postalCode", "ZIP code"]].map(([key, label]) => <BookingField key={key} id={`client-${key}`} error={fieldErrors[`client.${key}`]} label={label} maxLength={200} value={client[key]} onChange={(event) => setClient({ ...client, [key]: event.target.value })} />)}</div></details>
        </> : <>
          <div className="flex items-end gap-2"><BookingField id="client-search" label="Find client" className="min-w-0 flex-1" placeholder="Name, email, or phone" value={search} onChange={(event) => setSearch(event.target.value)} /><Button variant="secondary" onClick={() => run(async () => {
            const result = await searchScheduleClients(search);
            if (!result.ok) { showFailure(result); return; }
            setClients(result.clients); setClientId(""); setPetIds([]);
          })}>Search</Button></div>
          <BookingField id="client-select" error={fieldErrors["clientId"]} label="Client" as="select" required value={clientId} onChange={(event) => { setClientId(event.target.value); setPetIds([]); }}>
            <option value="">Select client</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}{item.email ? ` · ${item.email}` : item.phone ? ` · ${item.phone}` : ""}</option>)}
          </BookingField>
          <p className="text-xs text-[var(--task-text-muted)]">Up to 50 matches. Search to find more clients.</p>
          {(!!selectedClient?.pets.length || fieldErrors.petIds) && <fieldset aria-invalid={Boolean(fieldErrors.petIds)} aria-describedby={fieldErrors.petIds ? "pets-error" : undefined}><legend className="text-sm font-semibold">Pets (optional)</legend>{(selectedClient?.pets || []).map((pet) => <label key={pet.id} className="flex min-h-11 min-w-0 items-center gap-3"><input className="shrink-0" type="checkbox" aria-invalid={Boolean(fieldErrors.petIds)} aria-describedby={fieldErrors.petIds ? "pets-error" : undefined} checked={petIds.includes(pet.id)} onChange={(event) => setPetIds(event.target.checked ? [...petIds, pet.id] : petIds.filter((id) => id !== pet.id))} /><span className="min-w-0">{pet.name} ({pet.species})</span></label>)}{fieldErrors.petIds && <p id="pets-error" className="text-sm text-[var(--task-danger)]">{fieldErrors.petIds}</p>}</fieldset>}
        </>}
      </Card>
      <Card className="space-y-4 p-4">
        <h2 className="text-lg font-bold">Service and dates</h2>
        {fieldErrors.schedule && <p id="schedule-error" className="text-sm text-[var(--task-danger)]">{fieldErrors.schedule}</p>}
        <BookingField id="service" error={fieldErrors["serviceCode"]} label="Service" as="select" required value={serviceCode} onChange={(event) => {
          const next = primaryServices.find((item) => item.code === event.target.value);
          setServiceCode(event.target.value); setVisits(visits.map((visit) => ({ ...visit, endTime: endTime(visit.startTime, next?.durationMinutes) })));
        }}>{primaryServices.map((item) => <option key={item.code} value={item.code}>{item.name} · {money(item.basePriceCents)}</option>)}</BookingField>
        {!primaryServices.length && <Notice>No active services are available. Contact the operator.</Notice>}
        {overnight ? <div className="grid gap-3 sm:grid-cols-2">{[["arrivalDate", "Arrival date", "date"], ["departureDate", "Departure date", "date"], ["arrivalTime", "Arrival time", "time"], ["departureTime", "Departure time", "time"]].map(([key, label, type]) => <BookingField key={key} id={key} error={fieldErrors[key]} label={label} type={type} required value={stay[key]} onChange={(event) => setStay({ ...stay, [key]: event.target.value })} />)}</div> : <>
          <p className="text-sm text-[var(--task-text-muted)]">Visits run between 7 AM and 10 PM. Duration follows the selected service. Add a row for each visit.</p>
          {visits.map((visit, index) => <fieldset key={index} className="min-w-0 space-y-3 border-t border-[var(--task-border)] pt-3"><legend className="font-semibold">Visit {index + 1}</legend>
            <BookingField id={`date-${index}`} error={fieldErrors[`visits.${index}.date`]} label="Date" type="date" required value={visit.date} onChange={(event) => setVisits(visits.map((item, i) => i === index ? { ...item, date: event.target.value } : item))} />
            <div className="grid grid-cols-2 gap-3"><BookingField id={`time-${index}`} error={fieldErrors[`visits.${index}.startTime`]} label="Start time" type="time" min="07:00" max="22:00" required value={visit.startTime} onChange={(event) => setVisits(visits.map((item, i) => i === index ? { ...item, startTime: event.target.value, endTime: endTime(event.target.value, service?.durationMinutes) } : item))} /><BookingField id={`end-${index}`} error={fieldErrors[`visits.${index}.endTime`]} label="End time" type="time" value={visit.endTime} readOnly /></div>
            {visits.length > 1 && <Button variant="quiet" onClick={() => { clearErrors(); setVisits(visits.filter((_, i) => i !== index)); }}>Remove visit {index + 1}</Button>}
          </fieldset>)}
          <Button variant="secondary" disabled={visits.length >= 366} onClick={() => {
            clearErrors();
            const last = visits.at(-1);
            let date = initialDate;
            try { date = addCalendarDays(last.date, 1); } catch { /* Keep a usable date if the preceding field was cleared. */ }
            setVisits([...visits, { ...last, date }]);
          }}>Add another visit</Button>
        </>}
        {extraServices.length > 0 && <details open={Object.keys(fieldErrors).some((key) => key === "extras" || key.startsWith("extras.")) || undefined}><summary className="cursor-pointer py-2 font-semibold">Extras (optional)</summary><p className="my-2 text-sm">Enter the total quantity for the whole booking, including extra-pet charges when applicable.</p><div className="space-y-3">{extraServices.map((extra) => <BookingField key={extra.code} id={`extra-${extra.code}`} error={fieldErrors[`extras.${input().extras.findIndex((item) => item.code === extra.code)}.quantity`] || fieldErrors.extras} label={`${extra.name} · ${money(extra.basePriceCents)} each`} type="number" min="0" max="366" step="1" inputMode="numeric" value={extras[extra.code] || ""} onChange={(event) => setExtras({ ...extras, [extra.code]: event.target.value })} />)}</div></details>}
      </Card>
      <BookingField id="notes" error={fieldErrors["notes"]} label="Care notes (optional)" as="textarea" maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} hint="Care instructions are saved with this booking." />
      <Notice>Review the calculated total before saving. Pet selection is optional and does not automatically add extra-pet charges.</Notice>
    </fieldset>
    {error && <FormFeedback>{error}</FormFeedback>}
    <Button type="submit" className="w-full" disabled={busy || !serviceCode}>{busy ? "Calculating…" : "Review booking total"}</Button>
  </form>;
}
