import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);
import {
  dayOfWeekLabel,
  toIsoDateFromDisplay,
  formatDisplayDateWithDay,
  formatDbDateWithDay,
  getNext7Days,
} from "../utils/dateHelper";
import {
  sendWhatsAppText,
  sendReadReceipt,
  sendWhatsAppTemplate,
} from "../utils/whatsappAPI";
import {
  createAppointment,
  getAppointmentByUserPhone,
  getAppointmentsByDate,
  updateAppointment as updateAppointmentInDb,
  deleteAppointmentByUserPhone,
} from "../db/appointmentHelpers";
import {
  getSession,
  setSession,
  deleteSession,
  updateSession,
} from "../db/sessionHelpers";

import type { AppointmentSession } from "../utils/types";
import type { Appointment } from "../db/appointmentHelpers";
import { MorningSlots, EveningSlots } from "../utils/appointmentData";
import { adminPhoneNumber } from "../utils/whatsappAPI";

function normalizeTimeLabel(input: string): string {
  return input.replace(/\s+/g, " ").trim().toUpperCase();
}

async function getAvailableSlots(
  date: string,
  preference?: "morning" | "evening"
): Promise<string[]> {
  const day = dayOfWeekLabel(date);
  let baseSlots: string[];

  // Sunday = only MorningSlots
  if (day === "Sunday") {
    baseSlots = MorningSlots;
  } else {
    if (preference === "morning") {
      baseSlots = MorningSlots;
    } else if (preference === "evening") {
      baseSlots = EveningSlots;
    } else {
      baseSlots = [...MorningSlots, ...EveningSlots];
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

  // ---- check if selected date is today ----
  const parsedSelectedDate = dayjs(date, "DD/MM/YYYY", true);
  const isToday = parsedSelectedDate.isValid()
    ? parsedSelectedDate.isSame(dayjs(), "day")
    : false;

  if (isToday) {
    const now = dayjs();

    // filter only slots after "now"
    const futureSlots = baseSlots.filter((slot) => {
      // parse time only (hh:mm A)
      const timePart = dayjs(slot, ["h:mm A"], true);
      if (!timePart.isValid()) {
        console.warn("[getAvailableSlots] Invalid time parse:", slot);
        return false;
      }

      // combine the exact date + slot time
      const slotDateTime = parsedSelectedDate
        .hour(timePart.hour())
        .minute(timePart.minute())
        .second(0);

      return slotDateTime.isAfter(now);
    });

    // remove booked slots and return
    return futureSlots.filter(
      (slot) => !bookedSlots.includes(normalizeTimeLabel(slot))
    );
  }

  // ---- for future days: show all slots except booked ones ----
  return baseSlots.filter(
    (slot) => !bookedSlots.includes(normalizeTimeLabel(slot))
  );
}

const mainMenuMessage =
  "Hello! 👋 Welcome to Shivas Eye Care 🏥 \n" +
  "How can we assist you today? \n\n" +
  "Please choose an option number below:\n" +
  "1. Book an Appointment \n" +
  "2. Reschedule Appointment \n" +
  "3. Cancel Appointment \n" +
  "4. View Appointment Details \n" +
  "5. Contact Support ";

const contactDetails =
  "🏥 Shivas Eye Care Contact:\n" +
  "📞 Phone: +919840088522 or +919840174184 or +918667302776\n" +
  "📍 Address:134/1818, 13th Main Rd, Thiruvalluvar Colony, Anna Nagar, Chennai, Tamil Nadu 600040\n\n" +
  "📌 Maps: https://maps.app.goo.gl/BpiRvFM1e9ZukTvW8";

async function handleExit(userPhone: string): Promise<void> {
  try {
    await deleteSession(userPhone);
    await sendWhatsAppText({
      to: userPhone,
      body: "Your request has been canceled. \n\nSend a message to view the main menu.",
    });
  } catch (err) {
    console.error("deleteSession error:", err);
  }
}

async function handleAwaitName(
  session: AppointmentSession,
  userPhone: string,
  text: string
): Promise<void> {
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
  try {
    await updateSession(userPhone, {
      name: name,
      state: "awaitingDate",
      dateOptions: dateOptions,
    });
  } catch (err) {
    console.error("updateSession error:", err);
  }
  const dateMsg =
    `Welcome, ${name}! Please choose a date from the next 7 days:\n` +
    dateOptions
      .map((d, i) => `${String(i + 1)}. ${d} (${dayOfWeekLabel(d)})`)
      .join("\n");
  await sendWhatsAppText({ to: userPhone, body: dateMsg });
}

async function handleMainMenu(
  session: AppointmentSession,
  userPhone: string,
  message: string
): Promise<void> {
  if (message === "1" || message.includes("book")) {
    session.state = "awaitingName";

    try {
      const userAppt = await getAppointmentByUserPhone(userPhone);
      if (userAppt) {
        await sendWhatsAppText({
          to: userPhone,
          body: "You already have an appointment. Please reschedule or cancel it first. \n\nSend a message to view the main menu.",
        });
        await deleteSession(userPhone);
        return;
      }
    } catch (err) {
      console.error("getAppointmentByUserPhone error:", err);
      await sendWhatsAppText({
        to: userPhone,
        body: "Sorry, we couldn't check your appointment right now. Please try again later.",
      });
      return;
    }
    try {
      await updateSession(userPhone, {
        state: "awaitingName",
      });
    } catch (err) {
      console.error("updateSession error:", err);
    }
    await sendWhatsAppText({
      to: userPhone,
      body: "Welcome! To book an appointment, please enter your full name:",
    });
    return;
  }

  if (message === "2" || message.includes("reschedule")) {
    let userAppt: Appointment | null;
    try {
      userAppt = await getAppointmentByUserPhone(userPhone);
    } catch (err) {
      console.error("getAppointmentByUserPhone error:", err);
      await sendWhatsAppText({
        to: userPhone,
        body: "Sorry, we couldn't check your appointment right now. Please try again later.\n\n Send a message to view the main menu.",
      });
      return;
    }
    if (userAppt) {
      const dateOptions = getNext7Days();
      session.dateOptions = dateOptions;
      session.state = "rescheduleNewDate";
      try {
        await updateSession(userPhone, {
          dateOptions: dateOptions,
          state: "rescheduleNewDate",
        });
      } catch (err) {
        console.error("updateSession error:", err);
      }

      const dateMsg =
        `Your current appointment:\n${formatDbDateWithDay(userAppt.date)} at ${userAppt.time}\n\nPlease choose a new date:\n ` +
        dateOptions
          .map((d, i) => `${String(i + 1)}. ${d} (${dayOfWeekLabel(d)})`)
          .join("\n") +
        "\n\nNote: Please enter the word 'EXIT' to exit.";

      await sendWhatsAppText({ to: userPhone, body: dateMsg });
    } else {
      await sendWhatsAppText({
        to: userPhone,
        body: "No appointment found. Please book a new appointment. \n\nSend a message to view the main menu.",
      });
    }
    return;
  }

  if (message === "3" || message.includes("cancel")) {
    let userAppt: Appointment | null;
    try {
      userAppt = await getAppointmentByUserPhone(userPhone);
    } catch (err) {
      console.error("getAppointmentByUserPhone error:", err);
      await sendWhatsAppText({
        to: userPhone,
        body: "Sorry, we couldn't check your appointment right now. Please try again later.\n\n Send a message to view the main menu.",
      });
      return;
    }
    if (userAppt) {
      session.state = "confirmCancel";
      try {
        await updateSession(userPhone, {
          state: "confirmCancel",
        });
      } catch (err) {
        console.error("updateSession error:", err);
      }
      await sendWhatsAppText({
        to: userPhone,
        body: `Are you sure you want to cancel your appointment on ${formatDbDateWithDay(
          userAppt.date
        )} at ${userAppt.time}? (yes/no)`,
      });
    } else {
      await sendWhatsAppText({
        to: userPhone,
        body: "No appointment found to cancel. \n\nSend a message to view the main menu.",
      });
    }
    return;
  }

  if (message === "4" || message.includes("view")) {
    await showAppointments(userPhone);
    try {
      await deleteSession(userPhone);
    } catch (err) {
      console.error("deleteSession error:", err);
    }
    return;
  }

  if (message === "5" || message.includes("contact")) {
    await sendWhatsAppText({
      to: userPhone,
      body: contactDetails,
    });
    try {
      await deleteSession(userPhone);
    } catch (err) {
      console.error("deleteSession error:", err);
    }
    return;
  }

  await sendWhatsAppText({
    to: userPhone,
    body: mainMenuMessage,
  });
}

async function handleAwaitingDate(
  session: AppointmentSession,
  userPhone: string,
  message: string
): Promise<void> {
  const index = parseInt(message);
  if (Number.isNaN(index) || index < 1 || index > 7) {
    await sendWhatsAppText({
      to: userPhone,
      body: "Invalid choice. Please select 1-7. \n\nNote: Please enter the word 'EXIT' to exit.",
    });
    return;
  }
  const dateOptions = session.dateOptions;
  try {
    await updateSession(userPhone, {
      dateOptions: dateOptions,
      state: "awaitingDate",
    });
  } catch (err) {
    console.error("updateSession error:", err);
  }
  if (!dateOptions) {
    await sendWhatsAppText({
      to: userPhone,
      body: "Session expired. Please start again by Sending a message to view the main menu.",
    });
    try {
      await deleteSession(userPhone);
    } catch (err) {
      console.error("deleteSession error:", err);
    }
    return;
  }

  const pickedDate = dateOptions[index - 1];
  if (!pickedDate) {
    await sendWhatsAppText({
      to: userPhone,
      body: "Invalid choice. Please select a valid date number.\n\nNote: Please enter the word 'EXIT' to exit.",
    });
    return;
  }
  session.selectedDate = pickedDate;
  try {
    await updateSession(userPhone, {
      selectedDate: pickedDate,
      state: "awaitingDate",
    });
  } catch (err) {
    console.error("updateSession error:", err);
  }

  const day = dayOfWeekLabel(pickedDate);
  if (day === "Sunday") {
    let slots: string[] = [];
    try {
      slots = await getAvailableSlots(pickedDate, "morning");
    } catch (err) {
      console.error("getAvailableSlots error:", err);
      await sendWhatsAppText({
        to: userPhone,
        body: "Sorry, we couldn't load available slots. Please try again later.",
      });
      return;
    }
    if (slots.length === 0) {
      await sendWhatsAppText({
        to: userPhone,
        body: `Sorry, no slots available on ${pickedDate}. Please choose another date.\n\nNote: Please enter the word 'EXIT' to exit.`,
      });
      session.state = "awaitingDate";
      try {
        await updateSession(userPhone, {
          state: "awaitingDate",
          slotPreference: undefined,
          slotOptions: undefined,
        });
      } catch (err) {
        console.error("updateSession error:", err);
      }
      return;
    }
    session.state = "awaitingTime";
    session.slotPreference = "morning";
    session.slotOptions = slots;
    try {
      await updateSession(userPhone, {
        state: "awaitingTime",
        slotPreference: "morning",
        slotOptions: slots,
      });
    } catch (err) {
      console.error("updateSession error:", err);
    }
    const slotsMsg =
      `Available slots for ${pickedDate} (${day}):\n\n` +
      slots.map((s, i) => `${String(i + 1)}. ${s}`).join("\n") +
      "\n\nReply with the slot option number.\n\nNote: Please enter the word 'EXIT' to exit.";
    await sendWhatsAppText({ to: userPhone, body: slotsMsg });
  } else {
    session.state = "awaitingSession";
    session.slotPreference = undefined;
    session.slotOptions = undefined;
    try {
      await updateSession(userPhone, {
        state: "awaitingSession",
        slotPreference: undefined,
        slotOptions: undefined,
      });
    } catch (err) {
      console.error("updateSession error:", err);
    }
    await sendWhatsAppText({
      to: userPhone,
      body: "Please choose your preference:\n1. Morning\n2. Evening \n\nNote: Please enter the word 'EXIT' to exit.",
    });
  }
}

async function handleAwaitingSession(
  session: AppointmentSession,
  userPhone: string,
  message: string
): Promise<void> {
  if (message !== "1" && message !== "2") {
    await sendWhatsAppText({
      to: userPhone,
      body: "Invalid choice. Reply 1 for Morning or 2 for Evening.\n\nNote: Please enter the word 'EXIT' to exit.",
    });
    return;
  }
  if (!session.selectedDate) {
    await sendWhatsAppText({
      to: userPhone,
      body: "No date selected. Please choose a date first. \n\nNote: Please enter the word 'EXIT' to exit.",
    });
    session.state = "awaitingDate";
    try {
      await updateSession(userPhone, {
        state: "awaitingDate",
      });
    } catch (err) {
      console.error("updateSession error:", err);
    }
    return;
  }
  const pref = message === "1" ? "morning" : "evening";
  let slots: string[] = [];
  try {
    slots = await getAvailableSlots(session.selectedDate, pref);
  } catch (err) {
    console.error("getAvailableSlots error:", err);
    await sendWhatsAppText({
      to: userPhone,
      body: "Sorry, we couldn't load available slots. Please try again later.",
    });
    return;
  }

  if (slots.length === 0) {
    await sendWhatsAppText({
      to: userPhone,
      body: `Sorry, no ${pref} slots available on ${session.selectedDate ?? ""}. Please choose another date.\n\nNote: Please enter the word 'EXIT' to exit.`,
    });
    session.state = "awaitingDate";
    try {
      await updateSession(userPhone, {
        state: "awaitingDate",
        slotPreference: undefined,
        slotOptions: undefined,
      });
    } catch (err) {
      console.error("updateSession error:", err);
    }
    return;
  }
  session.state = "awaitingTime";
  session.slotPreference = pref;
  session.slotOptions = slots;
  try {
    await updateSession(userPhone, {
      state: "awaitingTime",
      slotPreference: pref,
      slotOptions: slots,
    });
  } catch (err) {
    console.error("updateSession error:", err);
  }
  const slotsMsg =
    `Available ${pref} slots for ${session.selectedDate ?? ""} (${dayOfWeekLabel(
      session.selectedDate ?? ""
    )}):\n\n` +
    slots.map((s, i) => `${String(i + 1)}. ${s}`).join("\n") +
    "\n\nReply with the slot number.\n\nNote: Please enter the word 'EXIT' to exit.";
  await sendWhatsAppText({ to: userPhone, body: slotsMsg });
}

async function handleAwaitingTime(
  session: AppointmentSession,
  userPhone: string,
  message: string
): Promise<void> {
  const index = parseInt(message);
  if (!session.selectedDate) {
    await sendWhatsAppText({
      to: userPhone,
      body: "No date selected. Please choose a date first.\n\nNote: Please enter the word 'EXIT' to exit.",
    });
    session.state = "awaitingDate";
    try {
      await updateSession(userPhone, {
        state: "awaitingDate",
        slotPreference: undefined,
        slotOptions: undefined,
      });
    } catch (err) {
      console.error("updateSession error:", err);
    }
    return;
  }
  // Prefer the slots we already showed to the user to avoid mismatch
  let slots: string[] = Array.isArray(session.slotOptions)
    ? session.slotOptions
    : [];
  if (slots.length === 0) {
    try {
      slots = await getAvailableSlots(
        session.selectedDate,
        session.slotPreference
      );
    } catch (err) {
      console.error("getAvailableSlots error:", err);
      await sendWhatsAppText({
        to: userPhone,
        body: "Sorry, we couldn't load available slots. Please try again later.",
      });
      return;
    }
  }
  if (Number.isNaN(index) || index < 1 || index > slots.length) {
    await sendWhatsAppText({
      to: userPhone,
      body: "Invalid choice. Please select a valid slot number.\n\nNote: Please enter the word 'EXIT' to exit.",
    });
    return;
  }
  session.selectedTime = slots[index - 1];
  session.state = "awaitingConfirm";
  try {
    await updateSession(userPhone, {
      state: "awaitingConfirm",
      selectedTime: slots[index - 1],
      slotOptions: undefined,
      slotPreference: undefined,
    });
  } catch (err) {
    console.error("updateSession error:", err);
  }
  await sendWhatsAppText({
    to: userPhone,
    body: `Confirm your booking:\n👤Name: ${session.name || ""}\n📅 Date: ${
      session.selectedDate
    } (${dayOfWeekLabel(session.selectedDate)})\n🕒 Time: ${
      session.selectedTime || ""
    }\n\nReply with Yes or No.`,
  });
}

async function handleAwaitingConfirm(
  session: AppointmentSession,
  userPhone: string,
  message: string
): Promise<void> {
  if (message === "yes") {
    try {
      // Re-validate that the chosen time is still available at booking time
      const available = await getAvailableSlots(session.selectedDate ?? "");
      const wanted = normalizeTimeLabel(session.selectedTime ?? "");
      const isFree = available
        .map((s) => normalizeTimeLabel(s))
        .includes(wanted);
      if (!isFree) {
        await sendWhatsAppText({
          to: userPhone,
          body: "Sorry, that slot was just booked by someone else. Please choose another time.",
        });
        try {
          await updateSession(userPhone, {
            state: "awaitingTime",
            selectedTime: undefined,
          });
        } catch (err) {
          console.error("updateSession error:", err);
        }
        return;
      }

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
        body: "Sorry, we couldn't confirm your booking due to a system error. Please try again.\n\nSend a message to view the main menu.",
      });
      try {
        await deleteSession(userPhone);
      } catch (err) {
        console.error("deleteSession error:", err);
      }
      return;
    }
    await sendWhatsAppText({
      to: userPhone,
      body: `✅ Appointment confirmed for ${formatDisplayDateWithDay(
        session.selectedDate ?? ""
      )} at ${session.selectedTime ?? ""}.\nWe will send a reminder a day before your appointment.\n\n Send a message to view the main menu.`,
    });
    try {
      if (adminPhoneNumber) {
        await sendWhatsAppTemplate({
          to: adminPhoneNumber,
          templateName: "am_notification_appointment",
          templateLanguage: "en",
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  parameter_name: "name",
                  text: session.name,
                },
                {
                  type: "text",
                  parameter_name: "phone",
                  text: `+${userPhone}`,
                },
                {
                  type: "text",
                  parameter_name: "date",
                  text: formatDisplayDateWithDay(session.selectedDate ?? ""),
                },
                {
                  type: "text",
                  parameter_name: "time",
                  text: session.selectedTime,
                },
              ],
            },
          ],
        });
      }
    } catch (err) {
      console.error("sendWhatsAppTemplate/deleteSession error:", err);
    } finally {
      try {
        await deleteSession(userPhone);
      } catch (err) {
        console.error("deleteSession error:", err);
      }
    }
    return;
  } else if (message === "no") {
    await sendWhatsAppText({
      to: userPhone,
      body: "❌ Booking cancelled.\n\nSend a message to view the main menu.",
    });
    try {
      await deleteSession(userPhone);
    } catch (err) {
      console.error("deleteSession error:", err);
    }
    return;
  }
  await sendWhatsAppText({
    to: userPhone,
    body: "Please reply with Yes or No to confirm your booking.\n\nNote: Please enter the word 'EXIT' to exit.",
  });
}

