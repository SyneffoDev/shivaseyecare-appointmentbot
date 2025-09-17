import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);

export function dayOfWeekLabel(inputDate: string): string {
  const d = dayjs(
    inputDate,
    ["YYYY-MM-DD", "YYYY-M-D", "DD/MM/YYYY", "D/M/YYYY"],
    true
  );
  return d.isValid() ? d.format("dddd") : "";
}

export function toIsoDateFromDisplay(displayDate: string): string {
  const d = dayjs(displayDate, ["DD/MM/YYYY", "D/M/YYYY"], true);
  return d.isValid() ? d.format("YYYY-MM-DD") : displayDate;
}

export function formatDisplayDateWithDay(displayDate: string): string {
  const d = dayjs(displayDate, ["DD/MM/YYYY", "D/M/YYYY"], true);
  return d.isValid()
    ? `${d.format("DD/MM/YYYY")} (${d.format("dddd")})`
    : displayDate;
}

export function formatDbDateWithDay(value: unknown): string {
  if (value instanceof Date) {
    const d = dayjs(value);
    return `${d.format("DD/MM/YYYY")} (${d.format("dddd")})`;
  }
  if (typeof value === "string") {
    let d = dayjs(
      value,
      ["YYYY-MM-DD", "YYYY-M-D", "DD/MM/YYYY", "D/M/YYYY"],
      true
    );
    if (!d.isValid()) {
      d = dayjs(value);
    }
    return d.isValid()
      ? `${d.format("DD/MM/YYYY")} (${d.format("dddd")})`
      : value;
  }
  if (typeof value === "number") {
    const d = dayjs(value);
    return d.isValid()
      ? `${d.format("DD/MM/YYYY")} (${d.format("dddd")})`
      : String(value);
  }
  return "";
}

export function getNext7Days(): string[] {
  const today = dayjs();
  return Array.from({ length: 7 }, (_, i) =>
    today.add(i + 1, "day").format("DD/MM/YYYY")
  );
}
