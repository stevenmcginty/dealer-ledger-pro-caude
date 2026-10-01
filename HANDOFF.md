# Handoff

## 1 Oct 2026 (evening) — Accountant hub overhaul, new date picker, receipt thumbnails (LIVE, NOT committed)

Steve's ask: the accountant could not see the date pickers. He wanted a Last Quarter button. The Accountant hub should be a one-stop shop fed by the Expenses work (P&L, margin, VAT, every expense with VAT, ledger, corporation tax). He also wanted receipt thumbnails, and the Canvas (Gemini) tab removed.

### Done (hosting deployed 1 Oct ~18:40; working tree only, nothing committed)
- Date field: `components/common/UkDateInput.tsx` was rewritten, with the same props. It has a clear brand calendar button, a dark `CalendarPopover.tsx` (Monday first, month/year jump), and accepts typed dates (`utils/ukDate.ts`; 2-digit years up to 10 years ahead mean 20xx, older ones 19xx). Every date field in the app changes with it, and Forge can now type into it.
- Presets: `utils/datePresets.ts` + `components/accountant/DatePresetButtons.tsx`.
- Accounting core `utils/accounting/` (categories, profitAndLoss, expenseRows, corporationTax, yearEnd), with 46 tests in `tests/accounting/`.
  - The old P&L counted only the last sale (`reduce` dropped the accumulator), counted sale money as negative expenses, and counted HMRC, drawings and loans as expenses. All fixed.
  - Basis is accruals. Sales count by invoice date. Receipts count by receipt date. Unlinked reconciled bank lines count by bank date. Non-trading lines are shown as "Not in P&L".