async function handleRescheduleNewDate(
  session: AppointmentSession,
  userPhone: string,
  message: string
): Promise<void> {
  const index = parseInt(message);
  if (Number.isNaN(index) || index < 1 || index > 7) {
    await sendWhatsAppText({
      to: userPhone,
      body: "Invalid choice. Please select 1-7.\n\nNote: Please enter the word 'EXIT' to exit.",
    });
    return;
  }

  const dateOptions = session.dateOptions;
  if (!dateOptions) {
    await sendWhatsAppText({
      to: userPhone,
      body: "Session expired. Please start again by sending a message to view the main menu.",
    });
    try {
      await deleteSession(userPhone);
    } catch (err) {
      console.error("deleteSession error:", err);
    }
    return;
  }

  const pickedDate = dateOptions[index - 1];
  if (!pickedDate) {
    await sendWhatsAppText({
      to: userPhone,
      body: "Invalid choice. Please select a valid date option. \n\nNote: Please enter the word 'EXIT' to exit.",
    });
    return;
  }

  session.selectedDate = pickedDate;
  try {
    await updateSession(userPhone, {
      selectedDate: pickedDate,
      state: "rescheduleNewDate",
    });
  } catch (err) {
    console.error("updateSession error:", err);
  }

  const day = dayOfWeekLabel(pickedDate);
  if (day === "Sunday") {
    let slots: string[] = [];
    try {
      slots = await getAvailableSlots(pickedDate, "morning");
    } catch (err) {
      console.error("getAvailableSlots error:", err);
      await sendWhatsAppText({
        to: userPhone,
        body: "Sorry, we couldn't load available slots. Please try again later.\n\nSend a message to view the main menu.",
      });
      return;
    }
    if (slots.length === 0) {
      await sendWhatsAppText({
        to: userPhone,
        body: `Sorry, no slots available on ${pickedDate}. Please choose another date.\n\nNote: Please enter the word 'EXIT' to exit.`,
      });
      session.state = "rescheduleNewDate";
      try {
        await updateSession(userPhone, {
          state: "rescheduleNewDate",
        });
      } catch (err) {
        console.error("updateSession error:", err);
      }
      return;
    }
    session.state = "rescheduleNewTime";
    session.slotPreference = "morning";
    session.slotOptions = slots;
    try {
      await updateSession(userPhone, {
        state: "rescheduleNewTime",
        slotPreference: "morning",
        slotOptions: slots,
      });
    } catch (err) {
      console.error("updateSession error:", err);
    }
    const slotsMsg =
      `Available slots for ${pickedDate} (${day}):\n\n` +
      slots.map((s, i) => `${String(i + 1)}. ${s}`).join("\n") +
      "\n\nReply with the slot option number.\n\nNote: Please enter the word 'EXIT' to exit.";
    await sendWhatsAppText({ to: userPhone, body: slotsMsg });
  } else {
    session.state = "rescheduleSession";
    try {
      await updateSession(userPhone, {
        state: "rescheduleSession",
      });
    } catch (err) {
      console.error("updateSession error:", err);
    }
    await sendWhatsAppText({
      to: userPhone,
      body: "Please choose your preference:\n 1. Morning\n 2. Evening \n\nNote: Please enter the word 'EXIT' to exit.",
    });
  }
}

