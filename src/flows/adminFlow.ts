import { sendWhatsAppText } from "../utils/whatsappAPI";
import { getAppointmentsByDate } from "../db/helpers";

const adminPhoneNumber: string | undefined = process.env.ADMIN_PHONE_NUMBER;

export async function handleAdminReply(
  text: string,
  messageId: string
): Promise<void> {
  //TO IMPLEMENT: Handle admin replies for all admin commands

  if (!adminPhoneNumber) {
    console.warn("[WARN] ADMIN_PHONE_NUMBER is not set");
    return;
  }

  console.log("handleAdminReply", text, messageId);
  const appointments = await getAppointmentsByDate(new Date().toISOString());
  await sendWhatsAppText({
    to: adminPhoneNumber,
    body: `Appointments: ${appointments.map((appointment) => appointment.id).join(", ")}`,
  });
}
