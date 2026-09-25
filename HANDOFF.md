# Handoff

## 25 Sep 2026 — bell, Agent Inbox and Dave refactor

Steve's ask: the bell was swamped with old emails; MOTs first; emails only in the Agent Inbox; new look and feel for the inbox; better Dave replies.

### Done (built, tests green, NOT committed, NOT deployed)
- Bell (`components/nav/NotificationBell.tsx`, `LedgerCore.tsx`, `types.ts`): MOTs first (stock dates merged with the DVSA sweep, overdue first, 60-day window with a "show later" toggle); no emails at all; Dave drafts/questions are one row that opens the inbox; WhatsApp only unseen or last 48h, max 8. "Seen" is written when the bell closes.
- Push hook (`hooks/useAgentPushMessages.ts`): no email toasts; a Dave draft/question arriving while the app is open is a toast with "Review" — nothing switches page until Steve taps.
- Agent Inbox (`components/salesAgent/AgentInboxPage.tsx` + new `components/salesAgent/inbox/*`, `utils/agentInboxSections.ts`, test `tests/agentInboxSections.test.ts`): sections Needs you / Recent / Earlier (folded, 14+ days quiet); Dave's draft card above the composer; inline question answers; composer shows channel and number.
- Dave (`functions/src/salesAgent/brain/prompt.ts`): tighter prompt, answer first, short, UK tone, no filler; all business rules kept. WhatsApp held to 3 sentences to match `capReply`.

### Checks
- `npm run build` OK, `npm test` 154/154, `cd functions && npx tsc --noEmit` OK, brain tests 13/13.
- Inbox viewed in demo mode at 390px and 1440px. The bell's MOT / Dave / WhatsApp sections were NOT seen with real data yet.

### Next
- Steve to look at the bell with live data.
- Commit only the files above (other sessions share this repo; `functions/lib/**` and `.firebase/**` changes are not ours).
- Deploy hosting for the bell/inbox; deploy the functions for the Dave prompt.
- `docs/sales-agent/SPEC.md` is out of date with the prompt and contradicts itself on viewings (rule 3 vs rule 8).
