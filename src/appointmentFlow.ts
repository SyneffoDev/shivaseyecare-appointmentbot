import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);
import { sendWhatsAppText } from "./whatsappClient";
import { persistAppointment, readAppointments, type StoredAppointment } from "./storage";

export type AppointmentSessionState =
  | "awaitingName"
  | "awaitingDate"
  | "awaitingTime"
  | "awaitingConfirm";

export interface AppointmentSession {
  state: AppointmentSessionState;
  selectedDate?: string; // DD/MM/YYYY for display
  selectedTime?: string; // e.g., 10:30 AM
  name?: string;
  lastInteractionUnixMs: number;
}

export const phoneNumberToSession = new Map<string, AppointmentSession>();

const availableSlots: string[] = [
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
];

function normalizeTimeLabel(input: string): string {
  return input.replace(/\s+/g, " ").trim().toUpperCase();
}

function isValidDateDDMMYYYY(input: string): boolean {
  return dayjs(input, "DD/MM/YYYY", true).isValid();
}

function dayOfWeekLabel(dateDDMMYYYY: string): string {
  const d = dayjs(dateDDMMYYYY, "DD/MM/YYYY", true);
  return d.isValid() ? d.format("dddd") : "";
}

export async function startConversation(
  userPhone: string,
  phoneNumberId?: string
): Promise<void> {
  phoneNumberToSession.set(userPhone, {
    state: "awaitingName",
    lastInteractionUnixMs: Date.now(),
  });
  const intro =
    "Great! Let’s book your appointment 📝\n\n" +
    "First, please tell me your full name.";
  await sendWhatsAppText({ to: userPhone, body: intro, phoneNumberId });
}

