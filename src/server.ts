import { Elysia } from "elysia";
import { cron } from "@elysiajs/cron";

import { handleUserReply } from "./flows/appointmentFlow";
import { handleAdminReply } from "./flows/adminFlow";
import { sendReminder } from "./utils/reminder";
import dayjs from "dayjs";
import type {
  WebhookBody,
  WebhookChange,
  WebhookChangeValue,
  WebhookEntry,
  WebhookMessage,
} from "./utils/types";
import { deleteExpiredSessions } from "./db/sessionHelpers";
import { sendWhatsAppText } from "./utils/whatsappAPI";

const port = parseInt(process.env.PORT || "3000");

const app = new Elysia()
  .use(
    cron({
      name: "deleteExpiredSessions",
      pattern: "*/15 * * * *",
      timezone: "Asia/Kolkata",
      run: async () => {
        await deleteExpiredSessions();
      },
    })
  )
  .use(
    cron({
      name: "sendReminderMorning",
      pattern: "0 7 * * *",
      timezone: "Asia/Kolkata",
      run: async () => {
        await sendReminder(dayjs().format("YYYY-MM-DD"));
      },
    })
  )
  .use(
    cron({
      name: "sendReminderEvening",
      pattern: "0 20 * * *",
      timezone: "Asia/Kolkata",
      run: async () => {
        await sendReminder(dayjs().add(1, "day").format("YYYY-MM-DD"));
      },
    })
  );

app.get("/health", () => {
  console.log("Health check");
  return "OK";
});

app.get("/webhook", ({ query }) => {
  const mode = query["hub.mode"] as string | undefined;
  const token = query["hub.verify_token"] as string | undefined;
  const challenge = query["hub.challenge"] as string | undefined;
  const urlToken = query.token as string | undefined;

  if (urlToken !== process.env.URL_TOKEN) {
    return new Response(null, { status: 400 });
  }

  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token && challenge) {
    if (token === verifyToken) {
      return challenge;
    }
    console.warn(
      "[VERIFY] Token mismatch. Received len=%s, expected len=%s",
      token.length,
      verifyToken?.length ?? 0
    );
    return new Response(null, { status: 403 });
  }

  return new Response(null, { status: 400 });
});

app.post("/webhook", ({ query, body }) => {
  try {
    if ((query.token as string | undefined) !== process.env.URL_TOKEN) {
      console.log("Unknown request");
      return new Response(null, { status: 400 });
    }

    const webhookBody: WebhookBody | undefined = body as
      | WebhookBody
      | undefined;

    if (!webhookBody || webhookBody.object !== "whatsapp_business_account") {
      return new Response(null, { status: 400 });
    }

    const entryList: WebhookEntry[] = Array.isArray(webhookBody.entry)
      ? webhookBody.entry
      : [];
    for (const entry of entryList) {
      const changeList: WebhookChange[] | undefined[] = Array.isArray(
        entry.changes
      )
        ? entry.changes
        : [];
      for (const change of changeList) {
        const value: WebhookChangeValue = change.value ?? {};
        const messages: WebhookMessage[] = Array.isArray(value.messages)
          ? value.messages
          : [];
        for (const message of messages) {
          const from = message.from;
          const type = message.type;
          const id = message.id;
          const text =
            type === "text" && message.text ? message.text.body : undefined;
          console.log("[WhatsApp] from=%s type=%s text=%s", from, type, text);
          try {
            if (from && text && id && from === process.env.ADMIN_PHONE_NUMBER) {
              handleAdminReply(text, id).catch((err: unknown) => {
                console.error("handleAdminReply error:", err);
              });
            } else if (from && text && id) {
              handleUserReply(from, text, id).catch((err: unknown) => {
                console.error("handleUserReply error:", err);
              });
            }
          } catch (err) {
            console.error("Webhook processing error:", err);
            if (from) {
              sendWhatsAppText({
                to: from,
                body: "❌ Something went wrong. Please try again later.",
              }).catch((err: unknown) => {
                console.error("sendWhatsAppText error:", err);
              });
            }
          }
        }
      }
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(null, { status: 500 });
  }
});

app.listen(port);

console.log(
  `Server started on http://localhost:${String(app.server?.port ?? port)}`
);
