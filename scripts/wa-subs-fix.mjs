import { execSync } from 'node:child_process';
const wa = JSON.parse(execSync(`firebase database:get "/salesAgentPrivate/-OXmKH0D2CB0JFIi3cEi/whatsapp" --project motor-ledger-pro`, { env: { ...process.env, MSYS_NO_PATHCONV: '1' }, encoding: 'utf8' }));
const APP = '28337422112609597';
const appToken = `${APP}|${wa.appSecret}`;
const body = new URLSearchParams({ object: 'whatsapp_business_account', callback_url: 'https://us-central1-motor-ledger-pro.cloudfunctions.net/salesAgentWhatsAppWebhook', verify_token: wa.verifyToken, fields: 'messages', access_token: appToken });
let r = await fetch(`https://graph.facebook.com/v22.0/${APP}/subscriptions`, { method: 'POST', body });
console.log('set', r.status, JSON.stringify(await r.json()));
r = await fetch(`https://graph.facebook.com/v22.0/${APP}/subscriptions?access_token=${appToken}`);
console.log('now', r.status, JSON.stringify(await r.json()));
