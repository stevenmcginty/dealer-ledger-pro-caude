// Register the WhatsApp Cloud API number using the token DLP already holds.
// Usage:  node scripts/wa-register.mjs <6-digit PIN>
// Prints Meta's real error message (the dashboard hides it).
import { execSync } from 'node:child_process';

const pin = process.argv[2];
if (!/^\d{6}$/.test(pin || '')) {
    console.error('Usage: node scripts/wa-register.mjs <6-digit PIN>');
    process.exit(1);
}

const COMPANY = '-OXmKH0D2CB0JFIi3cEi';
const raw = execSync(
    `firebase database:get "/salesAgentPrivate/${COMPANY}/whatsapp" --project motor-ledger-pro`,
    { env: { ...process.env, MSYS_NO_PATHCONV: '1' }, encoding: 'utf8' }
);
const wa = JSON.parse(raw);
const GRAPH = 'https://graph.facebook.com/v22.0';
const headers = { Authorization: `Bearer ${wa.accessToken}`, 'Content-Type': 'application/json' };

const show = async (label, res) => {
    const body = await res.json().catch(() => ({}));
    console.log(`${label}: HTTP ${res.status}`);
    console.log(JSON.stringify(body, null, 2));
    return body;
};

// 1. What does Meta say about the number right now?
await show('status', await fetch(`${GRAPH}/${wa.phoneNumberId}?fields=display_phone_number,verified_name,code_verification_status,status,name_status,quality_rating,platform_type`, { headers }));

// 2. Register it.
await show('register', await fetch(`${GRAPH}/${wa.phoneNumberId}/register`, {
    method: 'POST', headers,
    body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
}));

// 3. Make sure the app is subscribed to the WABA's webhooks.
await show('subscribe', await fetch(`${GRAPH}/${wa.businessAccountId}/subscribed_apps`, { method: 'POST', headers }));
