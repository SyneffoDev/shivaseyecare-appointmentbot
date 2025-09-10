const whatsappToken: string | undefined = process.env.WHATSAPP_TOKEN;
const graphApiVersion: string = process.env.GRAPH_API_VERSION || "v23.0";
const defaultPhoneNumberId: string | undefined = process.env.NUMBER_ID;

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

  const resolvedPhoneNumberId = defaultPhoneNumberId;
  if (!resolvedPhoneNumberId) {
    console.warn("[WARN] Missing NUMBER_ID and none provided from webhook.");
    return;
  }

  const url = `https://graph.facebook.com/${graphApiVersion}/${resolvedPhoneNumberId}/messages`;
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
    // Optionally, you can check for non-2xx responses here
    if (!response.ok) {
      console.warn(
        `[WARN] WhatsApp API responded with status ${response.status.toString()}`
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendReadReceipt(messageId: string): Promise<void> {
  if (!whatsappToken) {
    console.warn(
      "[WARN] Missing WHATSAPP_TOKEN (or WHATSAPP_ACCESS_TOKEN). Cannot send message."
    );
    return;
  }

  const resolvedPhoneNumberId = defaultPhoneNumberId;
  if (!resolvedPhoneNumberId) {
    console.warn("[WARN] Missing NUMBER_ID and none provided from webhook.");
    return;
  }

  const url = `https://graph.facebook.com/${graphApiVersion}/${resolvedPhoneNumberId}/messages`;
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
    // Optionally, you can check for non-2xx responses here
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

  const resolvedPhoneNumberId = defaultPhoneNumberId;
  if (!resolvedPhoneNumberId) {
    console.warn("[WARN] Missing NUMBER_ID and none provided from webhook.");
    return;
  }

  const url = `https://graph.facebook.com/${graphApiVersion}/${resolvedPhoneNumberId}/messages`;
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
    // Optionally, you can check for non-2xx responses here
    if (!response.ok) {
      console.warn(
        `[WARN] WhatsApp API responded with status ${response.status.toString()}`
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}
