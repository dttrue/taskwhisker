// app/book/bookingSchemas.js
import { z } from "zod";

export const timeStr = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Time must be HH:MM (24h)");

export const slotSchema = z.object({
  startTime: timeStr,
  endTime: timeStr,
});

export const addOnSchema = z.object({
  code: z.string().min(1, "Add-on code is required"),
  appliesTo: z.enum(["ONCE", "EACH_VISIT"]).optional().default("ONCE"),
  quantity: z.number().int().positive().optional().default(1),
  smallDogs: z.number().int().nonnegative().optional(),
  largeDogs: z.number().int().nonnegative().optional(),
});

export const coordinateSchema = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined || val === "") return null;
    const num = typeof val === "number" ? val : Number(val);
    return Number.isFinite(num) ? num : null;
  });

export const optionalTrimmedString = z
  .string()
  .optional()
  .transform((val) => {
    if (!val) return undefined;
    const trimmed = val.trim();
    return trimmed.length ? trimmed : undefined;
  });

  export const publicBookingSchema = z
    .object({
      serviceType: z.string().optional(),
      serviceCode: z.string().min(1, "Service code is required"),
      serviceSummary: z.string().optional(),
      basePriceCentsPerVisit: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .default(0),

      client: z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Valid email is required"),
        phone: z.string().optional(),
      }),

      serviceAddressLine1: optionalTrimmedString,
      serviceAddressLine2: optionalTrimmedString,
      serviceCity: optionalTrimmedString,
      serviceState: optionalTrimmedString,
      servicePostalCode: optionalTrimmedString,
      serviceCountry: optionalTrimmedString,

      serviceLat: coordinateSchema,
      serviceLng: coordinateSchema,

      accessInstructions: optionalTrimmedString,
      locationNotes: optionalTrimmedString,

      petDetails: z
        .object({
          dogSize: z
            .array(z.enum(["SMALL", "MEDIUM", "LARGE"]))
            .optional()
            .default([]),
          weightClass: z
            .enum([
              "TOY",
              "SMALL_10_25",
              "MEDIUM_26_50",
              "LARGE_51_80",
              "XL_81_PLUS",
            ])
            .optional(),
        })
        .optional(),

      mode: z.enum(["RANGE", "MULTIPLE"]),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      dates: z.array(z.string()).optional(),

      scheduleMode: z.enum(["SAME", "CUSTOM"]).optional().default("SAME"),

      startTime: timeStr.optional(),
      endTime: timeStr.optional(),

      slotsByDate: z
        .record(z.string(), z.array(slotSchema))
        .optional()
        .default({}),

      addOns: z.array(addOnSchema).optional().default([]),

      notes: z.string().max(1000).optional(),
    })
    .superRefine((val, ctx) => {
      const isOvernight = val.serviceType === "OVERNIGHT";

      if (val.mode === "RANGE") {
        if (!val.startDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "startDate is required for RANGE mode.",
            path: ["startDate"],
          });
        }

        if (!val.endDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "endDate is required for RANGE mode.",
            path: ["endDate"],
          });
        }
      } else if (!val.dates || val.dates.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one date is required for MULTIPLE mode.",
          path: ["dates"],
        });
      }

      if (isOvernight && val.scheduleMode === "CUSTOM") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Overnight bookings cannot use custom per-date time slots.",
          path: ["scheduleMode"],
        });
      }

      if (val.scheduleMode === "SAME") {
        if (!val.startTime) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "startTime is required when scheduleMode is SAME.",
            path: ["startTime"],
          });
        }

        if (!val.endTime) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "endTime is required when scheduleMode is SAME.",
            path: ["endTime"],
          });
        }
      }

      if (val.scheduleMode === "CUSTOM") {
        const totalSlots = Object.values(val.slotsByDate || {}).reduce(
          (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
          0
        );

        if (totalSlots === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please add at least one time slot.",
            path: ["slotsByDate"],
          });
        }
      }

      if (
        val.serviceLat != null &&
        (val.serviceLat < -90 || val.serviceLat > 90)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Latitude must be between -90 and 90.",
          path: ["serviceLat"],
        });
      }

      if (
        val.serviceLng != null &&
        (val.serviceLng < -180 || val.serviceLng > 180)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Longitude must be between -180 and 180.",
          path: ["serviceLng"],
        });
      }
    });