async function handleRescheduleSession(
  session: AppointmentSession,
  userPhone: string,
  message: string
): Promise<void> {
  if (message !== "1" && message !== "2") {
    await sendWhatsAppText({
      to: userPhone,
      body: "Invalid choice. Reply 1 for Morning or 2 for Evening. \n\nNote: Please enter the word 'EXIT' to exit.",
    });
    return;
  }
  const pref = message === "1" ? "morning" : "evening";
  let slots: string[] = [];
  try {
    slots = await getAvailableSlots(session.selectedDate ?? "", pref);
  } catch (err) {
    console.error("getAvailableSlots error:", err);
    await sendWhatsAppText({
      to: userPhone,
      body: "Sorry, we couldn't load available slots. Please try again later.\n\nSend a message to view the main menu.",
    });
    return;
  }
  if (slots.length === 0) {
    await sendWhatsAppText({
      to: userPhone,
      body: `Sorry, no ${pref} slots available on ${session.selectedDate ?? ""}. \nPlease choose another date.\n\nNote: Please enter the word 'EXIT' to exit.`,
    });
    session.state = "rescheduleNewDate";
    try {
      await updateSession(userPhone, {
        state: "rescheduleNewDate",
      });
    } catch (err) {
      console.error("updateSession error:", err);
    }
    return;
  }
  session.state = "rescheduleNewTime";
  session.slotPreference = pref;
  session.slotOptions = slots;
  try {
    await updateSession(userPhone, {
      state: "rescheduleNewTime",
      slotPreference: pref,
      slotOptions: slots,
    });
  } catch (err) {
    console.error("updateSession error:", err);
  }
  const slotsMsg =
    `Available ${pref} slots for ${session.selectedDate ?? ""} (${dayOfWeekLabel(
      session.selectedDate ?? ""
    )}):\n\n` +
    slots.map((s, i) => `${String(i + 1)}. ${s}`).join("\n") +
    "\n\nReply with the slot option number.\n\nNote: Please enter the word 'EXIT' to exit.";
  await sendWhatsAppText({ to: userPhone, body: slotsMsg });
}

