import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);
import { sendWhatsAppText } from "./whatsappClient";
import {
  persistAppointment,
  readAppointments,
  deleteAppointment,
  updateAppointment,
  type StoredAppointment,
} from "./storage";

import type { AppointmentSession } from "./utils/types";

export const phoneNumberToSession = new Map<string, AppointmentSession>();

// ✅ Slots for Sunday and weekdays
const sundaySlots: string[] = [
  "10:00 AM",
  "10:20 AM",
  "10:40 AM",
  "11:00 AM",
  "11:20 AM",
  "11:40 AM",
  "12:00 PM",
  "12:20 PM",
  "12:40 PM",
];

const weekdaySlots: string[] = [
  "10:00 AM",
  "10:20 AM",
  "10:40 AM",
  "11:00 AM",
  "11:20 AM",
  "11:40 AM",
  "12:00 PM",
  "12:20 PM",
  "12:40 PM",
  "04:30 PM",
  "04:50 PM",
  "05:10 PM",
  "05:30 PM",
  "05:50 PM",
  "06:10 PM",
  "06:30 PM",
  "06:50 PM",
  "07:10 PM",
  "07:30 PM",
  "07:50 PM",
];

function normalizeTimeLabel(input: string): string {
  return input.replace(/\s+/g, " ").trim().toUpperCase();
}

// function isValidDateDDMMYYYY(input: string): boolean {
//   return dayjs(input, "DD/MM/YYYY", true).isValid();
// }

function dayOfWeekLabel(dateDDMMYYYY: string): string {
  const d = dayjs(dateDDMMYYYY, "DD/MM/YYYY", true);
  return d.isValid() ? d.format("dddd") : "";
}

// ✅ Get available slots dynamically based on day
function getBaseSlots(date: string): string[] {
  const day = dayOfWeekLabel(date);
  return day === "Sunday" ? sundaySlots : weekdaySlots;
}

// ✅ Fetch and filter slots by removing already booked times for that date
async function getAvailableSlots(date: string): Promise<string[]> {
  const baseSlots = getBaseSlots(date);
  const allAppointments = await readAppointments();
  const bookedSlots = allAppointments
    .filter((a) => a.date === date)
    .map((a) => normalizeTimeLabel(a.time));

  // Remove booked slots from the base slots
  return baseSlots.filter(
    (slot) => !bookedSlots.includes(normalizeTimeLabel(slot))
  );
}

const mainMenuMessage =
  "Hello! 👋 Welcome to Shivas Eye Care 🏥 \n" +
  "How can we assist you today? \n\n" +
  "Please choose an option below:\n" +
  "1️⃣ Book an Appointment \n" +
  "2️⃣ Reschedule Appointment \n" +
  "3️⃣ Cancel Appointment \n" +
  "4️⃣ View Appointment Details \n" +
  "5️⃣ Contact Support";

const contactDetails =
  "📞 Shivas Eye Care Contact:\n" +
  "044-2618-2803 or 044-2618-6500\n" +
  "📍 Plot no. 1818 ( New no. 134), 13th Main Road, Anna Nagar, Chennai";

function getNext7Days(): string[] {
  const today = dayjs();
  return Array.from({ length: 7 }, (_, i) =>
    today.add(i + 1, "day").format("DD/MM/YYYY")
  );
}

