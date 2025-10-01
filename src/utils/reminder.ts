import { sendWhatsAppTemplate } from "./whatsappAPI";
import { getAppointmentsByDate } from "../db/appointmentHelpers";
import { dayOfWeekLabel } from "./dateHelper";
import dayjs from "dayjs";

function formatDate(input: string): string {
  const formats = ["YYYY-MM-DD", "YYYY-M-D", "DD/MM/YYYY", "D/M/YYYY"];
  for (const fmt of formats) {
    const d = dayjs(input, fmt, true);
    if (d.isValid()) return d.format("DD/MM/YYYY");
  }
  const loose = dayjs(input);
  return loose.isValid() ? loose.format("DD/MM/YYYY") : input;
}

export async function sendReminder(date: string) {
  const appointments = await getAppointmentsByDate(date);

  const today = dayjs().format("DD/MM/YYYY");
  const formattedDate = formatDate(date);

  for (const appointment of appointments) {
    const newDate = formatDate(appointment.date);
    await sendWhatsAppTemplate({
      to: appointment.userPhone,
      templateName: "reminder",
      templateLanguage: "en",
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: appointment.name,
            },
            {
              type: "text",
              text: formattedDate === today ? "Today" : "Tomorrow",
            },
            {
              type: "text",
              text: `${newDate} (${dayOfWeekLabel(newDate)})`,
            },
            {
              type: "text",
              text: appointment.time,
            },
            {
              type: "text",
              text: "G.Ramesh Babu",
            },
          ],
        },
      ],
    });
  }
}

const sentOneHourCache = new Map<string, number>(); // key -> expiresAt (unix ms)
const REMINDER_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

function parseApptDateTime(dateStr: string, timeStr: string) {
  const d = dayjs(dateStr, ["YYYY-MM-DD", "YYYY-M-D"], true);
  if (!d.isValid()) return null;

  const timeFormats = [
    "h:mm A",
    "hh:mm A",
    "h A",
    "hh A",
    "H:mm",
    "HH:mm",
    "H",
  ];
  let t = dayjs(timeStr, timeFormats, true);
  if (!t.isValid()) {
    const withMinutes = timeStr.replace(/\b(\d{1,2})\s*(AM|PM)\b/i, "$1:00 $2");
    t = dayjs(withMinutes, timeFormats, true);
  }
  if (!t.isValid()) return null;

  const combined = dayjs(
    `${d.format("YYYY-MM-DD")} ${t.format("HH:mm")}`,
    "YYYY-MM-DD HH:mm",
    true
  );
  return combined.isValid() ? combined : null;
}

function cleanupSentCache(nowMs: number) {
  for (const [key, expiresAt] of sentOneHourCache.entries()) {
    if (expiresAt <= nowMs) sentOneHourCache.delete(key);
  }
}

export async function sendOneHourBeforeReminders(): Promise<void> {
  const now = dayjs();
  cleanupSentCache(now.valueOf());

  const todayIso = now.format("YYYY-MM-DD");
  const tomorrowIso = now.add(1, "day").format("YYYY-MM-DD");

  const [todayAppts, tomorrowAppts] = await Promise.all([
    getAppointmentsByDate(todayIso),
    getAppointmentsByDate(tomorrowIso),
  ]);

  for (const appt of [...todayAppts, ...tomorrowAppts]) {
    const when = parseApptDateTime(appt.date, appt.time);
    if (!when) continue;

    const minsUntil = when.diff(now, "minute");
    if (minsUntil >= 60 && minsUntil < 61) {
      const key = `${String(appt.id)}:${when.format("YYYY-MM-DDTHH:mm")}`;
      if (sentOneHourCache.has(key)) continue;
      sentOneHourCache.set(key, now.valueOf() + REMINDER_CACHE_TTL_MS);

      const newDate = formatDate(appt.date);
      await sendWhatsAppTemplate({
        to: appt.userPhone,
        templateName: "reminder",
        templateLanguage: "en",
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: appt.name },
              { type: "text", text: "Today" },
              { type: "text", text: `${newDate} (${dayOfWeekLabel(newDate)})` },
              { type: "text", text: appt.time },
              { type: "text", text: "G.Ramesh Babu" },
            ],
          },
        ],
      });
    }
  }
}
