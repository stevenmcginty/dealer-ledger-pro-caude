# AI Sales Agent — build spec (26 Aug 2026)

Always-on front-desk sales assistant for Radlett Car Sales. Answers inbound WhatsApp / SMS / email enquiries, answers stock questions from a daily-indexed copy of radlettcarsales.com plus the ledger's own vehicle records, runs the 3-step qualification flow, books viewings, pings Steve on WhatsApp, and supports clean human take-over.

Decisions (Steve, 26 Aug 2026):
- Lives inside Dealer Ledger Pro (Firebase project `motor-ledger-pro`), not a separate project. Nothing runs on the phone.
- WhatsApp: Steve's existing number via Meta **Coexistence** (WhatsApp Business app + Cloud API on the same number).
- SMS: parked (Steve, 26 Aug). Launch is Gmail + WhatsApp. Twilio adapter stays in code but unconfigured. Phase 2 idea: read-only SMS watcher on the office Windows PC (Playwright on a logged-in Google Messages for web session) posting inbound texts to the agent; agent never replies by SMS — replies go WhatsApp/email, and after-sales/problem texts only alert Steve.
- Email: `radlettcars@gmail.com` via Gmail API (OAuth refresh token + `users.watch` push to Pub/Sub → function). No polling.
- Brain: **Gemini 2.5 Flash** via `@google/genai` server-side (key in functions secret `GEMINI_API_KEY`). Code owns state, tools, pricing rules, escalation; Gemini only writes words and picks tools.
- Price: hint mode — "we price competitively but there's usually a bit of movement, a few hundred pounds"; never a figure. Second push or a request for a number → escalate to Steve.

## Architecture

```
Inbound  WhatsApp Cloud API webhook  (salesAgentWhatsAppWebhook, GET verify + POST)
         Twilio SMS webhook          (salesAgentSmsWebhook, signature-validated)
         Gmail Pub/Sub push          (salesAgentGmailPush) → history.list → new messages
            │
   router.ts   dedupe by providerId → contactIndex → find/create Conversation (+ shortId)
               → create/attach CRM Lead (companies/{cid}/leads) + Activity
               → owner-number messages go to ownerCommands.ts instead
               → mode: agent → brain; human/paused → store only, alert owner
            │
   brain/     Gemini with tools: search_stock, get_stock_item, get_business_info,
              book_viewing, escalate_to_owner, request_handoff
            │
   outbox     reply queued with sendAfter = now + rand(20..45 s); outboxTick (every minute)
              drains it via channels/{whatsapp,twilio,gmail}.ts
            │
   alerts.ts  WhatsApp to settings.ownerAlertNumber on new conversation / escalation / booking / error
              (every alert carries "#<shortId>" so Steve can reply TAKE OVER 12 etc.)

Daily 06:00 Europe/London  stock/index.ts scrapes the Car Dealer 5 site → salesAgent/stock
```

Contracts: `functions/src/salesAgent/types.ts` (RTDB layout at top). Change shapes only by updating that file and this doc.

## Shared website, several ledger accounts
radlettcarsales.com is shared by more than one Dealer Ledger Pro company (Steve; Chris/Tommy). The stock indexer matches every scraped car by reg against EVERY company's vehicles (admin SDK) and records `ownerCompanyId`. A car is hidden from Dave (`hiddenReason`) when its owner company has `shareStockWithAgent === false`, or when it matches nobody and the indexing company's `unmatchedStockPolicy` is 'exclude'. Hidden cars are never returned by search_stock/get_stock_item; if a customer asks about one, Dave sends NOTHING and hands the conversation to a human (request_handoff) so Steve/Chris answer manually. Sharing is opt-in: a company's cars are usable only if that company has the assistant enabled and hasn't turned sharing off; unmatched website cars follow unmatchedStockPolicy (Steve: 'exclude'). Each company's Dave keeps its own conversations/settings; only the stock index is cross-company aware.

