// src/app/book/steps/BookingStepAddOns.jsx
"use client";

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
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900">
                {getAddonTitle(nailTrimExtra)}
              </div>

              <div className="mt-1 text-xs text-zinc-500">
                +${getAddonPrice(nailTrimExtra)}
                {typeof nailTrimExtra.durationMinutes === "number"
                  ? ` · +${nailTrimExtra.durationMinutes} min`
                  : ""}
              </div>
            </div>

            <input
              type="checkbox"
              className="toggle toggle-primary mt-0.5 shrink-0"
              checked={addOns.nailTrim.enabled}
              onChange={() => toggleAddOn("nailTrim")}
            />
          </div>

          {addOns.nailTrim.enabled && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium text-zinc-900">
                Applies
              </div>

              <div className="join join-vertical sm:join-horizontal">
                <button
                  type="button"
                  className={`btn btn-sm join-item ${
                    addOns.nailTrim.appliesTo === "ONCE"
                      ? "btn-primary"
                      : "btn-ghost"
                  }`}
                  onClick={() => setNailTrimAppliesTo("ONCE")}
                >
                  Once
                </button>

                <button
                  type="button"
                  className={`btn btn-sm join-item ${
                    addOns.nailTrim.appliesTo === "EACH_VISIT"
                      ? "btn-primary"
                      : "btn-ghost"
                  }`}
                  onClick={() => setNailTrimAppliesTo("EACH_VISIT")}
                >
                  Each visit
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {bathExtra && (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-zinc-900">
                {getAddonTitle(bathExtra)}
              </div>

              <div className="mt-1 text-xs text-zinc-500">
                +${getAddonPrice(bathExtra)}
                {typeof bathExtra.durationMinutes === "number"
                  ? ` · +${bathExtra.durationMinutes} min`
                  : ""}
              </div>
            </div>

            <input
              type="checkbox"
              className="toggle toggle-primary shrink-0"
              checked={addOns.bath.enabled}
              onChange={() => toggleAddOn("bath")}
            />
          </div>

          {addOns.bath.enabled && (
            <div className="mt-3 space-y-3">
              <div>
                <div className="mb-1 text-xs font-medium text-zinc-900">
                  Applies
                </div>

                <div className="join join-vertical sm:join-horizontal">
                  <button
                    type="button"
                    className={`btn btn-sm join-item ${
                      addOns.bath.appliesTo === "ONCE"
                        ? "btn-primary"
                        : "btn-ghost"
                    }`}
                    onClick={() => setBathAppliesTo("ONCE")}
                  >
                    Once
                  </button>

                  <button
                    type="button"
                    className={`btn btn-sm join-item ${
                      addOns.bath.appliesTo === "EACH_VISIT"
                        ? "btn-primary"
                        : "btn-ghost"
                    }`}
                    onClick={() => setBathAppliesTo("EACH_VISIT")}
                  >
                    Each visit
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-900">
                    Small dogs
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={addOns.bath.smallDogs}
                    onChange={(e) => setBathCount("smallDogs", e.target.value)}
                    className="mt-1 block w-full rounded border px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-900">
                    Large dogs
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={addOns.bath.largeDogs}
                    onChange={(e) => setBathCount("largeDogs", e.target.value)}
                    className="mt-1 block w-full rounded border px-3 py-2"
                  />
                </div>
              </div>

              <p className="text-xs text-zinc-500">
                Not sure? You can leave counts at 0 and clarify in notes.
              </p>
            </div>
          )}
        </div>
      )}

      {!nailTrimExtra && !bathExtra && (
        <div className="rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-600">
          No add-ons available for this service.
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Add-ons affect pricing and visit duration.
      </p>
    </div>
  );
}