- Corporation tax estimate: 19% / 25% with 3/200 marginal relief, split by financial year and associated companies. Adjustments (add-backs, capital allowances, stock write-downs, losses b/f) are saved at `businessDetails/yearEndAdjustments`. Settings has a year end (default 31 March; Steve files accounts by 31 Dec) and associated companies (0; Radlett Cars UK is Chris's company).
- Hub (`pages/AccountantPage.tsx`) has one shared period bar and these tabs: Overview (headline numbers + data health), P&L, Vehicle Margin, VAT Summary, Expenses & VAT, Ledger, Corporation Tax. The VAT maths was moved into `computeVatSummary()` unchanged. Sidebar Ledger and VAT Summary still work.
- Receipt thumbnails + pop-up viewer: `components/common/ReceiptThumb.tsx`, `ReceiptViewer.tsx`. They show in the Bank/Card rows, All Receipts, Payables and Expenses & VAT. The CSP `frame-src` gained Firebase Storage (for PDFs).
- Expenses search box no longer collapses. Canvas was removed from `components/nav/DesktopNav.tsx` and `MobileNav.tsx`; the page and data are kept.
- Checks: `npm test` 233/233, `npm run build` OK.

### Real Q3 2026 P&L (read-only check)
Revenue £182,187.34, cost of sales £116,887.40, gross profit £65,299.94, overheads £44,370.13, net profit £20,929.81.

### Next / to check
- Steve: a £4,943 'Refund' is counted as other income (it may be a BCA car refund). £11,526 of sale-or-return payouts went out in Q3, but no SOR car sale is in Q3.
- 'Car Sale' bank lines with a VAT amount would be counted as extra output VAT in the VAT Summary. No live line has one today; not fixed.
- Clean-ups: give `expenseRows.ts` a proper option to include unreconciled lines (E patched around it). `AccountantReport.tsx` and `VatTransactionsReport.tsx` are now unused.
- Not committed (concurrent sessions). Commit when Steve says so.

## 1 Oct 2026 — Q3 2026 bank reconcile + VAT run (new skill `radlett-vat-quarter`)

- Allica Q3 statement (254 lines) uploaded to Expenses → **Bank Account** (not the empty "ALLICA" tab). 221 reconciled through the UI; 33 left = eBay/Amazon/Prime only (Steve does those; invoice chase is a later skill step).
- VAT Summary Q3: output £10,527.83 (margin £8,845.43 + other £1,682.40), input £3,680.64, **net £6,847.19** (after adding the Boxster DD07 BOX sale invoice #14129, dated 17 Sep; £100 shows owed — bank has £9,400 of £9,500). Purchase-date typos fixed (DD07 BOX 2006→2026, EX66 SZW 2016→2026). PDF: `C:\Users\steve\Desktop\radlett-vat\2026-Q3\`.
- Fixed a double count I made: Aug/Sep rent from Radlett Cars UK booked at 20% while misc invoices already carry the VAT → re-booked at 0%. July has no misc invoice, so its bank line keeps 20%.
- Skill: `~/.claude/skills/radlett-vat-quarter/` (SKILL.md, payee-rules.md, scripts/ledger_snapshot.py). UI map + logs: `C:\Users\steve\Desktop\radlett-vat\`.
- **Fixed + deployed (hosting, 1 Oct; commit 224d57c, not pushed):** stray-brace link keys (`services/dataService.ts`), safer upload auto-match (`utils/statementAutoMatch.ts` + `tests/statementAutoMatch.test.ts`), clickable rows in `TransactionAllocatorModal.tsx` / `IncomeAllocatorModal.tsx`; dry-run data tool `scripts/fix-brace-keys.mjs`. 165/165 tests, build OK. Brace-key data cleaned in both ledgers (Steve 128 paths, Chris 234 paths; backups in that session's scratchpad). 5 receipts in Steve's ledger keep a harmless conflicting `reconciledByTxId}`.
- Next (option B, agreed for later): payee rules on upload, tick off already-paid sales, Commission/Refund/Misc Income for money in, auto-link rent invoice to its bank line, upload popup "undefined", rename "Bank Account" → Allica, odd-date receipt flags, make `UkDateInput` typeable (hidden opacity-0 date input blocks automation/keyboard), flag Deposit-Paid cars that are fully paid; Add Vehicle: PDF invoice scan always fails (compresses every file as an image), scan misreads dates, open form resets when stock changes, no supplier field.
- **Q3 2026 bank reconcile COMPLETE (1 Oct, evening):** Allica Bank Account has 0 open Q3 lines. eBay: 17 orders + 4 eBay charges booked (7 with invoices; 10 business-seller orders booked Repairs 20% without invoice per Steve - sellers messaged 1 Oct, no email address in eBay messages). Amazon: 12 VAT invoices captured (screenshot of the PDF viewer at #zoom=55 in a fresh Forge tab) and booked as receipts; Prime Video 'gaia' = Personal 0%. Coupon rule: VAT on what was paid. **VAT Summary Q3: output £10,527.83, input £3,899.80, due £6,628.03** (PDF `radlett-vat\2026-Q3\VAT-Summary-2026-Q3-FINAL.pdf`). 10 receipt dates the AI scan got wrong were fixed in RTDB with Steve's OK (date field only; backup in session scratchpad `date-fix-backup.json`). Forge cannot type in date inputs; app bug: receipt scan swaps day/month on dd.mm.yyyy invoices. Next: check eBay messages + Gmail u/2 for seller invoices and attach them. Worksheets `radlett-vat\2026-Q3\ebay-chase.md` / `amazon-chase.md`; skill files `ebay-invoice-chase.md`, `amazon-invoices.md`.
- 7 BCA cars added to stock from their invoices (#5022–#5028: CF65 HCP, DS66 ZCT, FG66 WVU, YL16 WKA, SV66 OAS, WN10 GEK, HF19 JPX) and their Q3 bank payments linked (verified in RTDB). PDFs in `C:\Users\steve\Desktop\radlett-vat\2026-Q3\bca-invoices\`.
- App bugs found originally: stray `}` in field names in `services/dataService.ts` (`linkedVehicleId}`, `purchaseTransactionId}`, `reconciledByTxId}`, `linkedTransactionId}`) so links save under the wrong key; upload auto-match ignores supplier and can reuse one receipt; Match/Advanced rows are divs (not clickable by automation/keyboard); fully paid docs hidden from income matching; upload popup shows "undefined"; VAT Summary excludes "Vehicle Sale" but not "Car Sale" income lines.

## 25 Sep 2026 (later) — Gmail 7-day token cut fixed for good + backlog caught up

- OAuth app published to **In production** (Google Auth Platform → Audience). Branding was the blocker: added home page `https://motor-ledger-pro.web.app` and privacy `…/privacy.html`. No more 7-day refresh-token death.
- Reconnected radlettcars@gmail.com via Settings → Sales agent (browser session, 2SV phone prompt). Token saved; watch live (daily renewal 04:00).
- The OAuth callback "upstream request timeout" page was cosmetic: its catch-up ingested the full 13–25 Sep backlog before the 113 s timeout (21 conversations + 96 ignored, newest reached 11:36 on the day). `emailApprovalMode: true` so nothing was sent.
- Restarted the watch manually: `gcloud pubsub topics publish firebase-schedule-salesAgentGmailRenewWatch-us-central1 --message "{}"`.
- No code changed. Nothing committed.

