import {
  getAllAppointments,
  getAppointmentByUserPhone,
  getAppointmentsByDate,
  createAppointment,
  updateAppointment,
  deleteAppointmentByUserPhone,
} from "../db";

const appointment = await getAppointmentByUserPhone("+15550001111");
const appointmentsByDate = await getAppointmentsByDate("2025-01-01");
await createAppointment({
  id: "1",
  userPhone: "+15550001114",
  serviceId: "1",
  serviceTitle: "Test Service",
  date: "2025-01-01",
  time: "10:00",
  name: "Test Name",
  createdAt: "2025-01-01",
});
await updateAppointment({
  id: "1",
  userPhone: "+15550001111",
  serviceId: "1",
  serviceTitle: "Test Service",
  date: "2025-01-01",
  time: "10:00",
  name: "Test Name",
  createdAt: "2025-01-01",
});
const appointments = await getAllAppointments();

await deleteAppointmentByUserPhone("+15550001111");
console.log(appointments);
console.log(appointment);
console.log(appointmentsByDate);
