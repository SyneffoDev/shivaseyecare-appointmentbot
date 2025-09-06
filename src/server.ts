import { Hono } from "hono";
import { prettyJSON } from "hono/pretty-json";
import { Cron } from "croner";

import { handleUserReply } from "./appointmentFlow";
import { readAppointments } from "./storage";
import { sendReminder } from "./utils/reminder";
import dayjs from "dayjs";

const port = process.env.PORT || 3000;

const app = new Hono();

new Cron(
  "0 7 * * *",
  {
    timezone: "Asia/Kolkata",
  },
  async () => {
    await sendReminder(dayjs().format("YYYY-MM-DD"));
  }
);
// For testing
// new Cron(
//   "50 10 * * *",
//   {
//     timezone: "Asia/Kolkata",
//   },
//   async () => {
//     console.log("Sending reminder for", dayjs().format("YYYY-MM-DD"));
//     await sendReminder(dayjs().format("YYYY-MM-DD"));
//   }
// );

new Cron(
  "0 20 * * *",
  {
    timezone: "Asia/Kolkata",
  },
  async () => {
    await sendReminder(dayjs().add(1, "day").format("YYYY-MM-DD"));
  }
);

// Pretty JSON in development
app.use(prettyJSON());

// Health check
app.get("/health", (c) => {
  console.log("Health check");
  return c.text("OK");
});

// Webhook verification (GET)
app.get("/webhook", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  const urlToken = c.req.query("token");

  if (urlToken !== process.env.URL_TOKEN) {
    return c.body(null, 400);
  }

  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token && challenge) {
    if (token === verifyToken) {
      return c.text(challenge, 200);
    }
    console.warn(
      "[VERIFY] Token mismatch. Received len=%s, expected len=%s",
      token.length,
      verifyToken?.length ?? 0
    );
    return c.body(null, 403);
  }

  return c.body(null, 400);
});

// Webhook receiver (POST)
interface WebhookMessage {
  from?: string;
  type?: string;
  text?: { body?: string };
}

interface WebhookChangeValue {
  metadata?: { phone_number_id?: string };
  messages?: WebhookMessage[];
}

interface WebhookChange {
  value?: WebhookChangeValue;
}
interface WebhookEntry {
  changes?: WebhookChange[];
}
interface WebhookBody {
  object?: string;
  entry?: WebhookEntry[];
}

app.post("/webhook", async (c) => {
  try {
    if (c.req.query("token") !== process.env.URL_TOKEN) {
      console.log("Unknown request");
      return c.body(null, 400);
    }

    const body: WebhookBody | undefined = await c.req.json();

    if (!body || body.object !== "whatsapp_business_account") {
      return c.body(null, 400);
    }

    console.log("Incoming webhook:", JSON.stringify(body, null, 2));

    const entryList: WebhookEntry[] = Array.isArray(body.entry)
      ? body.entry
      : [];
    for (const entry of entryList) {
      const changeList: WebhookChange[] | undefined[] = Array.isArray(
        entry.changes
      )
        ? entry.changes
        : [];
      for (const change of changeList) {
        const value: WebhookChangeValue = change.value ?? {};
        const phoneNumberIdFromWebhook = value.metadata?.phone_number_id;
        const messages: WebhookMessage[] = Array.isArray(value.messages)
          ? value.messages
          : [];
        for (const message of messages) {
          const from = message.from;
          const type = message.type;
          const text =
            type === "text" && message.text ? message.text.body : undefined;
          console.log("[WhatsApp] from=%s type=%s text=%s", from, type, text);

          if (from && text) {
            // Fire and forget
            handleUserReply(from, text, phoneNumberIdFromWebhook).catch(
              (err: unknown) => {
                console.error("handleUserReply error:", err);
              }
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

export default { port, fetch: app.fetch };
