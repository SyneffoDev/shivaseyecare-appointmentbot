import { SQL } from "bun";
import type { Appointment } from "./utils/types";

const db = new SQL({
  url: process.env.DB_URL,
});

async function getAllAppointments(): Promise<Appointment[]> {
  return [...(await db<Appointment[]>`SELECT * FROM appointments`)];
}

async function getAppointmentByUserPhone(
  userPhone: string
): Promise<Appointment | null> {
  return (
    [
      ...(await db<
        Appointment[]
      >`SELECT * FROM appointments WHERE user_phone = ${userPhone}`),
    ][0] || null
  );
}

async function getAppointmentsByDate(date: string): Promise<Appointment[]> {
  return await db<
    Appointment[]
  >`SELECT * FROM appointments WHERE date = ${date}`;
}

async function createAppointment(appointment: Appointment): Promise<void> {
  await db`INSERT INTO appointments (id, user_phone, service_id, service_title, date, time, name, created_at) VALUES (${appointment.id}, ${appointment.user_phone}, ${appointment.service_id}, ${appointment.service_title}, ${appointment.date}, ${appointment.time}, ${appointment.name}, ${appointment.created_at})`;
}

async function updateAppointment(appointment: Appointment): Promise<void> {
  await db`UPDATE appointments SET service_id = ${appointment.service_id}, service_title = ${appointment.service_title}, date = ${appointment.date}, time = ${appointment.time}, name = ${appointment.name}, created_at = ${appointment.created_at} WHERE user_phone = ${appointment.user_phone}`;
}

async function deleteAppointment(userPhone: string): Promise<void> {
  await db`DELETE FROM appointments WHERE user_phone = ${userPhone}`;
}

export {
  getAllAppointments,
  getAppointmentByUserPhone,
  getAppointmentsByDate,
  createAppointment,
  updateAppointment,
  deleteAppointment,
};
