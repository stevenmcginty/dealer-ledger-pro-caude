import { execSync } from 'node:child_process';
const wa = JSON.parse(execSync(`firebase database:get "/salesAgentPrivate/-OXmKH0D2CB0JFIi3cEi/whatsapp" --project motor-ledger-pro`, { env: { ...process.env, MSYS_NO_PATHCONV: '1' }, encoding: 'utf8' }));
const r = await fetch(`https://graph.facebook.com/v22.0/${wa.businessAccountId}/message_templates?fields=name,status,category,language,rejected_reason`, { headers: { Authorization: `Bearer ${wa.accessToken}` } });
console.log(JSON.stringify(await r.json(), null, 1));
