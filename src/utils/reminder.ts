import { sendWhatsAppTemplate } from "../whatsappClient";
import { getAppointmentsByDate } from "../db";
import { dayOfWeekLabel } from "../appointmentFlow";
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
      templateName: "appointment",
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
