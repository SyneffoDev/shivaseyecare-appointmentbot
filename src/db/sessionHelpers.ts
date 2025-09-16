import db from "./client";
import { eq } from "drizzle-orm";
import { sessions } from "./schema";
import type { AppointmentSession } from "../utils/types";

export type Session = typeof sessions.$inferSelect;

export async function getSession(
  phoneNumber: string
): Promise<AppointmentSession | null> {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.phoneNumber, phoneNumber));
  return rows[0]?.session ?? null;
}

export async function setSession(
  phoneNumber: string,
  session: AppointmentSession
): Promise<void> {
  await db
    .insert(sessions)
    .values({ phoneNumber, session })
    .onConflictDoUpdate({
      target: sessions.phoneNumber,
      set: { session },
    });
}

export async function deleteSession(phoneNumber: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.phoneNumber, phoneNumber));
}

export async function updateSession(
  phoneNumber: string,
  partial: Partial<AppointmentSession>
): Promise<void> {
  const existing = (await getSession(phoneNumber)) ?? {
    state: "mainMenu",
    lastInteractionUnixMs: Date.now(),
  };
  const merged: AppointmentSession = {
    ...existing,
    ...partial,
    lastInteractionUnixMs: partial.lastInteractionUnixMs ?? Date.now(),
  };
  await setSession(phoneNumber, merged);
}
