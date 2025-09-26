import db from "./client";
import { eq, inArray } from "drizzle-orm";
import { sessions } from "./schema";
import type { AppointmentSession } from "../utils/types";
import { sendWhatsAppText } from "../utils/whatsappAPI";

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

export async function deleteExpiredSessions(): Promise<void> {
  const cutoff = Date.now() - 1000 * 60 * 15;
  const rows = await db.select().from(sessions);
  const expiredPhoneNumbers = rows
    .filter(
      (row) =>
        typeof row.session.lastInteractionUnixMs === "number" &&
        row.session.lastInteractionUnixMs < cutoff
    )
    .map((row) => row.phoneNumber);

  if (expiredPhoneNumbers.length === 0) return;

  await db
    .delete(sessions)
    .where(inArray(sessions.phoneNumber, expiredPhoneNumbers));

  for (const phoneNumber of expiredPhoneNumbers) {
    sendWhatsAppText({
      to: phoneNumber,
      body: "Your session has expired due to inactivity. Please send a message to view the main menu.",
    }).catch((err: unknown) => {
      console.error("sendWhatsAppText error:", err);
    });
  }
}
