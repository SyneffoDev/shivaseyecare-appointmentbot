import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";

import { handleUserReply } from "./appointmentFlow";
import { readAppointments } from "./storage";
import { sendWhatsAppText } from "./whatsappClient";

const app = new Hono();

// Pretty JSON in development
app.use(prettyJSON());

// Health check
app.get("/health", (c) => {
  console.log("Health check");
  console.log(process.env.WHATSAPP_VERIFY_TOKEN);
  console.log(process.env.VERIFY_TOKEN);
  return c.text("ok");
});

// Webhook verification (GET)
app.get("/webhook", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");

  const verifyToken =
    process.env.WHATSAPP_VERIFY_TOKEN || process.env.VERIFY_TOKEN;

  if (mode === "subscribe" && token && challenge) {
    if (token === verifyToken) {
      return c.text(challenge, 200);
    }
    console.warn(
      "[VERIFY] Token mismatch. Received len=%s, expected len=%s",
      String(token).length,
      String(verifyToken || "").length
    );
    return c.body(null, 403);
  }

  return c.body(null, 400);
});

// Webhook receiver (POST)
app.post("/webhook", async (c) => {
  try {
    const body = await c.req.json();

    if (!body || body.object !== "whatsapp_business_account") {
      return c.body(null, 400);
    }

    console.log("Incoming webhook:", JSON.stringify(body, null, 2));

    const entryList = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entryList) {
      const changeList = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changeList) {
        const value = change.value || {};
        const phoneNumberIdFromWebhook = value?.metadata?.phone_number_id as
          | string
          | undefined;
        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const message of messages) {
          const from = message.from as string | undefined;
          const type = message.type as string | undefined;
          const text =
            type === "text" && message.text
              ? (message.text.body as string)
              : undefined;
          console.log("[WhatsApp] from=%s type=%s text=%s", from, type, text);

          if (from && text) {
            // Fire and forget
            handleUserReply(from, text, phoneNumberIdFromWebhook).catch((err) =>
              console.error("handleUserReply error:", err)
            );
          }
        }
      }
    }

    return c.text("EVENT_RECEIVED", 200);
  } catch (error) {
    console.error("Webhook processing error:", error);
    return c.body(null, 500);
  }
});

// Manual test endpoint
app.post("/test/text", async (c) => {
  try {
    const body = await c.req.json();
    const to = String(body?.to || "").trim();
    const phoneNumberId =
      (body?.phoneNumberId as string | undefined) || undefined;

    if (!to) {
      return c.json({ error: "Missing 'to' in body" }, 400);
    }

    await sendWhatsAppText({
      to,
      phoneNumberId,
      body: "Test from Shivas Eye Care.",
    });

    return c.json({ status: "text_sent" }, 200);
  } catch (err: any) {
    console.error("/test/text error:", err?.response?.data || err);
    return c.json({ error: "Failed to send text" }, 500);
  }
});

// Admin list appointments
app.get("/admin/appointments", async (c) => {
  try {
    const list = await readAppointments();
    return c.json({ count: list.length, items: list }, 200);
  } catch (err) {
    console.error("/admin/appointments error:", err);
    return c.json({ error: "Failed to read appointments" }, 500);
  }
});

export default app;