async function handleRescheduleNewTime(
  session: AppointmentSession,
  userPhone: string,
  message: string
): Promise<void> {
  const index = parseInt(message);
  if (!session.selectedDate) {
    await sendWhatsAppText({
      to: userPhone,

      body: "No date selected. Please choose a date first.\n\nNote: Please enter the word 'EXIT' to exit.",
    });
    session.state = "rescheduleNewDate";
    try {
      await updateSession(userPhone, {
        state: "rescheduleNewDate",
      });
    } catch (err) {
      console.error("updateSession error:", err);
    }
    return;
  }
  // Use the exact options shown to the user earlier if available
  let slots: string[] = Array.isArray(session.slotOptions)
    ? session.slotOptions
    : [];
  if (slots.length === 0) {
    try {
      slots = await getAvailableSlots(
        session.selectedDate,
        session.slotPreference
      );
    } catch (err) {
      console.error("getAvailableSlots error:", err);
      await sendWhatsAppText({
        to: userPhone,

        body: "Sorry, we couldn't load available slots. Please try again later.\n\nSend a message to view the main menu.",
      });
      return;
    }
  }
  if (Number.isNaN(index) || index < 1 || index > slots.length) {
    await sendWhatsAppText({
      to: userPhone,

      body: "Invalid choice. Please select a valid slot number.\n\nNote: Please enter the word 'EXIT' to exit.",
    });
    return;
  }
  session.selectedTime = slots[index - 1];
  session.state = "rescheduleCheck";
  try {
    await updateSession(userPhone, {
      selectedTime: slots[index - 1],
      state: "rescheduleCheck",
      slotOptions: undefined,
      slotPreference: undefined,
    });
  } catch (err) {
    console.error("updateSession error:", err);
  }
  await sendWhatsAppText({
    to: userPhone,

    body:
      `Confirm your new appointment:\n` +
      `📅 Date: ${session.selectedDate} (${dayOfWeekLabel(session.selectedDate)})\n` +
      `🕒 Time: ${session.selectedTime ?? ""}\n\nReply with Yes or No.`,
  });
}

