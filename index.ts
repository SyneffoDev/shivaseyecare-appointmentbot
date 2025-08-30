import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { handleUserReply } from "./src/appointmentFlow";
import { readAppointments } from "./src/storage";
import { sendWhatsAppText } from "./src/whatsappClient";

dotenv.config();

const app = express();
const port: number = Number(process.env.PORT) || 3000;
const verifyToken: string | undefined =
  process.env.WHATSAPP_VERIFY_TOKEN || process.env.VERIFY_TOKEN;
// index.ts now focuses on routing and bootstrapping only

// For visibility during setup; remove if too noisy
console.log(verifyToken);

if (!verifyToken) {
  console.warn(
    "[WARN] Missing WHATSAPP_VERIFY_TOKEN (or VERIFY_TOKEN). Webhook verification will fail with 403."
  );
}

app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).send("ok");
});

// GET: Webhook verification (Meta/WhatsApp Cloud API)
app.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"] as string | undefined;
  const token = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"] as string | undefined;

  if (mode === "subscribe" && token && challenge) {
    if (token === verifyToken) {
      return res.status(200).send(challenge);
    }
    console.log(token);
    console.log(verifyToken);
    console.warn(
      "[VERIFY] Token mismatch. Received len=%s, expected len=%s",
      String(token).length,
      String(verifyToken || "").length
    );
    return res.sendStatus(403);
  }

  return res.sendStatus(400);
});

// POST: Receive webhook notifications (messages, statuses, etc.)
app.post("/webhook", (req: Request, res: Response) => {
  try {
    const body = req.body as any;

    // Basic guard
    if (!body || body.object !== "whatsapp_business_account") {
      return res.sendStatus(400);
    }

    // Log minimal info for visibility
    console.log("Incoming webhook:", JSON.stringify(body, null, 2));

    // Parse inbound messages (best-effort, structure per Meta docs)
    const entryList = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entryList) {
      const changeList = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changeList) {
        const value = change.value || {};
        const phoneNumberIdFromWebhook: string | undefined =
          value?.metadata?.phone_number_id;
        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const message of messages) {
          const from = message.from as string | undefined;
          const type = message.type as string | undefined;
          const text: string | undefined =
            type === "text" && message.text ? message.text.body : undefined;
          console.log("[WhatsApp] from=%s type=%s text=%s", from, type, text);

          if (from && text) {
            handleUserReply(from, text, phoneNumberIdFromWebhook).catch((err) =>
              console.error("handleUserReply error:", err)
            );
          }
        }
      }
    }

    // Respond quickly to acknowledge receipt
    return res.status(200).send("EVENT_RECEIVED");
  } catch (error) {
    console.error("Webhook processing error:", error);
    return res.sendStatus(500);
  }
});

// Conversation helpers implemented in ./src/appointmentFlow

// WhatsApp client is implemented in ./src/whatsappClient

// Test endpoint to send a text manually
app.post("/test/text", async (req: Request, res: Response) => {
  try {
    const to = String(req.body?.to || "").trim();
    const phoneNumberId =
      (req.body?.phoneNumberId as string | undefined) || undefined;

    if (!to) {
      return res.status(400).json({ error: "Missing 'to' in body" });
    }

    await sendWhatsAppText({ to, phoneNumberId, body: "Test from Shivas Eye Care." });

    return res.status(200).json({ status: "text_sent" });
  } catch (err: any) {
    console.error("/test/text error:", err?.response?.data || err);
    return res.status(500).json({ error: "Failed to send text" });
  }
});

// Removed Flows Data API in favor of conversational chat flow

// Start HTTP server
app.listen(port, () => {
  console.log(`WhatsApp webhook server listening on port ${port}`);
});

// Simple admin endpoint to list stored appointments
app.get("/admin/appointments", async (_req: Request, res: Response) => {
  try {
    const list = await readAppointments();
    return res.status(200).json({ count: list.length, items: list });
  } catch (err) {
    console.error("/admin/appointments error:", err);
    return res.status(500).json({ error: "Failed to read appointments" });
  }
});
