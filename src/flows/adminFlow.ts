import dayjs from "dayjs";
import { sendWhatsAppText, sendReadReceipt } from "../utils/whatsappAPI";
import { getAppointmentsByDate } from "../db/appointmentHelpers";
import type { Appointment } from "../db/appointmentHelpers";
import {
  dayOfWeekLabel,
  toIsoDateFromDisplay,
  formatDbDateWithDay,
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

function getNext7Days(): string[] {
  const today = dayjs();
  return Array.from({ length: 7 }, (_, i) =>
    today.add(i + 1, "day").format("DD/MM/YYYY")
  );
}

async function showNamesForDate(isoDate: string): Promise<Appointment[]> {
  const appointments = await getAppointmentsByDate(isoDate);
  return appointments;
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

  switch (session.state) {
    case "mainMenu": {
      if (message === "1" || message.includes("today")) {
        const isoDate = dayjs().format("YYYY-MM-DD");
        let list: Appointment[] = [];
        try {
          list = await showNamesForDate(isoDate);
        } catch (err) {
          console.error("getAppointmentsByDate error:", err);
          await sendWhatsAppText({
            to: adminPhoneNumber,
            body: "Sorry, couldn't fetch today's appointments. Please try again.",
          });
          return;
        }

        if (list.length === 0) {
          await sendWhatsAppText({
            to: adminPhoneNumber,
            body: "No appointments today.",
          });
          await sendWhatsAppText({
            to: adminPhoneNumber,
            body: adminMainMenuMessage,
          });
          return;
        }

        session.selectedDate = isoDate;
        session.currentList = list;
        session.state = "awaitingAppointmentChoice";
        const names = list
          .map((a, i) => `${String(i + 1)}. ${a.name || "(no name)"}`)
          .join("\n");
        await sendWhatsAppText({
          to: adminPhoneNumber,
          body: `Appointments for ${formatDbDateWithDay(isoDate)}:\n\n${names}\n\nReply with a number to view details, or type 'menu'.`,
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
            .map((d, i) => `${String(i + 1)}. ${d} (${dayOfWeekLabel(d)})`)
            .join("\n");
        await sendWhatsAppText({ to: adminPhoneNumber, body: dateMsg });
        return;
      }

      await sendWhatsAppText({
        to: adminPhoneNumber,
        body: adminMainMenuMessage,
      });
      return;
    }

    case "awaitingDate": {
      const index = parseInt(message);
      if (Number.isNaN(index) || index < 1 || index > 7) {
        await sendWhatsAppText({
          to: adminPhoneNumber,
          body: "Invalid choice. Select 1-7, or type 'menu' to go back.",
        });
        return;
      }
      const dateOptions = session.dateOptions || [];
      const displayDate = dateOptions[index - 1];
      if (!displayDate) {
        await sendWhatsAppText({
          to: adminPhoneNumber,
          body: "Invalid choice. Please select a valid date number.",
        });
        return;
      }

      const isoDate = toIsoDateFromDisplay(displayDate);
      let list: Appointment[] = [];
      try {
        list = await showNamesForDate(isoDate);
      } catch (err) {
        console.error("getAppointmentsByDate error:", err);
        await sendWhatsAppText({
          to: adminPhoneNumber,
          body: "Sorry, couldn't fetch appointments for the selected date. Please try again.",
        });
        return;
      }

      session.selectedDate = isoDate;
      session.currentList = list;

      if (list.length === 0) {
        await sendWhatsAppText({
          to: adminPhoneNumber,
          body: `No appointments for ${formatDbDateWithDay(isoDate)}.`,
        });
        session.state = "mainMenu";
        await sendWhatsAppText({
          to: adminPhoneNumber,
          body: adminMainMenuMessage,
        });
        return;
      }

      session.state = "awaitingAppointmentChoice";
      const names = list
        .map((a, i) => `${String(i + 1)}. ${a.name || "(no name)"}`)
        .join("\n");
      await sendWhatsAppText({
        to: adminPhoneNumber,
        body: `Appointments for ${formatDbDateWithDay(isoDate)}:\n\n${names}\n\nReply with a number to view details, or type 'menu'.`,
      });
      return;
    }

    case "awaitingAppointmentChoice": {
      const index = parseInt(message);
      const list = session.currentList || [];
      if (Number.isNaN(index) || index < 1 || index > list.length) {
        await sendWhatsAppText({
          to: adminPhoneNumber,
          body: "Invalid choice. Reply with a valid number, or type 'menu'.",
        });
        return;
      }
      const chosen = list[index - 1];
      if (!chosen) {
        await sendWhatsAppText({
          to: adminPhoneNumber,
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
        to: adminPhoneNumber,
        body: `${details}\n\nType 'menu' to view the main menu.`,
      });
      // session.state = "awaitingAppointmentChoice";
      return;
    }

    default: {
      session.state = "mainMenu";
      await sendWhatsAppText({
        to: adminPhoneNumber,
        body: adminMainMenuMessage,
      });
      return;
    }
  }
}
