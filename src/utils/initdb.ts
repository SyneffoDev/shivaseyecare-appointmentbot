import { SQL } from "bun";

const db = new SQL({
  url: process.env.DB_URL,
  max: 20,
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

// const rows =
//   await db`SELECT id, user_phone, service_id, service_title, date, time, name, created_at
//   FROM appointments
//   ORDER BY created_at DESC
//   LIMIT 10;`;

// const count = await db`SELECT COUNT(*) FROM appointments;`;
// console.log("Sample query result:", rows);
// console.log("Count:", count[0].count);
