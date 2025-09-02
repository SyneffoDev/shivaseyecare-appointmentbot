import fs from "fs/promises";
import path from "path";

export interface StoredAppointment {
  id: string;
  userPhone: string;
  serviceId: string;
  serviceTitle: string;
  date: string;
  time: string;
  name: string;
  createdAtIso: string;
}

const dataDir = path.join(process.cwd(), "data");
const appointmentsFile = path.join(dataDir, "appointments.json");

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true }).catch(() => undefined);
}

export async function readAppointments(): Promise<StoredAppointment[]> {
  try {
    const buf = await fs.readFile(appointmentsFile);
    return JSON.parse(String(buf)) as StoredAppointment[];
  } catch {
    return [];
  }
}

export async function persistAppointment(
  appt: StoredAppointment
): Promise<void> {
  const list = await readAppointments();
  list.push(appt);
  await ensureDataDir();
  await fs.writeFile(appointmentsFile, JSON.stringify(list, null, 2));
}

/**
 * ✅ Delete all appointments for a given user phone number
 */
export async function deleteAppointment(userPhone: string): Promise<void> {
  const list = await readAppointments();
  const filtered = list.filter((a) => a.userPhone !== userPhone);
  await ensureDataDir();
  await fs.writeFile(appointmentsFile, JSON.stringify(filtered, null, 2));
}

/**
 * ✅ Update the first matching appointment for a user
 */
export async function updateAppointment(
  userPhone: string,
  newDate: string,
  newTime: string
): Promise<void> {
  const list = await readAppointments();
  const updatedList = list.map((a) => {
    if (a.userPhone === userPhone) {
      return {
        ...a,
        date: newDate,
        time: newTime,
      };
    }
    return a;
  });
  await ensureDataDir();
  await fs.writeFile(appointmentsFile, JSON.stringify(updatedList, null, 2));
}
