import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);
import { sendWhatsAppText, sendReadReceipt } from "../utils/whatsappAPI";
import { getAppointmentsByDate } from "../db/appointmentHelpers";
import type { Appointment } from "../db/appointmentHelpers";
import {
  dayOfWeekLabel,
  toIsoDateFromDisplay,
  formatDbDateWithDay,
  getNext7Days,
} from "../utils/dateHelper";

const adminPhoneNumber: string | undefined = process.env.ADMIN_PHONE_NUMBER;

type AdminSessionState =
  | "mainMenu"
  | "awaitingDate"
  | "awaitingAppointmentChoice";

interface AdminSession {
  state: AdminSessionState;
  lastInteractionUnixMs: number;
  dateOptions?: string[];
  selectedDate?: string;
  currentList?: Appointment[];
}

const adminSessionByPhone = new Map<string, AdminSession>();

const adminMainMenuMessage =
  "Hello Admin 👋\n" +
  "Choose an option:\n" +
  "1. View today's appointments\n" +
  "2. View appointments by date";

async function sendAdminMainMenu(toNumber: string): Promise<void> {
  await sendWhatsAppText({
    to: toNumber,
    body: adminMainMenuMessage,
  });
}

async function handleMainMenuState(
  toNumber: string,
  session: AdminSession,
  message: string
): Promise<void> {
  if (message === "1" || message.includes("today")) {
    const isoDate = dayjs().format("YYYY-MM-DD");
    let appointmentsForDay: Appointment[] = [];
    try {
      appointmentsForDay = await getAppointmentsByDate(isoDate);
    } catch (err) {
      console.error("getAppointmentsByDate error:", err);
      await sendWhatsAppText({
        to: toNumber,
        body: "Sorry, couldn't fetch today's appointments. Please try again.",
      });
      return;
    }

    if (appointmentsForDay.length === 0) {
      await sendWhatsAppText({
        to: toNumber,
        body: "No appointments today.",
      });
      await sendAdminMainMenu(toNumber);
      return;
    }

    session.selectedDate = isoDate;
    session.currentList = appointmentsForDay;
    session.state = "awaitingAppointmentChoice";
    const namesAndTimeSlots: { name: string; time: string }[] =
      appointmentsForDay.map((appointment) => ({
        name: appointment.name || "(no name)",
        time: appointment.time,
      }));
    await sendWhatsAppText({
      to: toNumber,
      body: `Appointments for ${formatDbDateWithDay(isoDate)}:\n\n${namesAndTimeSlots.map((item, index) => ` ${String(index + 1)}. ${item.name} - ${item.time}`).join("\n")}\n\nReply with a number to view details, or type 'menu'.`,
    });
    return;
  }

  if (message === "2" || message.includes("date")) {
    const dateOptions = getNext7Days();
    session.dateOptions = dateOptions;
    session.state = "awaitingDate";
    const dateMsg =
      "Choose a date:\n" +
      dateOptions
        .map(
          (displayDate, index) =>
            `${String(index + 1)}. ${displayDate} (${dayOfWeekLabel(displayDate)})`
        )
        .join("\n");
    await sendWhatsAppText({ to: toNumber, body: dateMsg });
    return;
  }

  await sendAdminMainMenu(toNumber);
}

