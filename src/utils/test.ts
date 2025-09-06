// import axios from "axios";

// async function sendReminderDirect() {
//   const graphApiVersion = process.env.GRAPH_API_VERSION || "v23.0";
//   const phoneNumberId = process.env.NUMBER_ID; // e.g. "123456789012345"
//   const whatsappToken = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN; // App token
//   const to = "916382058580"; // recipient in international format, no '+'

//   const appointment = {
//     name: "John Doe",
//     date: "07/09/2025",              // DD/MM/YYYY
//     dayLabel: "Sunday",              // e.g. from your dayOfWeekLabel()
//     time: "10:20 AM",
//     doctor: "G.Ramesh Babu",
//   };

//   if (!phoneNumberId || !whatsappToken) {
//     throw new Error("Missing NUMBER_ID or WHATSAPP_TOKEN");
//   }

//   const url = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`;

//   const payload = {
//     messaging_product: "whatsapp",
//     to,
//     type: "template",
//     template: {
//       name: "appointment_reminder",
//       language: { code: "en" },
//       components: [
//         {
//           type: "header",
//           parameters: [{ type: "text", text: appointment.name }],
//         },
//         {
//           type: "body",
//           parameters: [
//             { type: "text", text: `${appointment.date}(${appointment.dayLabel})` },
//             { type: "text", text: appointment.time },
//             { type: "text", text: appointment.doctor },
//           ],
//         },
//       ],
//     },
//   };

//   const res = await axios.post(url, payload, {
//     headers: {
//       Authorization: `Bearer ${whatsappToken}`,
//       "Content-Type": "application/json",
//     },
//     timeout: 15000,
//   });

//   console.log("Sent:", res.data);
// }

// sendReminderDirect().catch((e) => {
//   console.error(e?.response?.data || e);
// });
