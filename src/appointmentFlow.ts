import dayjs from "dayjs";
import { sendWhatsAppText } from "./whatsappClient";
import { persistAppointment, StoredAppointment } from "./storage";

export type AppointmentSessionState =
  | "awaitingService"
  | "awaitingDate"
  | "awaitingTime"
  | "awaitingName"
  | "awaitingConfirm";

export interface AppointmentSession {
  state: AppointmentSessionState;
  selectedServiceId?: string;
  selectedDate?: string; // YYYY-MM-DD
  selectedTime?: string; // HH:mm
  name?: string;
  lastInteractionUnixMs: number;
}

export interface ServiceOption {
  id: string;
  title: string;
}

export const serviceOptions: ServiceOption[] = [
  { id: "comprehensive", title: "Comprehensive Eye Exam" },
  { id: "cataract", title: "Cataract Clinic" },
  { id: "retina", title: "Retina Clinic" },
  { id: "pediatric", title: "Pediatric Eye Clinic" },
  { id: "lasik", title: "LASIK Consultation" },
];

export const phoneNumberToSession = new Map<string, AppointmentSession>();

export async function startConversation(
  userPhone: string,
  phoneNumberId?: string
): Promise<void> {
  phoneNumberToSession.set(userPhone, {
    state: "awaitingService",
    lastInteractionUnixMs: Date.now(),
  });
  const servicesList = serviceOptions
    .map((s) => `- ${s.title} (${s.id})`)
    .join("\n");
  const intro =
    "Welcome to Shivas Eye Care.\n" +
    "Please reply with the service id you want:\n" +
    servicesList;
  await sendWhatsAppText({ to: userPhone, body: intro, phoneNumberId });
}

function sanitizeServiceId(input: string): string | undefined {
  const value = String(input).trim().toLowerCase();
  const match = serviceOptions.find((s) => s.id === value);
  return match ? match.id : undefined;
}

function isValidDateYYYYMMDD(input: string): boolean {
  return dayjs(input, "YYYY-MM-DD", true).isValid();
}

function isValidTimeHHmm(input: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(input);
}

function isWithinBusinessHours(timeHHmm: string): boolean {
  const [hStr, mStr] = timeHHmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const allowedMinute = m === 0 || m === 30;
  return h >= 10 && (h < 17 || (h === 17 && m <= 30)) && allowedMinute;
}

export async function handleUserReply(
  userPhone: string,
  text: string,
  phoneNumberId?: string
): Promise<void> {
  const now = Date.now();
  const existing = phoneNumberToSession.get(userPhone);
  const message = text.trim();

  if (!existing && /^\s*(hi|hello)\b/i.test(message)) {
    await startConversation(userPhone, phoneNumberId);
    return;
  }

  if (!existing) {
    await sendWhatsAppText({
      to: userPhone,
      phoneNumberId,
      body:
        "Hi! To book an appointment, reply with 'hi'. I'll guide you step-by-step.",
    });
    return;
  }

  const session = existing;
  session.lastInteractionUnixMs = now;

  if (session.state === "awaitingService") {
    const serviceId = sanitizeServiceId(message);
    if (!serviceId) {
      const again =
        "Please choose one of these service ids:\n" +
        serviceOptions.map((s) => `- ${s.title} (${s.id})`).join("\n");
      await sendWhatsAppText({ to: userPhone, phoneNumberId, body: again });
      return;
    }
    session.selectedServiceId = serviceId;
    session.state = "awaitingDate";
    await sendWhatsAppText({
      to: userPhone,
      phoneNumberId,
      body:
        "Great. Please send your preferred date in YYYY-MM-DD format (e.g., 2025-09-15).",
    });
    return;
  }

  if (session.state === "awaitingDate") {
    if (!isValidDateYYYYMMDD(message)) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Invalid date. Use YYYY-MM-DD (e.g., 2025-09-15).",
      });
      return;
    }
    const chosen = dayjs(message);
    const today = dayjs().startOf("day");
    if (!chosen.isAfter(today)) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Please choose a future date.",
      });
      return;
    }
    session.selectedDate = chosen.format("YYYY-MM-DD");
    session.state = "awaitingTime";
    await sendWhatsAppText({
      to: userPhone,
      phoneNumberId,
      body:
        "Thanks. Send preferred time in 24h HH:mm (10:00 to 17:30, 30-min slots).",
    });
    return;
  }

  if (session.state === "awaitingTime") {
    if (!isValidTimeHHmm(message) || !isWithinBusinessHours(message)) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body:
          "Invalid time. Use HH:mm between 10:00 and 17:30 in 30-min steps (e.g., 10:00, 10:30).",
      });
    } else {
      session.selectedTime = message;
      session.state = "awaitingName";
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Got it. What name should we book under?",
      });
    }
    return;
  }

  if (session.state === "awaitingName") {
    const name = message.replace(/[^\p{L} .'-]/gu, "").trim();
    if (!name) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Please send a valid name.",
      });
      return;
    }
    session.name = name;
    session.state = "awaitingConfirm";
    const serviceTitle =
      serviceOptions.find((s) => s.id === session.selectedServiceId)?.title ||
      "Eye Exam";
    const summary =
      `Please confirm your appointment:\n` +
      `- Service: ${serviceTitle}\n` +
      `- Date: ${session.selectedDate}\n` +
      `- Time: ${session.selectedTime}\n` +
      `- Name: ${session.name}\n\n` +
      `Reply 'yes' to confirm or 'no' to restart.`;
    await sendWhatsAppText({ to: userPhone, phoneNumberId, body: summary });
    return;
  }

  if (session.state === "awaitingConfirm") {
    if (/^\s*yes\s*$/i.test(message)) {
      const serviceTitle =
        serviceOptions.find((s) => s.id === session.selectedServiceId)?.title ||
        "Eye Exam";
      const appt: StoredAppointment = {
        id: `${Date.now()}-${userPhone}`,
        userPhone,
        serviceId: session.selectedServiceId || "eye",
        serviceTitle,
        date: session.selectedDate || "",
        time: session.selectedTime || "",
        name: session.name || "",
        createdAtIso: new Date().toISOString(),
      };
      await persistAppointment(appt);
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body:
          `Confirmed! ${serviceTitle} on ${session.selectedDate} at ${session.selectedTime} for ${session.name}.\n` +
          `Shivas Eye Care will contact you if any changes are needed.`,
      });
      phoneNumberToSession.delete(userPhone);
      return;
    }
    if (/^\s*no\s*$/i.test(message)) {
      phoneNumberToSession.delete(userPhone);
      await startConversation(userPhone, phoneNumberId);
      return;
    }
    await sendWhatsAppText({
      to: userPhone,
      phoneNumberId,
      body: "Please reply 'yes' to confirm or 'no' to restart.",
    });
    return;
  }
}


