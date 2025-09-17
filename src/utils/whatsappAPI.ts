const whatsappToken: string | undefined = process.env.WHATSAPP_TOKEN;
const graphApiVersion: string = process.env.GRAPH_API_VERSION || "v23.0";
const defaultPhoneNumberId: string | undefined = process.env.NUMBER_ID;
export const adminPhoneNumber: string | undefined =
  process.env.ADMIN_PHONE_NUMBER;

export async function sendWhatsAppText(args: {
  to: string;
  body: string;
}): Promise<void> {
  if (!whatsappToken) {
    console.warn(
      "[WARN] Missing WHATSAPP_TOKEN (or WHATSAPP_ACCESS_TOKEN). Cannot send message."
    );
    return;
  }

  if (!defaultPhoneNumberId) {
    console.warn("[WARN] Missing NUMBER_ID and none provided from webhook.");
    return;
  }

  const url = `https://graph.facebook.com/${graphApiVersion}/${defaultPhoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: args.to,
    type: "text",
    text: { body: args.body },
  } as const;

  // Use inbuilt fetch instead of axios
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 10000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsappToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(
        `[WARN] WhatsApp API responded with status ${response.status.toString()}`
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendAdminNotifications(args: {
  templateName: string;
  components: any[];
}) {
  if (!whatsappToken) {
    console.warn(
      "[WARN] Missing WHATSAPP_TOKEN (or WHATSAPP_ACCESS_TOKEN). Cannot send message."
    );
    return;
  }

  if (!adminPhoneNumber) {
    console.warn("[WARN] Missing ADMIN_PHONE_NUMBER.");
    return;
  }

  await sendWhatsAppTemplate({
    to: adminPhoneNumber,
    templateName: args.templateName,
    templateLanguage: "en",
    components: args.components,
  });
}

export async function sendReadReceipt(messageId: string): Promise<void> {
  if (!whatsappToken) {
    console.warn(
      "[WARN] Missing WHATSAPP_TOKEN (or WHATSAPP_ACCESS_TOKEN). Cannot send message."
    );
    return;
  }

  if (!defaultPhoneNumberId) {
    console.warn("[WARN] Missing NUMBER_ID and none provided from webhook.");
    return;
  }

  const url = `https://graph.facebook.com/${graphApiVersion}/${defaultPhoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
    typing_indicator: {
      type: "text",
    },
  } as const;

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 10000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsappToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(
        `[WARN] WhatsApp API responded with status ${response.status.toString()}`
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendWhatsAppTemplate(args: {
  to: string;
  templateName: string;
  templateLanguage: string;
  components: any[];
}): Promise<void> {
  if (!whatsappToken) {
    console.warn(
      "[WARN] Missing WHATSAPP_TOKEN (or WHATSAPP_ACCESS_TOKEN). Cannot send message."
    );
    return;
  }

  if (!defaultPhoneNumberId) {
    console.warn("[WARN] Missing NUMBER_ID and none provided from webhook.");
    return;
  }

  const url = `https://graph.facebook.com/${graphApiVersion}/${defaultPhoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: args.to,
    type: "template",
    template: {
      name: args.templateName,
      language: { code: args.templateLanguage || "en" },
      components: args.components,
    },
  } as const;

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 10000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsappToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    console.log("response", response);
    console.dir(args.components, { depth: Infinity });
    if (!response.ok) {
      console.warn(
        `[WARN] WhatsApp API responded with status ${response.status.toString()}`
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}
