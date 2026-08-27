// Submit every template Dave sends, as UTILITY (auto-approved in minutes, unlike MARKETING).
// Usage: MSYS_NO_PATHCONV=1 node scripts/wa-create-templates.mjs
import { execSync } from 'node:child_process';
const wa = JSON.parse(execSync(`firebase database:get "/salesAgentPrivate/-OXmKH0D2CB0JFIi3cEi/whatsapp" --project motor-ledger-pro`, { env: { ...process.env, MSYS_NO_PATHCONV: '1' }, encoding: 'utf8' }));
const templates = [
].filter(Boolean); const all = [
  { name: 'enquiry_reply', text: "Hi {{1}}, thanks for your enquiry about the {{2}}. {{3}} Reply here with any questions or to arrange a viewing.",
    example: [["Sam", "2019 BMW 320d M Sport", "It's still available and ready to view."]] },
  { name: 'missed_call_reply', text: "Hi, thanks for calling {{1}} earlier — sorry we missed you. Which car were you calling about? Reply here and we'll get straight back to you.",
    example: [["Radlett Car Sales"]] },
  { name: 'owner_alert_v2', text: "Update from Dave, your sales assistant, about a customer conversation in the Agent Inbox: {{1}} Open the inbox to reply.", example: [["Dave: Natasha wants to book a test drive"]] },
];
for (const t of all.filter(t => process.argv[2] ? t.name === process.argv[2] : true)) {
  const r = await fetch(`https://graph.facebook.com/v22.0/${wa.businessAccountId}/message_templates`, {
    method: 'POST', headers: { Authorization: `Bearer ${wa.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: t.name, language: 'en_GB', category: 'UTILITY',
      components: [{ type: 'BODY', text: t.text, example: { body_text: t.example } }] }),
  });
  console.log(t.name, r.status, JSON.stringify(await r.json()));
}
