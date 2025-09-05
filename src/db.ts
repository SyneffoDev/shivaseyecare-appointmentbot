import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { eq } from "drizzle-orm";
import { appointments } from "./db/schema";

const client = new SQL({
  url: process.env.DATABASE_URL,
});

const db = drizzle(client);

type Appointment = typeof appointments.$inferSelect;

async function getAllAppointments(): Promise<Appointment[]> {
  return await db.select().from(appointments);
}

async function getAppointmentByUserPhone(
  userPhone: string
): Promise<Appointment | null> {
  const rows = await db
    .select()
    .from(appointments)
    .where(eq(appointments.userPhone, userPhone))
    .limit(1);
  return rows[0] ?? null;
}

async function getAppointmentsByDate(date: string): Promise<Appointment[]> {
  return await db
    .select()
    .from(appointments)
    .where(eq(appointments.date, date));
}

async function createAppointment(
  appointment: typeof appointments.$inferInsert
): Promise<void> {
  await db.insert(appointments).values(appointment);
}

async function updateAppointment(appointment: Appointment): Promise<void> {
  await db
    .update(appointments)
    .set({
      serviceId: appointment.serviceId,
      serviceTitle: appointment.serviceTitle,
      date: appointment.date,
      time: appointment.time,
      name: appointment.name,
      createdAt: appointment.createdAt,
    })
    .where(eq(appointments.userPhone, appointment.userPhone));
}

async function deleteAppointmentByUserPhone(userPhone: string): Promise<void> {
  await db.delete(appointments).where(eq(appointments.userPhone, userPhone));
}

export {
  getAllAppointments,
  getAppointmentByUserPhone,
  getAppointmentsByDate,
  createAppointment,
  updateAppointment,
  deleteAppointmentByUserPhone,
};