async function handleRescheduleCheck(
  session: AppointmentSession,
  userPhone: string,
  message: string
): Promise<void> {
  if (message === "yes") {
    if (!session.selectedDate || !session.selectedTime) {
      await sendWhatsAppText({
        to: userPhone,

        body: "Missing date or time. Please reschedule again.\n\n Send a message to view the main menu.",
      });
      try {
        await deleteSession(userPhone);
      } catch (err) {
        console.error("deleteSession error:", err);
      }
      return;
    }

    let existingAppt: Appointment | null = null;
    try {
      existingAppt = await getAppointmentByUserPhone(userPhone);
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

        body: "Sorry, we couldn't reschedule your appointment due to a system error. Please try again.\n\nSend a message to view the main menu.",
      });
      try {
        await deleteSession(userPhone);
      } catch (err) {
        console.error("deleteSession error:", err);
      }
      return;
    }
    await sendWhatsAppText({
      to: userPhone,

      body: `✅ Appointment successfully rescheduled to: \n\nNew Date: ${formatDisplayDateWithDay(session.selectedDate)} \nNew Time: ${session.selectedTime}\n\n Send a message to view the main menu.`,
    });

    if (adminPhoneNumber && existingAppt) {
      await sendWhatsAppTemplate({
        to: adminPhoneNumber,
        templateName: "am_notification_reschedule",
        templateLanguage: "en",
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                parameter_name: "name",
                text: existingAppt.name,
              },
              {
                type: "text",
                parameter_name: "phone",
                text: `+${existingAppt.userPhone}`,
              },
              {
                type: "text",
                parameter_name: "prev_date",
                text: formatDbDateWithDay(existingAppt.date),
              },
              {
                type: "text",
                parameter_name: "prev_time",
                text: existingAppt.time,
              },
              {
                type: "text",
                parameter_name: "new_date",
                text: formatDisplayDateWithDay(session.selectedDate),
              },
              {
                type: "text",
                parameter_name: "new_time",
                text: session.selectedTime,
              },
            ],
          },
        ],
      });
    }
    try {
      await deleteSession(userPhone);
    } catch (err) {
      console.error("deleteSession error:", err);
    }

    return;
  } else if (message === "no") {
    await sendWhatsAppText({
      to: userPhone,

      body: "❌ Reschedule cancelled. \n\nSend a message to view the main menu.",
    });
    try {
      await deleteSession(userPhone);
    } catch (err) {
      console.error("deleteSession error:", err);
    }
    return;
  }
}