## 25 Sep 2026 — bell, Agent Inbox and Dave refactor

Steve's ask: the bell was swamped with old emails; MOTs first; emails only in the Agent Inbox; new look and feel for the inbox; better Dave replies.

### Done (commit 8e0bbc2, pushed; hosting + 19 Dave functions deployed 25 Sep)
- Bell (`components/nav/NotificationBell.tsx`, `LedgerCore.tsx`, `types.ts`): MOTs first (stock dates merged with the DVSA sweep, overdue first, 60-day window with a "show later" toggle); no emails at all; Dave drafts/questions are one row that opens the inbox; WhatsApp only unseen or last 48h, max 8. "Seen" is written when the bell closes.
- Push hook (`hooks/useAgentPushMessages.ts`): no email toasts; a Dave draft/question arriving while the app is open is a toast with "Review" — nothing switches page until Steve taps.
- Agent Inbox (`components/salesAgent/AgentInboxPage.tsx` + new `components/salesAgent/inbox/*`, `utils/agentInboxSections.ts`, test `tests/agentInboxSections.test.ts`): sections Needs you / Recent / Earlier (folded, 14+ days quiet); Dave's draft card above the composer; inline question answers; composer shows channel and number.
- Dave (`functions/src/salesAgent/brain/prompt.ts`): tighter prompt, answer first, short, UK tone, no filler; all business rules kept. WhatsApp held to 3 sentences to match `capReply`.

### Checks
- `npm run build` OK, `npm test` 154/154, `cd functions && npx tsc --noEmit` OK, brain tests 13/13.
- Inbox viewed in demo mode at 390px and 1440px. The bell's MOT / Dave / WhatsApp sections were NOT seen with real data yet.

### Next
- Steve to look at the bell with live data.
- Watch Dave's first few live replies; old prompt is in git (`git show 0ec3e66:functions/src/salesAgent/brain/prompt.ts`).
- `functions/lib/**` and `.firebase/**` were already modified before this work; left uncommitted.
- `docs/sales-agent/SPEC.md` is out of date with the prompt and contradicts itself on viewings (rule 3 vs rule 8).

## 25 Sep 2026 — BCA purchase mail (was showing a Lexus for a Peugeot)
- Cause: BCA invoice mail (donotreply@bca-group.com) slipped past the `@bca.com` ignore, the body's bcabuyersupport@bca.com became the "customer", every invoice piled onto one thread (#60) pinned to an old Lexus, and Dave drafted replies to BCA.
- Now: BCA mail with a reg or invoice/purchase/collection in the title is `kind: 'supplier'` (`leadParsers.ts`). No Dave, no draft, one alert "BCA: <title> — <car>". Car comes from the title reg, else from the attached invoice PDF (`pdf-parse`, `bcaInvoiceVehicle`), named from stock (exact reg) or the MOT API. BCA newsletters stay ignored.
- Replay job accepts `anyLabel: true` for archived mail. Shared inbox dedupe lives at `salesAgentRouting/sharedInboxes/<id>/seenProviderIds`.
- Data: #117 = Peugeot RCZ BJ64JBU invoice; #116 = Skoda Octavia SV66OAS collection; #60 old BCA thread cleaned (no car, no draft).
- Gmail functions deployed. 40/40 parser tests pass. Not committed.
