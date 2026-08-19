// src/app/book/steps/BookingStepAddOns.jsx
"use client";

import { FieldGroup, FormField, Notice } from "@/components/ui/Foundation";

function getAddonTitle(extra) {
  if (!extra) return "";
  return extra.label ?? extra.name ?? extra.code ?? "Add-on";
}

function getAddonPrice(extra) {
  return (Number(extra?.basePriceCents || 0) / 100).toFixed(2);
}

export default function BookingStepAddOns({
  nailTrimExtra,
  bathExtra,
  addOns,
  toggleAddOn,
  setAddOnField,
}) {
  function setNailTrimAppliesTo(value) {
    setAddOnField("nailTrim", "appliesTo", value);
  }

  function setBathAppliesTo(value) {
    setAddOnField("bath", "appliesTo", value);
  }

  function setBathCount(field, value) {
    setAddOnField("bath", field, Number(value));
  }

  return (
    <div className="space-y-4">
      {nailTrimExtra && (
        <section className={`rounded-[var(--task-radius-control)] border p-4 transition-colors sm:p-5 ${addOns.nailTrim.enabled ? "border-[var(--task-primary)] bg-[var(--task-success-soft)]" : "border-[var(--task-border)] bg-white"}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <label htmlFor="nail-trim-addon" className="text-base font-semibold text-[var(--task-text)]">
                {getAddonTitle(nailTrimExtra)}
              </label>

              <div className="mt-1 text-sm text-[var(--task-text-muted)]">
                +${getAddonPrice(nailTrimExtra)}
                {typeof nailTrimExtra.durationMinutes === "number"
                  ? ` · +${nailTrimExtra.durationMinutes} min`
                  : ""}
              </div>
            </div>

            <input
              id="nail-trim-addon"
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--task-primary)]"
              checked={addOns.nailTrim.enabled}
              onChange={() => toggleAddOn("nailTrim")}
            />
          </div>

          {addOns.nailTrim.enabled && (
            <div className="mt-4">
              <FieldGroup legend="Applies">
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={addOns.nailTrim.appliesTo === "ONCE"}
                  className={`min-h-11 rounded-[var(--task-radius-control)] border px-3 py-2 text-sm font-semibold ${
                    addOns.nailTrim.appliesTo === "ONCE"
                      ? "border-[var(--task-primary)] bg-[var(--task-primary)] text-white"
                      : "border-[var(--task-border-strong)] bg-white text-[var(--task-text)]"
                  }`}
                  onClick={() => setNailTrimAppliesTo("ONCE")}
                >
                  Once
                </button>

                <button
                  type="button"
                  aria-pressed={addOns.nailTrim.appliesTo === "EACH_VISIT"}
                  className={`min-h-11 rounded-[var(--task-radius-control)] border px-3 py-2 text-sm font-semibold ${
                    addOns.nailTrim.appliesTo === "EACH_VISIT"
                      ? "border-[var(--task-primary)] bg-[var(--task-primary)] text-white"
                      : "border-[var(--task-border-strong)] bg-white text-[var(--task-text)]"
                  }`}
                  onClick={() => setNailTrimAppliesTo("EACH_VISIT")}
                >
                  Each visit
                </button>
              </div>
              </FieldGroup>
            </div>
          )}
        </section>
      )}

      {bathExtra && (
        <section className={`rounded-[var(--task-radius-control)] border p-4 transition-colors sm:p-5 ${addOns.bath.enabled ? "border-[var(--task-primary)] bg-[var(--task-success-soft)]" : "border-[var(--task-border)] bg-white"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <label htmlFor="bath-addon" className="text-base font-semibold text-[var(--task-text)]">
                {getAddonTitle(bathExtra)}
              </label>

              <div className="mt-1 text-sm text-[var(--task-text-muted)]">
                +${getAddonPrice(bathExtra)}
                {typeof bathExtra.durationMinutes === "number"
                  ? ` · +${bathExtra.durationMinutes} min`
                  : ""}
              </div>
            </div>

            <input
              id="bath-addon"
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-[var(--task-primary)]"
              checked={addOns.bath.enabled}
              onChange={() => toggleAddOn("bath")}
            />
          </div>

          {addOns.bath.enabled && (
            <div className="mt-3 space-y-3">
              <div>
                <FieldGroup legend="Applies">
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={addOns.bath.appliesTo === "ONCE"}
                    className={`min-h-11 rounded-[var(--task-radius-control)] border px-3 py-2 text-sm font-semibold ${
                      addOns.bath.appliesTo === "ONCE"
                        ? "border-[var(--task-primary)] bg-[var(--task-primary)] text-white"
                        : "border-[var(--task-border-strong)] bg-white text-[var(--task-text)]"
                    }`}
                    onClick={() => setBathAppliesTo("ONCE")}
                  >
                    Once
                  </button>

                  <button
                    type="button"
                    aria-pressed={addOns.bath.appliesTo === "EACH_VISIT"}
                    className={`min-h-11 rounded-[var(--task-radius-control)] border px-3 py-2 text-sm font-semibold ${
                      addOns.bath.appliesTo === "EACH_VISIT"
                        ? "border-[var(--task-primary)] bg-[var(--task-primary)] text-white"
                        : "border-[var(--task-border-strong)] bg-white text-[var(--task-text)]"
                    }`}
                    onClick={() => setBathAppliesTo("EACH_VISIT")}
                  >
                    Each visit
                  </button>
                </div>
                </FieldGroup>
              </div>

              <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
                  <FormField
                    id="bath-small-dogs"
                    label="Small dogs"
                    type="number"
                    min={0}
                    value={addOns.bath.smallDogs}
                    onChange={(e) => setBathCount("smallDogs", e.target.value)}
                  />

                  <FormField
                    id="bath-large-dogs"
                    label="Large dogs"
                    type="number"
                    min={0}
                    value={addOns.bath.largeDogs}
                    onChange={(e) => setBathCount("largeDogs", e.target.value)}
                  />
              </div>

              <p className="text-xs text-[var(--task-text-muted)]">
                Not sure? You can leave counts at 0 and clarify in notes.
              </p>
            </div>
          )}
        </section>
      )}

      {!nailTrimExtra && !bathExtra && (
        <Notice>No add-ons available for this service.</Notice>
      )}

      <p className="text-xs text-[var(--task-text-muted)]">
        Add-ons affect pricing and visit duration.
      </p>
    </div>
  );
}