export async function handleUserReply(
  userPhone: string,
  text: string,
  phoneNumberId?: string
): Promise<void> {
  const now = Date.now();
  const existing = phoneNumberToSession.get(userPhone);
  const message = text.trim();

  if (!existing) {
    if (/^\s*book\s*$/i.test(message)) {
      await startConversation(userPhone, phoneNumberId);
    } else if (/^\s*view\s*$/i.test(message)) {
      await showAppointments(userPhone, phoneNumberId);
    } else {
      const defaultMsg =
        "Hello! Welcome to Shivas Eye Care \n\n" +
        "To book an appointment, please reply with:\n👉 book\n\n" +
        "To view your appointments, reply with:\n👉 view";
      await sendWhatsAppText({ to: userPhone, phoneNumberId, body: defaultMsg });
    }
    return;
  }

  const session = existing;
  session.lastInteractionUnixMs = now;

  // Allow viewing appointments anytime without changing flow
  if (/^\s*view\s*$/i.test(message)) {
    await showAppointments(userPhone, phoneNumberId);
    return;
  }

  if (session.state === "awaitingName") {
    const name = message.replace(/[^\p{L} .'-]/gu, "").trim();
    if (!name) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Please send your full name.",
      });
      return;
    }
    session.name = name;
    session.state = "awaitingDate";
    const askDate =
      `Thanks, ${name}! 🙏\n` +
      "Now, please tell me the date you’d like to book (format: DD/MM/YYYY).";
    await sendWhatsAppText({ to: userPhone, phoneNumberId, body: askDate });
    return;
  }

  if (session.state === "awaitingDate") {
    if (!isValidDateDDMMYYYY(message)) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Invalid date. Use DD/MM/YYYY (e.g., 05/09/2025).",
      });
      return;
    }
    const chosen = dayjs(message, "DD/MM/YYYY");
    const today = dayjs().startOf("day");
    if (!chosen.isAfter(today)) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Please choose a future date.",
      });
      return;
    }
    session.selectedDate = chosen.format("DD/MM/YYYY");
    session.state = "awaitingTime";
    const slotsList = availableSlots.map((s, i) => `${i + 1}. ${s}`).join("\n");
    const dayLabel = dayOfWeekLabel(session.selectedDate ?? "");
    const slotsMsg =
      `Perfect! 🎯\n\nHere are the available time slots for ${session.selectedDate} (${dayLabel}):\n\n` +
      `${slotsList}\n\n👉 Please reply with the time you prefer (e.g., 10:30 AM).`;
    await sendWhatsAppText({ to: userPhone, phoneNumberId, body: slotsMsg });
    return;
  }

  if (session.state === "awaitingTime") {
    const normalized = normalizeTimeLabel(message);
    const has = availableSlots.some((s) => normalizeTimeLabel(s) === normalized);
    if (!has) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body:
          "Please choose a time from the list above (e.g., 10:30 AM).",
      });
      return;
    }
    session.selectedTime = availableSlots.find(
      (s) => normalizeTimeLabel(s) === normalized
    );
    session.state = "awaitingConfirm";
    const dayLabel = dayOfWeekLabel(session.selectedDate || "");
    const preview =
      "✅ Thank you! Here are your appointment details:\n\n" +
      `👤 Name: ${session.name}\n` +
      `📅 Date: ${session.selectedDate} (${dayLabel})\n` +
      `🕒 Time: ${session.selectedTime}\n\n` +
      "👉 Please confirm by replying Yes or No.";
    await sendWhatsAppText({ to: userPhone, phoneNumberId, body: preview });
    return;
  }

  if (session.state === "awaitingConfirm") {
    if (/^\s*yes\s*$/i.test(message)) {
      const appt: StoredAppointment = {
        id: `${Date.now()}-${userPhone}`,
        userPhone,
        serviceId: "default",
        serviceTitle: "Eye Care Appointment",
        date: session.selectedDate || "",
        time: session.selectedTime || "",
        name: session.name || "",
        createdAtIso: new Date().toISOString(),
      };
      await persistAppointment(appt);
      const dayLabel = dayOfWeekLabel(session.selectedDate || "");
      const confirm =
        "🎉 Your appointment has been successfully booked!\n\n" +
        "📍 Appointment Confirmation – Shivas Eye Care\n" +
        `👤 Name: ${session.name}\n` +
        `📅 Date: ${session.selectedDate} (${dayLabel})\n` +
        `🕒 Time: ${session.selectedTime}\n\n` +
        "🏥 Hospital Details:\n" +
        "Shivas Eye Care\n" +
        "123, Main Road, Chennai – 600001\n" +
        "📞 +91 98765 43210\n\n" +
        "We look forward to seeing you! 👁️✨";
      await sendWhatsAppText({ to: userPhone, phoneNumberId, body: confirm });
      phoneNumberToSession.delete(userPhone);
      return;
    }
    if (/^\s*no\s*$/i.test(message)) {
      phoneNumberToSession.delete(userPhone);
      const cancel =
        "❌ Appointment not confirmed.\n" +
        "Would you like to try booking again?\n👉 Reply with book to restart the process.";
      await sendWhatsAppText({ to: userPhone, phoneNumberId, body: cancel });
      return;
    }
    await sendWhatsAppText({
      to: userPhone,
      phoneNumberId,
      body: "Please reply Yes to confirm or No to cancel.",
    });
    return;
  }
}

async function showAppointments(
  userPhone: string,
  phoneNumberId?: string
): Promise<void> {
  const list: StoredAppointment[] = await readAppointments();
  const mine = list.filter((a: StoredAppointment) => a.userPhone === userPhone);
  if (mine.length === 0) {
    await sendWhatsAppText({
      to: userPhone,
      phoneNumberId,
      body: "You don't have any appointments yet. Reply with 'book' to create one.",
    });
    return;
  }
  const lines = mine
    .slice(-5)
    .map((a: StoredAppointment, i: number) =>
      `${i + 1}. ${a.date} at ${a.time} — ${a.serviceTitle} (for ${a.name})`
    )
    .join("\n");
  const msg =
    "Here are your recent appointments:\n\n" +
    lines +
    "\n\nReply 'book' to schedule another appointment.";
  await sendWhatsAppText({ to: userPhone, phoneNumberId, body: msg });
}