async function handleConfirmCancel(
  session: AppointmentSession,
  userPhone: string,
  message: string
): Promise<void> {
  if (message !== "yes") {
    await sendWhatsAppText({
      to: userPhone,
      body: "Your appointment is not cancelled. ❌ \n\nSend a message to view the main menu.",
    });
    try {
      await deleteSession(userPhone);
    } catch (err) {
      console.error("deleteSession error:", err);
    }
    return;
  }

  let appointmentForParams: Appointment | null = null;
  try {
    appointmentForParams = await getAppointmentByUserPhone(userPhone);
  } catch (err) {
    console.error("getAppointmentByUserPhone (cancel) error:", err);
  }

  try {
    await deleteAppointmentByUserPhone(userPhone);

    const adminPromise = adminPhoneNumber
      ? sendWhatsAppTemplate({
          to: adminPhoneNumber,
          templateName: "am_notification_cancellation",
          templateLanguage: "en",
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  parameter_name: "name",
                  text: appointmentForParams?.name ?? session.name ?? "",
                },
                {
                  type: "text",
                  parameter_name: "phone",
                  text: `+${userPhone}`,
                },
                {
                  type: "text",
                  parameter_name: "date",
                  text:
                    (appointmentForParams
                      ? formatDbDateWithDay(appointmentForParams.date)
                      : formatDisplayDateWithDay(session.selectedDate ?? "")) ||
                    "",
                },
                {
                  type: "text",
                  parameter_name: "time",
                  text:
                    appointmentForParams?.time ?? session.selectedTime ?? "",
                },
              ],
            },
          ],
        })
      : Promise.resolve();

    const userPromise = sendWhatsAppText({
      to: userPhone,
      body: "✅ Appointment cancelled successfully.\n\nSend a message to view the main menu.",
    });

    const [userResult, adminResult] = await Promise.allSettled([
      userPromise,
      adminPromise,
    ]);
    if (userResult.status === "rejected") {
      console.error("sendWhatsAppText (user) error:", userResult.reason);
    }
    if (adminResult.status === "rejected") {
      console.error("sendWhatsAppTemplate (admin) error:", adminResult.reason);
    }
  } catch (err) {
    console.error("cancel appointment error:", err);
    await sendWhatsAppText({
      to: userPhone,
      body: "Sorry, we couldn't cancel your appointment right now. Please try again later.\n\nSend a message to view the main menu.",
    });
  } finally {
    try {
      await deleteSession(userPhone);
    } catch (err) {
      console.error("deleteSession error:", err);
    }
  }
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
  const existingSession: AppointmentSession | null =
    await getSession(userPhone);
  const message = text.trim().toLowerCase();

  if (message === "exit") {
    await handleExit(userPhone);
    return;
  }

  // Global button/text shortcuts: handle "RESCHEDULE" or "CANCEL" from any state
  if (message === "reschedule" || message === "cancel") {
    const session: AppointmentSession = existingSession ?? {
      state: "mainMenu",
      lastInteractionUnixMs: now,
    };
    if (!existingSession) {
      await setSession(userPhone, session);
    } else {
      try {
        await updateSession(userPhone, { lastInteractionUnixMs: now });
      } catch (err) {
        console.error("updateSession error:", err);
      }
    }
    await handleMainMenu(session, userPhone, message);
    return;
  }

  if (!existingSession) {
    await setSession(userPhone, {
      state: "mainMenu",
      lastInteractionUnixMs: now,
    });
    await sendWhatsAppText({
      to: userPhone,
      body: mainMenuMessage,
    });
    return;
  }

  const session: AppointmentSession = existingSession;
  session.lastInteractionUnixMs = now;
  try {
    await updateSession(userPhone, {
      lastInteractionUnixMs: now,
    });
  } catch (err) {
    console.error("updateSession error:", err);
  }

  if (session.state === "mainMenu") {
    await handleMainMenu(session, userPhone, message);
    return;
  }
  if (session.state === "awaitingName") {
    await handleAwaitName(session, userPhone, text);
    return;
  }
  if (session.state === "awaitingDate") {
    await handleAwaitingDate(session, userPhone, message);
    return;
  }
  if (session.state === "awaitingSession") {
    await handleAwaitingSession(session, userPhone, message);
    return;
  }
  if (session.state === "awaitingTime") {
    await handleAwaitingTime(session, userPhone, message);
    return;
  }
  if (session.state === "awaitingConfirm") {
    await handleAwaitingConfirm(session, userPhone, message);
    return;
  }
  if (session.state === "rescheduleNewDate") {
    await handleRescheduleNewDate(session, userPhone, message);
    return;
  }
  if (session.state === "rescheduleSession") {
    await handleRescheduleSession(session, userPhone, message);
    return;
  }
  if (session.state === "rescheduleNewTime") {
    await handleRescheduleNewTime(session, userPhone, message);
    return;
  }
  if (session.state === "rescheduleCheck") {
    await handleRescheduleCheck(session, userPhone, message);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (session.state === "confirmCancel") {
    await handleConfirmCancel(session, userPhone, message);
    return;
  }

  // Fallback: unknown state → reset to main menu
  try {
    await updateSession(userPhone, { state: "mainMenu" });
  } catch (err) {
    console.error("updateSession error:", err);
  }
  await sendWhatsAppText({ to: userPhone, body: mainMenuMessage });
}

async function showAppointments(userPhone: string): Promise<void> {
  const list: Appointment[] = [];
  try {
    const listForUser = await getAppointmentByUserPhone(userPhone);
    if (listForUser) {
      list.push(listForUser);
    }
  } catch (err) {
    console.error("getAppointmentByUserPhone error:", err);
    await sendWhatsAppText({
      to: userPhone,
      body: "Sorry, we couldn't retrieve your appointment right now. Please try again later.\n\nSend a message to view the main menu.",
    });
    return;
  }

  if (list.length === 0) {
    await sendWhatsAppText({
      to: userPhone,
      body: "No appointments found. Please book a new appointment. \n\nSend a message to view the main menu.",
    });
    return;
  }
  const lines = list
    .map(
      (a, i) =>
        `${String(i + 1)}. ${formatDbDateWithDay(a.date)} at ${a.time} — ${a.serviceTitle} (${a.name})`
    )
    .join("\n");
  await sendWhatsAppText({
    to: userPhone,
    body: `Your appointments:\n\n${lines} \n\n Send a message to view the main menu.`,
  });
}