export async function handleUserReply(
  userPhone: string,
  text: string,
  phoneNumberId?: string
): Promise<void> {
  const now = Date.now();
  const existing: AppointmentSession | undefined =
    phoneNumberToSession.get(userPhone);
  const message = text.trim().toLowerCase();

  if (!existing) {
    phoneNumberToSession.set(userPhone, {
      state: "mainMenu",
      lastInteractionUnixMs: now,
    });
    await sendWhatsAppText({
      to: userPhone,
      phoneNumberId,
      body: mainMenuMessage,
    });
    return;
  }

  const session: AppointmentSession = existing;
  session.lastInteractionUnixMs = now;

  // MAIN MENU
  if (session.state === "mainMenu") {
    if (message === "1" || message.includes("book")) {
      session.state = "awaitingName";
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Great! Please enter your full name:",
      });
      return;
    } else if (message === "2" || message.includes("reschedule")) {
      const existingAppointments = await readAppointments();
      const userAppt = existingAppointments.find(
        (a) => a.userPhone === userPhone
      );
      if (userAppt) {
        const dateOptions = getNext7Days();
        session.dateOptions = dateOptions;
        session.state = "rescheduleNewDate";

        const dateMsg =
          `Your current appointment:\n${userAppt.date} at ${userAppt.time}\n\nPlease choose a new date:\n` +
          dateOptions
            .map((d, i) => `${String(i + 1)}. ${d} (${dayOfWeekLabel(d)})`)
            .join("\n");

        await sendWhatsAppText({ to: userPhone, phoneNumberId, body: dateMsg });
      } else {
        await sendWhatsAppText({
          to: userPhone,
          phoneNumberId,
          body: "No booking found. Reply 'book' to create a new appointment.",
        });
      }
      return;
    } else if (message === "3" || message.includes("cancel")) {
      const existingAppointments = await readAppointments();
      const userAppt = existingAppointments.find(
        (a) => a.userPhone === userPhone
      );
      if (userAppt) {
        session.state = "confirmCancel";
        await sendWhatsAppText({
          to: userPhone,
          phoneNumberId,
          body: `Are you sure you want to cancel your appointment on ${userAppt.date} at ${userAppt.time}? (yes/no)`,
        });
      } else {
        await sendWhatsAppText({
          to: userPhone,
          phoneNumberId,
          body: "No appointment found to cancel.",
        });
      }
      return;
    } else if (message === "4" || message.includes("view")) {
      await showAppointments(userPhone, phoneNumberId);
      phoneNumberToSession.delete(userPhone);
      return;
    } else if (message === "5" || message.includes("contact")) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: contactDetails,
      });
      phoneNumberToSession.delete(userPhone);
      return;
    } else {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: mainMenuMessage,
      });
      return;
    }
  }

  // BOOKING FLOW
  if (session.state === "awaitingName") {
    const name = text.replace(/[^\p{L} .'-]/gu, "").trim();
    if (!name) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Please provide your full name.",
      });
      return;
    }
    session.name = name;
    session.state = "awaitingDate";
    const dateOptions = getNext7Days();
    session.dateOptions = dateOptions; // ✅ store for selection
    const dateMsg =
      `Thanks, ${name}! Please choose a date from the next 7 days:\n` +
      dateOptions
        .map((d, i) => `${String(i + 1)}. ${d} (${dayOfWeekLabel(d)})`)
        .join("\n");
    await sendWhatsAppText({ to: userPhone, phoneNumberId, body: dateMsg });
    return;
  }

  if (session.state === "awaitingDate") {
    const index = parseInt(message);
    if (isNaN(index) || index < 1 || index > 7) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Invalid choice. Please select 1-7.",
      });
      return;
    }
    const dateOptions = session.dateOptions;
    if (!dateOptions) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Session expired. Please start again by typing 'book'.",
      });
      phoneNumberToSession.delete(userPhone);
      return;
    }
    const pickedDate = dateOptions[index - 1];
    if (!pickedDate) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Invalid choice. Please select a valid date number.",
      });
      return;
    }
    session.selectedDate = pickedDate;
    session.state = "awaitingTime";

    // ✅ Fetch slots excluding booked ones
    const slots = await getAvailableSlots(session.selectedDate);
    if (slots.length === 0) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: `Sorry, no slots are available on ${session.selectedDate}. Please choose another date.`,
      });
      session.state = "awaitingDate";
      return;
    }

    const slotsMsg =
      `Available slots for ${session.selectedDate} (${dayOfWeekLabel(session.selectedDate)}):\n\n` +
      slots.map((s, i) => `${String(i + 1)}. ${s}`).join("\n") +
      "\n\nReply with the slot number (e.g., 1 for first option).";

    await sendWhatsAppText({ to: userPhone, phoneNumberId, body: slotsMsg });
    return;
  }

  if (session.state === "awaitingTime") {
    const index = parseInt(message);
    if (!session.selectedDate) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "No date selected. Please choose a date first.",
      });
      session.state = "awaitingDate";
      return;
    }
    const slots = await getAvailableSlots(session.selectedDate);
    if (isNaN(index) || index < 1 || index > slots.length) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Invalid choice. Please select a valid slot number.",
      });
      return;
    }
    session.selectedTime = slots[index - 1];
    session.state = "awaitingConfirm";
    await sendWhatsAppText({
      to: userPhone,
      phoneNumberId,
      body: `Confirm your booking:\n👤 ${session.name || ""}\n📅 ${session.selectedDate} (${dayOfWeekLabel(session.selectedDate)})\n🕒 ${session.selectedTime || ""}\n\nReply Yes or No.`,
    });
    return;
  }

  if (session.state === "awaitingConfirm") {
    if (message === "yes") {
      const appt: StoredAppointment = {
        id: `${String(Date.now())}-${userPhone}`,
        userPhone,
        serviceId: "default",
        serviceTitle: "Eye Care Appointment",
        date: session.selectedDate ?? "",
        time: session.selectedTime ?? "",
        name: session.name ?? "",
        createdAtIso: new Date().toISOString(),
      };
      await persistAppointment(appt);
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: `✅ Appointment confirmed for ${session.selectedDate ?? ""} at ${session.selectedTime ?? ""}. We will remind you 24 hrs before.`,
      });
      phoneNumberToSession.delete(userPhone);
      return;
    } else if (message === "no") {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "❌ Booking cancelled",
      });
      phoneNumberToSession.delete(userPhone);
      return;
    }
  }

  // ✅ RESCHEDULE FLOW (same date/time logic)
  if (session.state === "rescheduleNewDate") {
    const index = parseInt(message);
    if (isNaN(index) || index < 1 || index > 7) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Invalid choice. Please select 1-7.",
      });
      return;
    }
    const dateOptions = session.dateOptions;
    if (!dateOptions) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Session expired. Please start again by typing 'reschedule'.",
      });
      phoneNumberToSession.delete(userPhone);
      return;
    }
    const pickedDate = dateOptions[index - 1];
    if (!pickedDate) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Invalid choice. Please select a valid date number.",
      });
      return;
    }
    session.selectedDate = pickedDate;
    session.state = "rescheduleNewTime";

    const slots = await getAvailableSlots(session.selectedDate);
    if (slots.length === 0) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: `Sorry, no slots are available on ${session.selectedDate}. Please choose another date.`,
      });
      session.state = "rescheduleNewDate";
      return;
    }

    await sendWhatsAppText({
      to: userPhone,
      phoneNumberId,
      body:
        `Choose a new time for ${session.selectedDate}:\n\n` +
        slots.map((s, i) => `${String(i + 1)}. ${s}`).join("\n") +
        "\n\nReply with the slot number.",
    });
    return;
  }

  if (session.state === "rescheduleNewTime") {
    const index = parseInt(message);
    if (!session.selectedDate) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "No date selected. Please choose a date first.",
      });
      session.state = "rescheduleNewDate";
      return;
    }
    const slots = await getAvailableSlots(session.selectedDate);
    if (isNaN(index) || index < 1 || index > slots.length) {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "Invalid choice. Please select a valid slot number.",
      });
      return;
    }
    session.selectedTime = slots[index - 1];
    session.state = "rescheduleCheck";
    await sendWhatsAppText({
      to: userPhone,
      phoneNumberId,
      body:
        `Confirm your new appointment:\n` +
        `📅 ${session.selectedDate} (${dayOfWeekLabel(session.selectedDate)})\n` +
        `🕒 ${session.selectedTime ?? ""}\n\nReply Yes or No.`,
    });
    return;
  }

  if (session.state === "rescheduleCheck") {
    if (message === "yes") {
      if (!session.selectedDate || !session.selectedTime) {
        await sendWhatsAppText({
          to: userPhone,
          phoneNumberId,
          body: "Missing date or time. Please reschedule again.",
        });
        phoneNumberToSession.delete(userPhone);
        return;
      }
      await updateAppointment(
        userPhone,
        session.selectedDate,
        session.selectedTime
      );
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: `✅ Appointment successfully rescheduled to ${session.selectedDate} at ${session.selectedTime}.`,
      });
      phoneNumberToSession.delete(userPhone);
      return;
    } else if (message === "no") {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "❌ Reschedule cancelled.",
      });
      phoneNumberToSession.delete(userPhone);
      return;
    }
  }

  // CANCEL FLOW
  if (session.state === "confirmCancel") {
    if (message === "yes") {
      await deleteAppointment(userPhone);
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "✅ Appointment cancelled successfully.",
      });
    } else {
      await sendWhatsAppText({
        to: userPhone,
        phoneNumberId,
        body: "❌ Cancellation aborted.",
      });
    }
    phoneNumberToSession.delete(userPhone);
    return;
  }
}

async function showAppointments(
  userPhone: string,
  phoneNumberId?: string
): Promise<void> {
  const list = await readAppointments();
  const mine = list.filter((a) => a.userPhone === userPhone);
  if (mine.length === 0) {
    await sendWhatsAppText({
      to: userPhone,
      phoneNumberId,
      body: "No appointments found. Reply 'book' to schedule one.",
    });
    return;
  }
  const lines = mine
    .map(
      (a, i) =>
        `${String(i + 1)}. ${a.date} at ${a.time} — ${a.serviceTitle} (${a.name})`
    )
    .join("\n");
  await sendWhatsAppText({
    to: userPhone,
    phoneNumberId,
    body: `Your appointments:\n\n${lines}`,
  });
}
