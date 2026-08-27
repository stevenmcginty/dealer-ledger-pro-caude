import { execSync } from 'node:child_process';
const wa = JSON.parse(execSync(`firebase database:get "/salesAgentPrivate/-OXmKH0D2CB0JFIi3cEi/whatsapp" --project motor-ledger-pro`, { env: { ...process.env, MSYS_NO_PATHCONV: '1' }, encoding: 'utf8' }));
const r = await fetch(`https://graph.facebook.com/v22.0/${wa.businessAccountId}/message_templates`, {
  method: 'POST', headers: { Authorization: `Bearer ${wa.accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'enquiry_followup', language: 'en_GB', category: 'MARKETING',
    components: [{ type: 'BODY',
      text: "Hi {{1}}, thanks for enquiring about the {{2}}. It's still available. Would you like any more details, or to arrange a viewing or test drive?",
      example: { body_text: [["Sam", "2019 BMW 320d M Sport"]] } }],
  }),
});
console.log(r.status, JSON.stringify(await r.json(), null, 1));
