// src/app/book/buildPublicBookingPayload.js
const WEIGHT_CLASS_LABELS = {
  TOY: "Toy · under 10 lbs",
  SMALL_10_25: "Small · 10–25 lbs",
  MEDIUM_26_50: "Medium · 26–50 lbs",
  LARGE_51_80: "Large · 51–80 lbs",
  XL_81_PLUS: "XL · 81+ lbs",
};

const DOG_SIZE_LABELS = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
};

function formatDogSizes(dogSize = []) {
  if (!Array.isArray(dogSize) || dogSize.length === 0) return undefined;
  return dogSize.map((value) => DOG_SIZE_LABELS[value] || value);
}

function formatWeightClass(weightClass) {
  if (!weightClass) return undefined;
  return WEIGHT_CLASS_LABELS[weightClass] || weightClass;
}

function buildPetDetailsNote({ notes, dogSize, weightClass }) {
  const dogSizeLabels = formatDogSizes(dogSize);
  const weightClassLabel = formatWeightClass(weightClass);

  const detailLines = [];

  if (dogSizeLabels?.length) {
    detailLines.push(`Dog size: ${dogSizeLabels.join(", ")}`);
  }

  if (weightClassLabel) {
    detailLines.push(`Weight class: ${weightClassLabel}`);
  }

  const trimmedNotes = notes?.trim();

  if (!detailLines.length) {
    return trimmedNotes || undefined;
  }

  const detailBlock = `Pet details:\n- ${detailLines.join("\n- ")}`;

  if (!trimmedNotes) {
    return detailBlock;
  }

  return `${trimmedNotes}\n\n${detailBlock}`;
}

export function buildPublicBookingPayload({
  payloadService,
  isRange,
  range,
  selectedDateStrs,
  scheduleMode,
  slotsByDate,
  times,
  addOns,
  nailTrimExtra,
  bathExtra,
  client,
  serviceLocation,
  notes,
  dogSize = [],
  weightClass = "",
}) {
  if (!payloadService) {
    throw new Error("Service configuration is missing.");
  }

  let mode;
  let startDate;
  let endDate;
  let datesArray;

  if (isRange) {
    if (!range?.from || !range?.to) {
      throw new Error("Range dates are missing.");
    }

    mode = "RANGE";
    startDate = range.from.toISOString().slice(0, 10);
    endDate = range.to.toISOString().slice(0, 10);
  } else {
    mode = "MULTIPLE";
    datesArray = selectedDateStrs;
  }

  const visitCount =
    !isRange && scheduleMode === "CUSTOM"
      ? Object.values(slotsByDate || {}).reduce(
          (sum, slots) => sum + (Array.isArray(slots) ? slots.length : 0),
          0
        )
      : Math.max(selectedDateStrs.length, 1);

  const addOnsPayload = [];

  if (addOns?.nailTrim?.enabled) {
    if (!nailTrimExtra) {
      throw new Error("Nail trim is not available for this service.");
    }

    addOnsPayload.push({
      code: nailTrimExtra.code,
      appliesTo: addOns.nailTrim.appliesTo,
      quantity: addOns.nailTrim.appliesTo === "EACH_VISIT" ? visitCount : 1,
    });
  }

  if (addOns?.bath?.enabled) {
    if (!bathExtra) {
      throw new Error("Bath is not available for this service.");
    }

    addOnsPayload.push({
      code: bathExtra.code,
      appliesTo: addOns.bath.appliesTo,
      quantity: addOns.bath.appliesTo === "EACH_VISIT" ? visitCount : 1,
      smallDogs: addOns.bath.smallDogs,
      largeDogs: addOns.bath.largeDogs,
    });
  }

  const schedulePayload =
    !isRange && scheduleMode === "CUSTOM"
      ? {
          scheduleMode: "CUSTOM",
          slotsByDate,
        }
      : {
          scheduleMode: "SAME",
          startTime: times.startTime,
          endTime: times.endTime,
        };

  return {
    serviceType: payloadService.serviceType,
    serviceCode: payloadService.code,
    serviceSummary: payloadService.label ?? payloadService.name,

    client: {
      name: client.name,
      email: client.email,
      phone: client.phone || undefined,
    },

    serviceAddressLine1: serviceLocation.addressLine1 || undefined,
    serviceAddressLine2: serviceLocation.addressLine2 || undefined,
    serviceCity: serviceLocation.city || undefined,
    serviceState: serviceLocation.state || undefined,
    servicePostalCode: serviceLocation.postalCode || undefined,
    serviceCountry: serviceLocation.country || "US",
    accessInstructions: serviceLocation.accessInstructions || undefined,
    locationNotes: serviceLocation.locationNotes || undefined,

    mode,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    dates: datesArray || undefined,

    ...schedulePayload,

    addOns: addOnsPayload.length ? addOnsPayload : undefined,

    petDetails:
      formatDogSizes(dogSize)?.length || formatWeightClass(weightClass)
        ? {
            dogSize: formatDogSizes(dogSize),
            weightClass: formatWeightClass(weightClass),
          }
        : undefined,

    notes: buildPetDetailsNote({
      notes,
      dogSize,
      weightClass,
    }),
  };
}

export function validateClientInfoStep({ client, serviceLocation }) {
  if (!client?.name?.trim()) return "Name is required.";
  if (!client?.email?.trim()) return "Email is required.";
  if (!serviceLocation?.addressLine1?.trim())
    return "Service address is required.";
  if (!serviceLocation?.city?.trim()) return "Service city is required.";
  if (!serviceLocation?.state?.trim()) return "Service state is required.";
  if (!serviceLocation?.postalCode?.trim())
    return "Service postal code is required.";
  return null;
}
