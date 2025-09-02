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

export async function persistAppointment(appt: StoredAppointment): Promise<void> {
  const list = await readAppointments();
  list.push(appt);
  await ensureDataDir();
  await fs.writeFile(appointmentsFile, JSON.stringify(list, null, 2));
}



