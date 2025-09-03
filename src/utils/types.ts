export interface DbAppointmentRow {
  id: string;
  user_phone: string;
  service_id: string;
  service_title: string;
  date: string;
  time: string;
  name: string;
  created_at: string;
}

export type AppointmentSessionState =
  | "mainMenu"
  | "awaitingName"
  | "awaitingDate"
  | "awaitingTime"
  | "awaitingConfirm"
  | "rescheduleCheck"
  | "rescheduleNewDate"
  | "rescheduleNewTime"
  | "confirmCancel";

export interface AppointmentSession {
  state: AppointmentSessionState;
  selectedDate?: string;
  selectedTime?: string;
  name?: string;
  lastInteractionUnixMs: number;
  dateOptions?: string[];
}
