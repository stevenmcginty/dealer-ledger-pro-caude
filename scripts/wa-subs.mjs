import { execSync } from 'node:child_process';
const wa = JSON.parse(execSync(`firebase database:get "/salesAgentPrivate/-OXmKH0D2CB0JFIi3cEi/whatsapp" --project motor-ledger-pro`, { env: { ...process.env, MSYS_NO_PATHCONV: '1' }, encoding: 'utf8' }));
const APP = '28337422112609597';
const appToken = `${APP}|${wa.appSecret}`;
const r = await fetch(`https://graph.facebook.com/v22.0/${APP}/subscriptions?access_token=${appToken}`);
console.log('subscriptions', r.status, JSON.stringify(await r.json(), null, 1));
