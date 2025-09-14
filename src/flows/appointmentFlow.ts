import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);
import { sendWhatsAppText, sendReadReceipt } from "../utils/whatsappAPI";
import {
  createAppointment,
  getAllAppointments,
  getAppointmentByUserPhone,
  getAppointmentsByDate,
  updateAppointment as updateAppointmentInDb,
  deleteAppointmentByUserPhone,
} from "../db/helpers";

import type { AppointmentSession } from "../utils/types";
import type { Appointment } from "../db/helpers";

export const phoneNumberToSession = new Map<string, AppointmentSession>();

// ⏰ Morning and Afternoon slots
const MorningSlots: string[] = [
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

const AfternoonSlots: string[] = [
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

export function dayOfWeekLabel(inputDate: string): string {
  const d = dayjs(
    inputDate,
    ["YYYY-MM-DD", "YYYY-M-D", "DD/MM/YYYY", "D/M/YYYY"],
    true
  );
  return d.isValid() ? d.format("dddd") : "";
}

function toIsoDateFromDisplay(displayDate: string): string {
  const d = dayjs(displayDate, ["DD/MM/YYYY", "D/M/YYYY"], true);
  return d.isValid() ? d.format("YYYY-MM-DD") : displayDate;
}

function formatDisplayDateWithDay(displayDate: string): string {
  const d = dayjs(displayDate, ["DD/MM/YYYY", "D/M/YYYY"], true);
  return d.isValid()
    ? `${d.format("DD/MM/YYYY")} (${d.format("dddd")})`
    : displayDate;
}

function formatDbDateWithDay(value: unknown): string {
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

// ⏰ Get slots depending on session preference or Sunday rule
async function getAvailableSlots(
  date: string,
  preference?: "morning" | "afternoon"
): Promise<string[]> {
  const day = dayOfWeekLabel(date);
  let baseSlots: string[];

  if (day === "Sunday") {
    baseSlots = MorningSlots;
  } else {
    if (preference === "morning") {
      baseSlots = MorningSlots;
    } else if (preference === "afternoon") {
      baseSlots = AfternoonSlots;
    } else {
      baseSlots = [...MorningSlots, ...AfternoonSlots];
    }
  }

  const isoDate = toIsoDateFromDisplay(date);
  let appointmentsOnDate: Appointment[];
  try {
    appointmentsOnDate = await getAppointmentsByDate(isoDate);
  } catch (err) {
    throw err;
  }
  const bookedSlots = appointmentsOnDate.map((a) =>
    normalizeTimeLabel(a.time as unknown as string)
  );
  return baseSlots.filter(
    (slot) => !bookedSlots.includes(normalizeTimeLabel(slot))
  );
}

const mainMenuMessage =
  "Hello! 👋 Welcome to Shivas Eye Care 🏥 \n" +
  "How can we assist you today? \n\n" +
  "Please choose an option below:\n" +
  "1. Book an Appointment \n" +
  "2. Reschedule Appointment \n" +
  "3. Cancel Appointment \n" +
  "4. View Appointment Details \n" +
  "5. Contact Support ";
  

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
  messageId: string
): Promise<void> {
  sendReadReceipt(messageId).catch((err: unknown) => {
    console.error("sendReadReceipt error:", err);
  });
  const now = Date.now();
  const existing: AppointmentSession | undefined =
    phoneNumberToSession.get(userPhone);
  const message = text.trim().toLowerCase();

  if (message === "exit") {
    phoneNumberToSession.delete(userPhone);
    await sendWhatsAppText({
      to: userPhone,
      body: "Your request has been canceled. Send a message to view the main menu.",
    });
    return;
  }

  if (!existing) {
    phoneNumberToSession.set(userPhone, {
      state: "mainMenu",
      lastInteractionUnixMs: now,
    });
    await sendWhatsAppText({
      to: userPhone,
      body: mainMenuMessage,
    });
    return;
  }

  const session: AppointmentSession = existing;
  session.lastInteractionUnixMs = now;

  if (session.state === "mainMenu") {
    if (message === "1" || message.includes("book")) {
      session.state = "awaitingName";
      await sendWhatsAppText({
        to: userPhone,
        body: "Great! Please enter your full name:",
      });
      return;
    } else if (message === "2" || message.includes("reschedule")) {
      let userAppt: Appointment | null;
      try {
        userAppt = await getAppointmentByUserPhone(userPhone);
      } catch (err) {
        console.error("getAppointmentByUserPhone error:", err);
        await sendWhatsAppText({
          to: userPhone,
          body: "Sorry, we couldn't fetch your appointment right now. Please try again later.",
        });
        return;
      }
      if (userAppt) {
        const dateOptions = getNext7Days();
        session.dateOptions = dateOptions;
        session.state = "rescheduleNewDate";

        const dateMsg =
          `Your current appointment:\n${formatDbDateWithDay(userAppt.date)} at ${userAppt.time}\n\nPlease choose a new date:\n` +
          dateOptions
            .map((d, i) => `${String(i + 1)}. ${d} (${dayOfWeekLabel(d)})`)
            .join("\n");

        await sendWhatsAppText({ to: userPhone, body: dateMsg });
      } else {
        await sendWhatsAppText({
          to: userPhone,
          body: "No booking found. book to create a new appointment.",
        });
      }
      return;
    } else if (message === "3" || message.includes("cancel")) {
      let userAppt: Appointment | null;
      try {
        userAppt = await getAppointmentByUserPhone(userPhone);
      } catch (err) {
        console.error("getAppointmentByUserPhone error:", err);
        await sendWhatsAppText({
          to: userPhone,
          body: "Sorry, we couldn't check your appointment right now. Please try again later.",
        });
        return;
      }
      if (userAppt) {
        session.state = "confirmCancel";
        await sendWhatsAppText({
          to: userPhone,
          body: `Are you sure you want to cancel your appointment on ${formatDbDateWithDay(userAppt.date)} at ${userAppt.time}? (yes/no)`,
        });
      } else {
        await sendWhatsAppText({
          to: userPhone,
          body: "No appointment found to cancel.",
        });
      }
      return;
    } else if (message === "4" || message.includes("view")) {
      await showAppointments(userPhone);
      phoneNumberToSession.delete(userPhone);
      return;
    } else if (message === "5" || message.includes("contact")) {
      await sendWhatsAppText({
        to: userPhone,
        body: contactDetails,
      });
      phoneNumberToSession.delete(userPhone);
      return;
    } else {
      await sendWhatsAppText({
        to: userPhone,
        body: mainMenuMessage,
      });
      return;
    }
  }

  if (session.state === "awaitingName") {
    const name = text.replace(/[^\p{L} .'-]/gu, "").trim();
    if (!name) {
      await sendWhatsAppText({
        to: userPhone,
        body: "Please provide your full name.",
      });
      return;
    }
    session.name = name;
    session.state = "awaitingDate";
    const dateOptions = getNext7Days();
    session.dateOptions = dateOptions;
    const dateMsg =
      `Thanks, ${name}! Please choose a date from the next 7 days:\n` +
      dateOptions
        .map((d, i) => `${String(i + 1)}. ${d} (${dayOfWeekLabel(d)})`)
        .join("\n");
    await sendWhatsAppText({ to: userPhone, body: dateMsg });
    return;
  }

  if (session.state === "awaitingDate") {
    const index = parseInt(message);
    if (Number.isNaN(index) || index < 1 || index > 7) {
      await sendWhatsAppText({
        to: userPhone,
        body: "Invalid choice. Please select 1-7. \n NOTE:Please enter the word 'EXIT' to exit.",
      });
      return;
    }
    const dateOptions = session.dateOptions;
    if (!dateOptions) {
      await sendWhatsAppText({
        to: userPhone,
        body: "Session expired. Please start again by typing 'book'.",
      });
      phoneNumberToSession.delete(userPhone);
      return;
    }

    const pickedDate = dateOptions[index - 1];
    if (!pickedDate) {
      await sendWhatsAppText({
        to: userPhone,
        body: "Invalid choice. Please select a valid date number.\n NOTE:Please enter the word 'EXIT' to exit.",
      });
      return;
    }
    session.selectedDate = pickedDate;

    const day = dayOfWeekLabel(pickedDate);
    if (day === "Sunday") {
      const slots = await getAvailableSlots(pickedDate, "morning");
      if (slots.length === 0) {
        await sendWhatsAppText({
          to: userPhone,
          body: `Sorry, no slots available on ${pickedDate}. Please choose another date.\n "NOTE:Please enter the word 'EXIT' to exit."`,
        });
        session.state = "awaitingDate";
        return;
      }
      session.state = "awaitingTime";
      const slotsMsg =
        `Available slots for ${pickedDate} (${day}):\n\n` +
        slots.map((s, i) => `${String(i + 1)}. ${s}`).join("\n") +
        "\n\nReply with the slot number.\n\nNOTE: Please enter the word 'EXIT' to exit.";
      await sendWhatsAppText({ to: userPhone, body: slotsMsg });
    } else {
      session.state = "awaitingSession"; // ✅ works now
      await sendWhatsAppText({
        to: userPhone,
        body: "Please choose your preference:\n1. Morning\n2. Afternoon \n\nNOTE: Please enter the word 'EXIT' to exit.",
      });
    }
    return;
  }

  if (session.state === "awaitingSession") {
    if (message !== "1" && message !== "2") {
      await sendWhatsAppText({
        to: userPhone,
        body: "Invalid choice. Reply 1 for Morning or 2 for Afternoon.\n NOTE:Please enter the word 'EXIT' to exit.",
      });
      return;
    }
    if (!session.selectedDate) {
      await sendWhatsAppText({
        to: userPhone,
        body: "No date selected. Please choose a date first. \n NOTE:Please enter the word 'EXIT' to exit.",
      });
      session.state = "awaitingDate";
      return;
    }
    const pref = message === "1" ? "morning" : "afternoon";
    const slots = await getAvailableSlots(session.selectedDate, pref);

    if (slots.length === 0) {
      await sendWhatsAppText({
        to: userPhone,
        body: `Sorry, no ${pref} slots available on ${session.selectedDate ?? ""}. Please choose another date.\n NOTE:Please enter the word 'EXIT' to exit.`,
      });
      session.state = "awaitingDate";
      return;
    }
    session.state = "awaitingTime";
    const slotsMsg =
      `Available ${pref} slots for ${session.selectedDate ?? ""} (${dayOfWeekLabel(
        session.selectedDate ?? ""
      )}):\n\n` +
      slots.map((s, i) => `${String(i + 1)}. ${s}`).join("\n") +
      "\n\nReply with the slot number.\n\nNOTE: Please enter the word 'EXIT' to exit.";
    await sendWhatsAppText({ to: userPhone, body: slotsMsg });
    return;
  }

  if (session.state === "awaitingTime") {
    const index = parseInt(message);
    if (!session.selectedDate) {
      await sendWhatsAppText({
        to: userPhone,
        body: "No date selected. Please choose a date first.\n\nNOTE: Please enter the word 'EXIT' to exit.",
      });
      session.state = "awaitingDate";
      return;
    }
    const slots = await getAvailableSlots(session.selectedDate);
    if (Number.isNaN(index) || index < 1 || index > slots.length) {
      await sendWhatsAppText({
        to: userPhone,
        body: "Invalid choice. Please select a valid slot number.\n\nNOTE: Please enter the word 'EXIT' to exit.",
      });
      return;
    }
    session.selectedTime = slots[index - 1];
    session.state = "awaitingConfirm";
    await sendWhatsAppText({
      to: userPhone,
      body: `Confirm your booking:\n👤 ${session.name || ""}\n📅 Day: ${
        session.selectedDate
      } (${dayOfWeekLabel(session.selectedDate)})\n🕒 Date: ${
        session.selectedTime || ""
      }\n\nReply Yes or No.`,
    });
    return;
  }

  if (session.state === "awaitingConfirm") {
    if (message === "yes") {
      try {
        await createAppointment({
          userPhone,
          serviceId: "default",
          serviceTitle: "Eye Care Appointment",
          date: toIsoDateFromDisplay(session.selectedDate ?? ""),
          time: session.selectedTime ?? "",
          name: session.name ?? "",
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("createAppointment error:", err);
        await sendWhatsAppText({
          to: userPhone,
          body: "Sorry, we couldn't confirm your booking due to a system error. Please try again.",
        });
        phoneNumberToSession.delete(userPhone);
        return;
      }
      await sendWhatsAppText({
        to: userPhone,
        body: `✅ Appointment confirmed for ${formatDisplayDateWithDay(session.selectedDate ?? "")} at ${session.selectedTime ?? ""}. We will send a reminder a day before your appointment.`,
      });
      phoneNumberToSession.delete(userPhone);
      return;
    } else if (message === "no") {
      await sendWhatsAppText({
        to: userPhone,
        body: "❌ Booking cancelled",
      });
      phoneNumberToSession.delete(userPhone);
      return;
    }
  }

  if (session.state === "rescheduleNewDate") {
    const index = parseInt(message);
    if (Number.isNaN(index) || index < 1 || index > 7) {
      await sendWhatsAppText({
        to: userPhone,
        body: "Invalid choice. Please select 1-7.\n\nNOTE: Please enter the word 'EXIT' to exit.",
      });
      return;
    }

    const dateOptions = session.dateOptions;
    if (!dateOptions) {
      await sendWhatsAppText({
        to: userPhone,
        body: "Session expired. Please start again by typing again .",
      });
      phoneNumberToSession.delete(userPhone);
      return;
    }

    const pickedDate = dateOptions[index - 1];
    if (!pickedDate) {
      await sendWhatsAppText({
        to: userPhone,
        body: "Invalid choice. Please select a valid date number. \n\nNOTE: Please enter the word 'EXIT' to exit.",
      });
      return;
    }

    session.selectedDate = pickedDate;

    const day = dayOfWeekLabel(pickedDate);
    if (day === "Sunday") {
      const slots = await getAvailableSlots(pickedDate, "morning");
      if (slots.length === 0) {
        await sendWhatsAppText({
          to: userPhone,
          body: `Sorry, no slots available on ${pickedDate}. Please choose another date.\n\nNOTE: Please enter the word 'EXIT' to exit.`,
        });
        session.state = "rescheduleNewDate";
        return;
      }
      session.state = "rescheduleNewTime";
      const slotsMsg =
        `Available slots for ${pickedDate} (${day}):\n\n` +
        slots.map((s, i) => `${String(i + 1)}. ${s}`).join("\n") +
        "\n\nReply with the slot number.\n\nNOTE: Please enter the word 'EXIT' to exit.";
      await sendWhatsAppText({ to: userPhone, body: slotsMsg });
    } else {
      session.state = "rescheduleSession"; // ✅ new state
      await sendWhatsAppText({
        to: userPhone,
        body: "Please choose your preference:\n 1. Morning\n 2. Afternoon \n\nNOTE: Please enter the word 'EXIT' to exit.",
      });
    }
    return;
  }

  if (session.state === "rescheduleSession") {
    if (message !== "1" && message !== "2") {
      await sendWhatsAppText({
        to: userPhone,
        body: "Invalid choice. Reply 1 for Morning or 2 for Afternoon. \n\nNOTE: Please enter the word 'EXIT' to exit.",
      });
      return;
    }
    const pref = message === "1" ? "morning" : "afternoon";
    const slots = await getAvailableSlots(session.selectedDate ?? "", pref);
    if (slots.length === 0) {
      await sendWhatsAppText({
        to: userPhone,
        body: `Sorry, no ${pref} slots available on ${session.selectedDate ?? ""}. Please choose another date.\n\nNOTE: Please enter the word 'EXIT' to exit.`,
      });
      session.state = "rescheduleNewDate";
      return;
    }
    session.state = "rescheduleNewTime";
    const slotsMsg =
      `Available ${pref} slots for ${session.selectedDate ?? ""} (${dayOfWeekLabel(
        session.selectedDate ?? ""
      )}):\n\n` +
      slots.map((s, i) => `${String(i + 1)}. ${s}`).join("\n") +
      "\n\nReply with the slot number.\n\nNOTE: Please enter the word 'EXIT' to exit.";
    await sendWhatsAppText({ to: userPhone, body: slotsMsg });
    return;
  }

  if (session.state === "rescheduleNewTime") {
    const index = parseInt(message);
    if (!session.selectedDate) {
      await sendWhatsAppText({
        to: userPhone,

        body: "No date selected. Please choose a date first.\n\nNOTE: Please enter the word 'EXIT' to exit.",
      });
      session.state = "rescheduleNewDate";
      return;
    }
    const slots: string[] = [];
    try {
      const slotsForDate = await getAvailableSlots(session.selectedDate);
      slots.push(...slotsForDate);
    } catch (err) {
      console.error("getAvailableSlots error:", err);
      await sendWhatsAppText({
        to: userPhone,

        body: "Sorry, we couldn't load available slots. Please try again later.",
      });
      return;
    }
    if (Number.isNaN(index) || index < 1 || index > slots.length) {
      await sendWhatsAppText({
        to: userPhone,

        body: "Invalid choice. Please select a valid slot number.\n\nNOTE: Please enter the word 'EXIT' to exit.",
      });
      return;
    }
    session.selectedTime = slots[index - 1];
    session.state = "rescheduleCheck";
    await sendWhatsAppText({
      to: userPhone,

      body:
        `Confirm your new appointment:\n` +
        `📅 Day: ${session.selectedDate} (${dayOfWeekLabel(session.selectedDate)})\n` +
        `🕒 Date: ${session.selectedTime ?? ""}\n\nReply Yes or No.`,
    });
    return;
  }

  if (session.state === "rescheduleCheck") {
    if (message === "yes") {
      if (!session.selectedDate || !session.selectedTime) {
        await sendWhatsAppText({
          to: userPhone,

          body: "Missing date or time. Please reschedule again.",
        });
        phoneNumberToSession.delete(userPhone);
        return;
      }
      try {
        const existingAppt = await getAppointmentByUserPhone(userPhone);
        if (existingAppt) {
          await updateAppointmentInDb({
            id: existingAppt.id,
            userPhone: existingAppt.userPhone,
            serviceId: existingAppt.serviceId,
            serviceTitle: existingAppt.serviceTitle,
            date: toIsoDateFromDisplay(session.selectedDate),
            time: session.selectedTime,
            name: existingAppt.name,
            createdAt: existingAppt.createdAt,
          });
        }
      } catch (err) {
        console.error("reschedule update error:", err);
        await sendWhatsAppText({
          to: userPhone,

          body: "Sorry, we couldn't reschedule your appointment due to a system error. Please try again.",
        });
        phoneNumberToSession.delete(userPhone);
        return;
      }
      await sendWhatsAppText({
        to: userPhone,

        body: `✅ Appointment successfully rescheduled to ${formatDisplayDateWithDay(session.selectedDate)} at ${session.selectedTime}.`,
      });
      phoneNumberToSession.delete(userPhone);
      return;
    } else if (message === "no") {
      await sendWhatsAppText({
        to: userPhone,

        body: "❌ Reschedule cancelled.",
      });
      phoneNumberToSession.delete(userPhone);
      return;
    }
  }

  if (session.state === "confirmCancel") {
    if (message === "yes") {
      try {
        await deleteAppointmentByUserPhone(userPhone);
      } catch (err) {
        console.error("deleteAppointmentByUserPhone error:", err);
        await sendWhatsAppText({
          to: userPhone,

          body: "Sorry, we couldn't cancel your appointment right now. Please try again later.",
        });
        phoneNumberToSession.delete(userPhone);
        return;
      }
      await sendWhatsAppText({
        to: userPhone,

        body: "✅ Appointment cancelled successfully.",
      });
    } else {
      await sendWhatsAppText({
        to: userPhone,

        body: "❌ Cancellation aborted.",
      });
    }
    phoneNumberToSession.delete(userPhone);
    return;
  }
}

async function showAppointments(userPhone: string): Promise<void> {
  const list: Appointment[] = [];
  try {
    const listForUser = await getAllAppointments();
    list.push(...listForUser);
  } catch (err) {
    console.error("getAllAppointments error:", err);
    await sendWhatsAppText({
      to: userPhone,
      body: "Sorry, we couldn't retrieve your appointments right now. Please try again later.",
    });
    return;
  }
  const mine = list.filter((a) => a.userPhone === userPhone);
  if (mine.length === 0) {
    await sendWhatsAppText({
      to: userPhone,
      body: "No appointments found.Book to schedule one.",
    });
    return;
  }
  const lines = mine
    .map(
      (a, i) =>
        `${String(i + 1)}. ${formatDbDateWithDay(a.date)} at ${a.time} — ${a.serviceTitle} (${a.name})`
    )
    .join("\n");
  await sendWhatsAppText({
    to: userPhone,
    body: `Your appointments:\n\n${lines}`,
  });
}
