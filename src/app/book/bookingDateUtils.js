// app/book/bookingDateUtils.js
export function combineDateTime(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00`);
}

export function getDateListFromRange(start, end) {
  const result = [];

  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error("Invalid date range.");
  }

  if (endDate <= startDate) {
    throw new Error("End date must be after start date.");
  }

  const cursor = new Date(startDate);

  while (cursor < endDate) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}