async function handleAwaitingDateState(
  toNumber: string,
  session: AdminSession,
  message: string
): Promise<void> {
  const selectedIndex = parseInt(message);
  if (Number.isNaN(selectedIndex) || selectedIndex < 1 || selectedIndex > 7) {
    await sendWhatsAppText({
      to: toNumber,
      body: "Invalid choice. Select 1-7, or type 'menu' to go back.",
    });
    return;
  }

  const dateOptions = session.dateOptions || [];
  const displayDate = dateOptions[selectedIndex - 1];
  if (!displayDate) {
    await sendWhatsAppText({
      to: toNumber,
      body: "Invalid choice. Please select a valid date number.",
    });
    return;
  }

  const isoDate = toIsoDateFromDisplay(displayDate);
  let appointmentsForDay: Appointment[] = [];
  try {
    appointmentsForDay = await getAppointmentsByDate(isoDate);
  } catch (err) {
    console.error("getAppointmentsByDate error:", err);
    await sendWhatsAppText({
      to: toNumber,
      body: "Sorry, couldn't fetch appointments for the selected date. Please try again.",
    });
    return;
  }

  session.selectedDate = isoDate;
  session.currentList = appointmentsForDay;

  if (appointmentsForDay.length === 0) {
    await sendWhatsAppText({
      to: toNumber,
      body: `No appointments for ${formatDbDateWithDay(isoDate)}.`,
    });
    session.state = "mainMenu";
    await sendAdminMainMenu(toNumber);
    return;
  }

  session.state = "awaitingAppointmentChoice";
  const namesAndTimeSlots: { name: string; time: string }[] =
    appointmentsForDay.map((appointment) => ({
      name: appointment.name || "(no name)",
      time: appointment.time,
    }));
  await sendWhatsAppText({
    to: toNumber,
    body: `Appointments for ${formatDbDateWithDay(isoDate)}:\n\n${namesAndTimeSlots.map((item, index) => ` ${String(index + 1)}. ${item.name} - ${item.time}`).join("\n")}\n\nReply with a number to view details, or type 'menu'.`,
  });
}

async function handleAwaitingAppointmentChoiceState(
  toNumber: string,
  session: AdminSession,
  message: string
): Promise<void> {
  const selectedIndex = parseInt(message);
  const list = session.currentList || [];
  if (
    Number.isNaN(selectedIndex) ||
    selectedIndex < 1 ||
    selectedIndex > list.length
  ) {
    await sendWhatsAppText({
      to: toNumber,
      body: "Invalid choice. Reply with a valid number, or type 'menu'.",
    });
    return;
  }

  const chosen = list[selectedIndex - 1];
  if (!chosen) {
    await sendWhatsAppText({
      to: toNumber,
      body: "Invalid choice. Reply with a valid number, or type 'menu'.",
    });
    return;
  }

  const details =
    `Name: ${chosen.name}\n` +
    `Phone: +${chosen.userPhone}\n` +
    `Date: ${formatDbDateWithDay(chosen.date)}\n` +
    `Time: ${chosen.time}`;

  await sendWhatsAppText({
    to: toNumber,
    body: `${details}\n\nType 'menu' to view the main menu.`,
  });
}

export async function handleAdminReply(
  text: string,
  messageId: string
): Promise<void> {
  if (!adminPhoneNumber) {
    console.warn("[WARN] ADMIN_PHONE_NUMBER is not set");
    return;
  }

  await sendReadReceipt(messageId).catch((err: unknown) => {
    console.error("sendReadReceipt error:", err);
  });

  const now = Date.now();
  const message = text.trim().toLowerCase();
  let session = adminSessionByPhone.get(adminPhoneNumber);

  // Global commands
  if (message === "exit" || message === "menu") {
    adminSessionByPhone.set(adminPhoneNumber, {
      state: "mainMenu",
      lastInteractionUnixMs: now,
    });
    await sendWhatsAppText({
      to: adminPhoneNumber,
      body: adminMainMenuMessage,
    });
    return;
  }

  if (!session) {
    session = { state: "mainMenu", lastInteractionUnixMs: now };
    adminSessionByPhone.set(adminPhoneNumber, session);
    await sendWhatsAppText({
      to: adminPhoneNumber,
      body: adminMainMenuMessage,
    });
    return;
  }

  session.lastInteractionUnixMs = now;

  const state = session.state;
  if (state === "mainMenu") {
    await handleMainMenuState(adminPhoneNumber, session, message);
    return;
  }
  if (state === "awaitingDate") {
    await handleAwaitingDateState(adminPhoneNumber, session, message);
    return;
  }
  //if (state === "awaitingAppointmentChoice")
  else {
    await handleAwaitingAppointmentChoiceState(
      adminPhoneNumber,
      session,
      message
    );
    return;
  }
}
