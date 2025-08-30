import axios from "axios";

const graphApiVersion: string = process.env.GRAPH_API_VERSION || "v23.0";
const defaultPhoneNumberId: string | undefined =
  process.env.WHATSAPP_PHONE_NUMBER_ID;
const whatsappToken: string | undefined =
  process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;

export async function sendWhatsAppText(args: {
  to: string;
  body: string;
  phoneNumberId?: string;
}): Promise<void> {
  if (!whatsappToken) {
    console.warn(
      "[WARN] Missing WHATSAPP_TOKEN (or WHATSAPP_ACCESS_TOKEN). Cannot send message."
    );
    return;
  }

  const resolvedPhoneNumberId = args.phoneNumberId || defaultPhoneNumberId;
  if (!resolvedPhoneNumberId) {
    console.warn(
      "[WARN] Missing WHATSAPP_PHONE_NUMBER_ID and none provided from webhook."
    );
    return;
  }

  const url = `https://graph.facebook.com/${graphApiVersion}/${resolvedPhoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: args.to,
    type: "text",
    text: { body: args.body },
  } as const;

  await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${whatsappToken}`,
      "Content-Type": "application/json",
    },
    timeout: 10000,
  });
}


