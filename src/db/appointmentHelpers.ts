import db from "./client";
import { and, eq, gte } from "drizzle-orm";
import { appointments } from "./schema";
import dayjs from "dayjs";

export type Appointment = typeof appointments.$inferSelect;

function getTodayDateString(): string {
  const now = dayjs().format("YYYY-MM-DD");
  return now;
}

async function getAllAppointments(): Promise<Appointment[]> {
  const today = getTodayDateString();
  return await db
    .select()
    .from(appointments)
    .where(gte(appointments.date, today));
}

async function getAppointmentByUserPhone(
  userPhone: string
): Promise<Appointment | null> {
  const today = getTodayDateString();
  const rows = await db
    .select()
    .from(appointments)
    .where(
      and(eq(appointments.userPhone, userPhone), gte(appointments.date, today))
    )
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