## Notifications
Every owner alert (new / escalation / question / booking / draft / error) also goes as a Firebase Cloud Messaging web-push. **Android Chrome only** (the phone in Steve's pocket — iOS is not offered). The shade shows **Approve** and **Edit** (or **Answer** on a question). Approve sends the held draft; Edit/tap opens the in-app notification sheet with the full wording. Cold start uses `/app?dave=<convId>` (`&daveAction=approve` from Approve). WhatsApp alert remains the fallback. The in-app bell still works on desktop.

## Brain rules
System prompt structure:
1. Role + business: the agent is **Dave** (settings.agentName), on the sales desk at Radlett Car Sales. Signs as Dave. Completely human, down-to-earth UK sales tone; genuine, friendly, polite manners ("please", "thank you", "that's fine", "no problem at all", "happy to help"); never volunteers that it is AI; if asked outright, deflects lightly without claiming to be human. **Never names Steve, Chris, or any colleague to the customer** unless the customer asked for them. Holding lines are "I'll check that for you". Internal pings still go to the owner.
2. Channel-specific voice:
   - **WhatsApp/SMS**: concise, relaxed, conversational UK; 1–3 short sentences max; naturally polite ("please", "thanks", "that's fine"); no robotic corporate filler ("Certainly!", "I'd be happy to help"), no exclamation overload, no em-dashes, no repeated greetings in ongoing chats.
   - **Email**: structured, professional, thorough (up to 8 sentences / 1200 chars across 2–3 clean paragraphs); warm salutation ("Hi <Name>,"), polite and courteous dealership tone, direct answers to all questions, low-pressure viewing/PX call-to-action, and polite sign-off ("Regards,\nDave\nRadlett Car Sales").
3. Multi-question enquiries & acknowledge first: address every specific question asked in that turn (availability + spec/history + deal/money) before asking the next question. NEVER ask redundant questions (if the customer named the car, vehicle stage is done; if they gave a viewing time, call ask_owner directly; if they stated cash/finance preference, acknowledge it).
4. Qualification flow: Vehicle (skip if named) → Deal (PX / finance) → Timing (mornings vs afternoons) → Details (name + phone) → Booking closure. When agreeing or confirming a visit time, always politely remind the customer: "That's fine, but please call before you leave so we have the car ready out front."
5. Deeper vehicle knowledge: **look it up first**. `search_stock` / `get_stock_item` read the combined Motor Ledger Pro + radlettcarsales.com index (MOT, tax, ULEZ, mpg, spec, service history, advertised price). State those facts. Only `ask_owner` if the record does not have the answer — and even then, do not name a colleague.
6. Smart part-exchange probing: when customer mentions a trade-in, probe for registration and approximate mileage FIRST. Only call `ask_owner` once both are provided. Tell the customer *you* will get a figure, not that Steve will.
7. Dealership knowledge, website & opening hours:
   - **Website & Changing Stock**: All vehicle specs, photos, and details are on the website. Dave politely tells customers to check the website, highlighting that stock is constantly changing and updated regularly.
   - **Opening Hours & Viewings Strictly by Appointment**: Dave knows opening hours from settings/knowledge, but **all viewings are strictly by appointment**. He always politely explains that we are open, but viewings are strictly by appointment, so customers must give us a call / book an appointment before coming down.
   - FAQs from settings (address, phone, warranty, finance partners, test-drive licence rule, delivery).
8. Booking closure: capture full name + phone + window, then `ask_owner` (see Ask-Steve loop) → holding line is "Let me check the diary" (never "check with Steve") → once the desk confirms, `book_viewing` → "That's fine, I've logged that with the sales team... please give us a call before you leave so we have the car ready out front" → owner alert. Whenever a customer agrees a time to come, Dave always confirms with them to call before they leave.
9. Stock facts ONLY from tool results. Never invent owners/history/price/mileage. Reserved/sold vehicles: say it's reserved, offer up to 2 similar available cars.
10. Handoff (mode=human): complaints, legal, finance approvals, customer asks for a human, or owner command.

Opening move for an email lead with a mobile number: WhatsApp template `enquiry_followup` {first_name, vehicle}: "Hi {1}, thanks for enquiring about the {2}. It's still available. Would you like any more details, or to arrange a viewing or test drive?" Email reply is also sent so the customer isn't left cold if WhatsApp fails.

## Ask-Steve loop (required before any viewing is confirmed)
The agent must NOT confirm a viewing/test-drive time on its own. When a customer proposes or agrees a time, the brain calls `ask_owner` → BrainResult.askOwner. Router: sets `pendingQuestion`, ALWAYS sends a holding line immediately ("Would you mind bearing with me a moment? Let me find that out for you") — the router injects it if the brain returns an empty reply, sends owner alert kind 'question': "#12 ASK: Barry wants to view the Focus ST Saturday 10am. Are we around? Reply `ANSWER 12 <text>`". Steve replies `ANSWER 12 yes, tell him to ask for me` (a plain non-command owner reply while exactly one question is pending counts as the ANSWER) → router stores `ownerAnswer`, clears `pendingQuestion`, runs the brain with the answer injected so the agent relays it naturally, then `book_viewing`. When confirming the time, Dave always reminds the customer to call before they leave so the car is pulled out front and ready. Same tool for anything the agent can't answer from stock/FAQs (part-ex valuations, damage/Cat S, "would you take £X", CarPlay etc.) instead of guessing.

## Instructing Dave (Steve, 26 Aug)
At any point the owner can tell Dave what to communicate — in the notification bell rewrite box, in the Agent Inbox ("Tell Dave what to say"), or on WhatsApp `TELL <n> <text>` — and Dave rephrases it in his own voice and carries on the qualification flow. Same mechanism as ANSWER (ownerAnswer injection) but does not require a pending question. Instructions show in the thread as a grey "You told Dave: …" line and are never fed to the model as customer turns. A rewrite while a draft is held comes back as a new draft to approve, not as a send.

## Owner control (messages from ownerAlertNumber on WhatsApp are commands)
`TAKE OVER <n>` · `RESUME <n>` · `REPLY <n> <text>` (sent to customer as Steve, stays in human mode) · `ANSWER <n> <text>` (answers Dave's question) · `TELL <n> <text>` (instruct Dave; he rephrases) · `SEND <n>` (approve the drafted reply; aliases `APPROVE <n>`, `OK <n>`) · `STATUS` · `PAUSE ALL` · `RESUME ALL` · `STOCK` (re-index now). Unknown text → help message.

## Draft & Approve (Steve, 26 Aug)
Dave never sends a customer-facing reply on his own while `settings.emailApprovalMode` is on (the default; undefined counts as on). Instead of queuing, the router stores `conversation.pendingDraft` (wording + the customer text he is answering) and alerts the owner with kind 'draft': `#14 Dave drafted reply to Barry (Ford Focus ST-3): "..." Reply: SEND 14 to approve, TELL 14 <changes>, or TAKE OVER 14`. A tap on that alert opens the **notification bell**, not a page change: approve, edit the box and send, or tell Dave how it should sound so he writes a fresh draft. `SEND 14` / Approve sends immediately **during office hours** and clears the draft; after hours it joins the outbox until the next opening (default 08:00–17:00 Europe/London, Mon–Sat, `settings.sendHours`). `TELL 14 <changes>` runs the usual instruction path and the rewrite comes back as a new draft rather than going out; `TAKE OVER 14` throws it away. A bare owner reply counts as `TELL` when exactly one conversation has a draft and none has a pending question. The same holds for the ANSWER path. In the app, the Agent Inbox has the same box over `salesAgentApproveDraft` / `salesAgentDiscardDraft`. WhatsApp uses the same hold once that channel is sending. Owner "send as me" still goes out immediately.

## Visibility
Steve sees everything three ways: Agent Inbox in the app (live), WhatsApp alerts (new / escalation / question / booking), and Gmail (agent replies sent from radlettcars@gmail.com sit in Sent). Email lead with a mobile → BOTH a polite email reply AND the WhatsApp `enquiry_followup` template; conversation continues on WhatsApp. Lead-email parsing rules: `EMAIL_FORMATS.md`.

## Security
- Tokens in top-level `salesAgentPrivate/{cid}` (default-denied in rules; functions use admin SDK). NOT under companies/ — members can read that whole subtree and functions secrets. Existing `crmSettings.twilio*/whatsapp*` are read as a fallback only.
- Webhooks verify: Meta `X-Hub-Signature-256` (appSecret) and verify token; Twilio request signature; Gmail push = Pub/Sub trigger (no public endpoint).
- Gemini key is a functions secret, never in the client bundle.

## Deployment notes
- functions are Node 20 (EOL). Upgrade to firebase-functions v6 + firebase-admin v13 + Node 22 is a required separate job. New code uses the v1 API via `import * as functions from 'firebase-functions/v1'` (works on v4 today via `firebase-functions/v1` too).
- Deploy by name only: `firebase deploy --only functions:salesAgentWhatsAppWebhook,functions:...`
- Manual setup Steve must do (wizard to follow): Meta Business Manager + Coexistence link, WhatsApp template approval, Twilio number + webhook URL, Google OAuth client for Gmail + Pub/Sub topic `gmail-sales-agent`, secrets.
