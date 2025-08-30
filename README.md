## Shivas Eye Care — WhatsApp Flows Appointment Bot

This service handles WhatsApp Cloud API webhooks and sends a WhatsApp Message Flow to book appointments when a user sends "hi" or "hello".

### Prerequisites

- Meta app with WhatsApp product enabled and a verified WhatsApp Business Account (WABA)
- A WhatsApp Business phone number (Phone Number ID) on the Cloud API
- A published WhatsApp Flow for "Appointment Booking" with a start screen
- Public URL for webhooks (e.g., via `ngrok` or a deployed host)

### Environment variables

Create a `.env` from `.env.example` and fill values:

- `PORT`: Local server port
- `VERIFY_TOKEN` or `WHATSAPP_VERIFY_TOKEN`: Any string; used during webhook verification
- `WHATSAPP_TOKEN` (aka `WHATSAPP_ACCESS_TOKEN`): Permanent system user token with `whatsapp_business_messaging` scope
- `WHATSAPP_PHONE_NUMBER_ID`: Phone number ID from WhatsApp Manager
- `GRAPH_API_VERSION`: e.g., `v20.0` (default in code)
- `WHATSAPP_FLOW_ID`: ID of your Flow (from WhatsApp Manager > Flows)
- `WHATSAPP_FLOW_START_SCREEN_ID`: Start screen ID of that Flow
- `WHATSAPP_FLOW_CTA`: Button label (e.g., "Book Appointment")
- `WHATSAPP_FLOW_MESSAGE_VERSION`: Flow message version (default `3`)

### Install and run

```bash
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:$PORT/health
```

### Webhook setup (Meta)

1. In `Meta for Developers` > your app > `WhatsApp` > `Configuration`:
   - Set Callback URL to `https://YOUR_PUBLIC_DOMAIN/webhook`
   - Set Verify Token to the value of `VERIFY_TOKEN`
2. Subscribe to events for your `WhatsApp Business Account`:
   - `messages`, `message_template_status_update` (optional), and statuses as needed

Verification test from Meta will call `GET /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`.

### WhatsApp Flow setup (Manager)

1. Open WhatsApp Manager > Flows > Create Flow.
2. Build an "Appointment Booking" flow with screens to collect:
   - Patient name
   - Preferred date and time
   - Reason/notes
   - Confirmation screen
3. Publish the Flow and note:
   - `Flow ID`
   - `Start Screen ID` (the first screen to navigate to)

References:
- WhatsApp Flows Getting Started: [developers.facebook.com/docs/whatsapp/flows/gettingstarted](https://developers.facebook.com/docs/whatsapp/flows/gettingstarted)
- Flow JSON Reference: [developers.facebook.com/docs/whatsapp/flows/reference/flowjson](https://developers.facebook.com/docs/whatsapp/flows/reference/flowjson)
- Messages API: [developers.facebook.com/docs/whatsapp/cloud-api/reference/messages](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages)

### Behavior

- Inbound text matching `/^(hi|hello)\b/i` triggers a Flow interactive message:
  - Header: "Welcome to Shivas Eye Care"
  - Body: "Let’s book your appointment. Tap below to start your booking."
  - CTA: `WHATSAPP_FLOW_CTA`
  - Navigates to `WHATSAPP_FLOW_START_SCREEN_ID`

### Manual test endpoint

If you want to send the Flow to a number manually (for testing within an active 24h session), use:

```bash
curl -X POST http://localhost:$PORT/test/flow \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "<E164_USER_NUMBER>",
    "data": { "name": "Test User" }
  }'
```

Replace `<E164_USER_NUMBER>` with a number like `15551234567`.

### Production notes

- Users must have an active 24-hour session (they messaged you first) to receive this Flow as a free-form interactive message. Your "hi"/"hello" trigger guarantees this.
- If you need to start outside the 24-hour window, send a template message first, then follow with the Flow.
- Secure your token handling and avoid logging sensitive data in production.


