type RelativeUnit = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";

const RELATIVE_THRESHOLDS: Array<[number, RelativeUnit]> = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4, "week"],
  [12, "month"],
  [Number.POSITIVE_INFINITY, "year"],
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const formatRelativeUnit = (value: number, unit: RelativeUnit): string => {
  if (value === 0) return "now";
  const abs = Math.abs(value);
  const label = `${abs} ${unit}${abs === 1 ? "" : "s"}`;
  return value < 0 ? `${label} ago` : `in ${label}`;
};

export const formatRelativeTime = (iso: string): string => {
  let value = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [step, unit] of RELATIVE_THRESHOLDS) {
    if (Math.abs(value) < step) return formatRelativeUnit(Math.round(value), unit);
    value /= step;
  }
  return formatRelativeUnit(Math.round(value), "year");
};

export const formatDayLabel = () => {
  const date = new Date();
  return `${WEEKDAYS[date.getDay()]} · ${MONTHS[date.getMonth()]} ${date.getDate()}`.toUpperCase();
};

export const formatGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};
