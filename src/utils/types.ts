export type AppointmentSessionState =
  | "mainMenu"
  | "awaitingName"
  | "awaitingDate"
  | "awaitingTime"
  | "awaitingConfirm"
  | "rescheduleCheck"
  | "rescheduleNewDate"
  | "rescheduleNewTime"
  | "rescheduleSession"
  | "confirmCancel"
  | "awaitingSession";

export interface AppointmentSession {
  state: AppointmentSessionState;
  selectedDate?: string;
  selectedTime?: string;
  name?: string;
  lastInteractionUnixMs: number;
  dateOptions?: string[];
}

export interface WebhookMessage {
  from?: string;
  type?: string;
  id?: string;
  text?: { body?: string };
}

export interface WebhookChangeValue {
  metadata?: { phone_number_id?: string };
  messages?: WebhookMessage[];
}

export interface WebhookChange {
  value?: WebhookChangeValue;
}
export interface WebhookEntry {
  changes?: WebhookChange[];
}
export interface WebhookBody {
  object?: string;
  entry?: WebhookEntry[];
}
