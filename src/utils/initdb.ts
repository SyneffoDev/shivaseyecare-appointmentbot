/* eslint-disable @typescript-eslint/no-unused-vars */
import { SQL } from "bun";
import type { Appointment } from "./types";

const db = new SQL({
  url: process.env.DB_URL,
});

await db`CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  user_phone TEXT NOT NULL,
  service_id TEXT NOT NULL,
  service_title TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);`;

await db`CREATE INDEX IF NOT EXISTS idx_appointments_user_phone
  ON appointments (user_phone);`;

// const rows: AppointmentRow[] = [...(await db`SELECT id, user_phone, service_id, service_title, date, time, name, created_at
//   FROM appointments
//   ORDER BY created_at DESC
//   LIMIT 10;`)];

// console.log("Sample query rows:", rows);

// const appointment: Appointment | null = [...(await db<Appointment[]>`SELECT * FROM appointments where user_phone = '+15550001111';`)][0] || null;

// console.log(appointment);
