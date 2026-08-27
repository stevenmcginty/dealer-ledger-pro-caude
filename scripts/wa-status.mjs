import { execSync } from 'node:child_process';
const COMPANY = '-OXmKH0D2CB0JFIi3cEi';
const wa = JSON.parse(execSync(`firebase database:get "/salesAgentPrivate/${COMPANY}/whatsapp" --project motor-ledger-pro`, { env: { ...process.env, MSYS_NO_PATHCONV: '1' }, encoding: 'utf8' }));
const headers = { Authorization: `Bearer ${wa.accessToken}` };
const G = 'https://graph.facebook.com/v22.0';
for (const [l, u] of [
  ['phone', `${G}/${wa.phoneNumberId}?fields=display_phone_number,code_verification_status,status,name_status,platform_type,messaging_limit_tier,is_official_business_account`],
  ['waba', `${G}/${wa.businessAccountId}?fields=name,account_review_status,business_verification_status,message_template_namespace`],
  ['subs', `${G}/${wa.businessAccountId}/subscribed_apps`],
]) { const r = await fetch(u, { headers }); console.log(l, r.status, JSON.stringify(await r.json())); }
