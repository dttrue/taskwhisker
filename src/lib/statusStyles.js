// src/lib/statusStyles.js

export const STATUS_LABELS = {
  ALL: "All",
  REQUESTED: "Requested",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

export const STATUS_DOT_CLASSES = {
  REQUESTED: "bg-yellow-500",
  CONFIRMED: "bg-green-600",
  COMPLETED: "bg-blue-600",
  CANCELED: "bg-red-600",
};

export const STATUS_PILL_CLASSES = {
  REQUESTED: "bg-yellow-50 text-yellow-700 border-yellow-200",
  CONFIRMED: "bg-green-50 text-green-700 border-green-200",
  COMPLETED: "bg-blue-50 text-blue-700 border-blue-200",
  CANCELED: "bg-red-50 text-red-700 border-red-200",
};

export const STATUS_CARD_BORDER_CLASSES = {
  REQUESTED: "border-l-[6px] border-l-yellow-400",
  CONFIRMED: "border-l-[6px] border-l-green-500",
  COMPLETED: "border-l-[6px] border-l-blue-500",
  CANCELED: "border-l-[6px] border-l-red-500",
};
