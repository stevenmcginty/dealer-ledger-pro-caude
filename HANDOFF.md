# Handoff

## 8 Oct 2026 — Invoice/deposit slip small print + website warranty page in line with UK law, plus optional terms page 2 (LIVE, not committed)

Steve's ask: make sure the invoice/deposit slip small print covers him (warranty, CRA, distance selling, FCA) and matches radlettcarsales.com.

- Found: invoice terms linked to a broken address (`HTTTP://RADLETTCARSALES,COM/WARRANTY`) and said the customer always returns the car on a CRA claim. Website said "14 days to return" for distance sales, made an independent inspection a condition of CRA rights, and had no "statutory rights not affected" line for the warranty (CRA s.30(4)(b)).
- Law checked on legislation.gov.uk (CRA 2015 ss.19-24, 30, 31; CCR 2013 regs 5, 10, 19, 27-35, Sch 2). Key points: s.20(8) customer only pays return if they collected from the premises; off-premises (doorstep) contracts have the same 14-day cancel right as distance ones, reg 19 makes it an offence not to give the cancel info on paper, and reg 35(1)(b) makes the trader collect a car delivered to the home when the deal was done there. Payment does not decide distance vs not; where/how the deal was agreed does.
- DLP: `companies/-OXmKH0D2CB0JFIi3cEi/businessDetails/invoiceTerms` rewritten (867 chars; prints on invoices AND deposit slips); `companyNumber` 8348026 -> 08348026. Backup of old businessDetails: session scratchpad `bd_backup_before_terms.json`. Longer draft rejected because it overflowed the one-page PDF.
- Website: Car Dealer 5 > Tools > Pages > warranty.php (PageID 43682), Content is raw HTML. New sections: statutory rights, distance/doorstep right to cancel, guarantor name+address; "RCL" typo fixed. Old HTML saved in scratchpad `web/warranty_cms_original.html`. Checked live.
- Website rewritten again on Steve's ask (clean + precise): who gets the warranty (under 10 yrs AND £2,000+, else sold without it), customer pays diagnosis on warranty claims except CRA faults, statutory rights as a separate section (satisfactory quality depends on age/mileage/price; wear and tear not a fault; faults disclosed or that their own inspection ought to show are excluded, CRA s.9(4)), return by transporter about £1.50/mile (Steve's figure). Saved in scratchpad `web/warranty_cms_v2.html`.
- Invoice blurb now also says "transporter about £1.50 per mile".
- NEW (LIVE, hosting deployed 8 Oct, NOT committed): optional page 2 on Sales Invoice / Proforma / Deposit Slip. "Add terms page" tick box in the invoice viewer header, unticked every time (Steve: page 2 must not print by default). Ticked = page 2 on screen, print, Download PDF and Send to customer. Page 2 = `businessDetails.termsPage` text + CCR Sch 3 model cancellation form (if `cancellationForm`), prefilled with car + customer. Settings > Business Details has both fields. Files: `types.ts`, `components/settings/BusinessDetailsPage.tsx`, `components/sales/PrintableView.tsx`, `components/sales/printablePdf.ts`, `utils/pdf.ts`, new `utils/salesTermsPage.ts`, new `tests/salesTermsPage.test.ts`. 331/331 tests, build OK. Seen live in a 2-page PDF (#58934). Steve's ledger has termsPage + cancellationForm=true set; Chris's ledger has neither, so no tick box there.
- Known layout bug (old): on invoices with 2+ payments and 3+ note lines, page 1 notes run under the Payment Details block (absolute footer on a fixed A4 page).
- Commit when Steve says so.

## 7 Oct 2026 — SA63 YPM MINI Roadster (#500) sold to Sophia Vidal + Q3 VAT adjustment (data fix, no code change)

- Steve: sold for £4,250 (first said £4,000, then corrected), paid in full by bank transfer; date it 10 May 2026. Margin VAT was never paid (Q2 filed).
- Added Sales Invoice #44580 (`salesDocuments/-P3LDVAVXui_OfC8EeO9`), 10 May 2026, 70 Pentland Close, Edmonton, London N9 0XN, balance 0, VAT £309.37 ((4,250 − 2,393.80) ÷ 6). Car `-OXe5KwSN_6J8vLU8KHg` set to Sold.
- Payments on the invoice = the Allica lines "From RUSKIN SA, MUM" £2,000 (2 May 2026, `-Ovj1NwiSqJ4TkDNG5cF`) + £2,250 (3 May 2026, `-Ovj1NwiSqJ4TkDNG5cG`). The bank lines themselves were left as they were (category Car Sale, Q2 filed).
- VAT adjustment: Output £309.37 dated 30 Sep 2026 (Q3, not filed yet), same pattern as MT12 NBZ. Q3 VAT due goes up by £309.37. Backup + update files: session scratchpad `sa63\`.

## 7 Oct 2026 — Road tax on the car's Edit screen + filled for Steve's stock (LIVE, not committed)

Steve's ask: see each car's road tax in the car details; which stock car has the cheapest road tax.

- Found: the lookup works out road tax (`functions/src/vehicle/ved.ts`) and saves `annualRoadTax`, but no screen showed the saved figure. `DVLA_VES_API_KEY` is empty in `functions/.env`, so lookups and the 6am sweep get no CO2 or tax status; pre-April-2017 cars can't be priced from a lookup.
- Code: `components/stock/VehicleEditor.tsx` — read-only "Road Tax" cell next to MOT Due Date (£/year, CO2, tax status + due). 313/313 tests, build OK, hosting deployed 7 Oct ~11:26.
- Data: CO2, tax status and tax due read from the GOV.UK vehicle check page (vehicleenquiry.service.gov.uk) for 29 unsold cars in `-OXmKH0D2CB0JFIi3cEi`; wrote `co2Emissions`, `annualRoadTax` (2026/27 table), `taxStatus`, `taxDueDate`. Skipped: S29CAG (DVLA says Ford 2020, ledger says Fiat 500 2026), ALFA and CR2DZ0/U125CR (no valid reg). No `annualRoadTax` on BL71 OGO and VK71 BJZ (£200 or £640 depending on list price).
- Cheapest: YH65 EMJ Mercedes CLA 220d £20/yr; next tier £200 (11 cars).
- Open: tax status will go stale and new pre-2017 cars get no road tax until a DVLA VES key is added.

## 7 Oct 2026 — Agent Inbox unread is now per person (LIVE, not committed)

Steve's ask: when Steve reads a WhatsApp, it stopped looking unread for Chris (and the other way round). Each of them must keep their own unread until they open it.

- Cause: one shared `unread` counter per conversation; opening a thread set it to 0 for everyone. OS notifications were already per device (only the opening device closes its own).
- Server (`functions/src/salesAgent/router.ts`, `types.ts`): every inbound also bumps `inboundCount` (only goes up, never reset). Legacy `unread` still written.
- Client: `markConversationRead(companyId, convId, uid, inboundCount)` writes only `readBy/<uid> = {count, at}`. `unreadFor(conv, uid)` in `utils/agentInboxGroups.ts` drives every badge (thread list, WhatsApp button, inbox button, app badge). Threads with no inbound since the change fall back to the old `unread` unless this person read after `lastInboundAt`. A message that lands while the thread is open and visible is marked read for that person only.
- Replying does not clear it for the other person (Steve: stays until both have opened it).
- Tests: root 313/313, functions 230/230, builds OK. Deployed 7 Oct: all 30 sales-agent functions by name + hosting. No rules change.
- Commit when Steve says so (files: router.ts, types.ts, functions/lib router.js/maps, salesAgentService.ts, agentInboxGroups.ts, AgentInboxButton.tsx, WhatsAppButton.tsx, AgentInboxPage.tsx, tests/agentInboxGroups.test.ts).

## 6 Oct 2026 — MINI Paceman SW65 FBK added to Steve's stock (no code change)

- #5032, BCA WB/757, 26 Jun 2026, £3,415, Margin, vehicle `-P3HIBq_-rmyIcNrr4o-`. Invoice PNG on the car. June bank line `-Ox_vgBp2CquEcRiX5xu` linked (Vehicle Purchase; VAT 0, unchanged).
- Why it was missing: June (Q2) purchase. The server never adds BCA cars (Steve's rule) and the Q3 run only checked Jul–Sep payments.
- Also added: #5033 AP67 LCA Abarth 595, BCA BB/3579968, 30 Apr 2026, £5,193, Margin (Steve: still owned). MOT data from gov.uk (to 20 Sep 2027). May bank line `-Ovj1NwiSqJ4TkDNG5cI` linked, VAT unchanged. Log: `C:\Users\steve\Desktop\radlett-vat\2026-Q2\bca-invoices\stock-log.md`.
- Every Steve BCA payment from Apr 2026 now has a car, except the X1 (qualifying, by design) and BV/1766882 (refunded).

## 5 Oct 2026 — VAT adjustments (late claims) in the VAT Summary + MT12 NBZ finalised (LIVE, commit 6ba5594, pushed)

- New: VAT Summary → "VAT adjustments". A dated Input (claim back) or Output (pay) amount counts in the quarter it is dated in: Box 1/4/5, the MTD sheet and the Accountant hub's VAT due. Stored at `businessDetails/vatAdjustments` (same pattern as yearEndAdjustments). Files: `types.ts`, `services/dataService.ts`, `contexts/DataContext.tsx`, `components/reporting/VatSummary.tsx` (`computeVatSummary` takes optional `vatAdjustments`), `pages/AccountantPage.tsx`, new `tests/accounting/vatSummary.test.ts`. 305/305 tests, tsc OK, build OK, hosting deployed 5 Oct. Seen live: the add form works and the figures update.
- Q3 2026 adjustments (both dated 30 Sep 2026): Input £1,844.57 (BMW X1 VK71 BJZ late claim, BCA MM/1162652) and Output £124.17 (MT12 NBZ margin VAT; its sale fell in filed Q1). **Q3 VAT due in the app is now ~£4,735.98** (it was £6,456.38). Q3 is not filed yet.
- MT12 NBZ (Corsa, #4969): Steve said it sold. Added Sales Invoice #92146 dated 7 Jan 2026 (Steve Marshall; deposit £150 + £1,595 card on 7 Jan, per Steve; £50 discount so price £1,745, balance 0) and set the car to Sold. Backup `bca\backup_mt12_vehicle.json` in the session scratchpad.
- Commit when Steve says so.

## 5 Oct 2026 — RK66 UBL (Jaguar F-Pace, #514) showed as for sale after its sale (data fix, no code change)

- Sales Invoice #57393 (25 Feb 2026, Shane Lawrence, £15,995, balance 0) was always there, and so were the bank lines (£900 card 19 Feb, £14,995 25 Feb, £100 card 2 Mar). Only the car's `status` was `Available`, not `Sold`. It is the only Sales Invoice in either ledger whose car is not Sold.
- Fixed: `vehicles/-OXe5LCliEl3q8GUHJqL/status` = Sold; `customerEmail` Exup1990@live.com added to the invoice. Backups: session scratchpad `bca\backup_rk66_*.json`.
- Cause not found. No status history is kept. `undoSale` would also have deleted the invoice. The car had a DVLA lookup on 6 Aug 2026 (mileage 71,800 and MOT 2027-05-22 are from after the sale).

## 5 Oct 2026 — 3 BCA cars added to Steve's stock (no code change)

- #5029 Peugeot RCZ BJ64 JBU (BW/1215852, £1,925, Margin), #5030 Jeep Grand Cherokee GU18 DYP (PWO/0174906, £9,485.80, Margin), #5031 BMW X1 VK71 BJZ (MM/1162652, 3 Jun 2026).
- The X1 is a **VAT-qualifying** car: its invoice charges £1,844.57 VAT. Steve chose Qualifying: in stock at the net £9,222.83, to be sold with 20% VAT on top. The £1,844.57 goes on the Q4 2026 return as a late claim. The June bank line was left unchanged (Q2 filed).
- Added by a backend push with the same fields as #5022, plus the invoice PNG in Storage. Colour/engine/MOT come from the invoice, not a DVLA lookup.
- Log + Q4 VAT to-dos: `C:\Users\steve\Desktop\radlett-vat\2026-Q4\bca-invoices\stock-log.md`. Ruling saved in the skill's `payee-rules.md`.

## 5 Oct 2026 — Agent Inbox: right car or no car, plus a car picker (LIVE, commit 1357f80, pushed)

Steve's ask: emails got the wrong reg/car. General emails got a car. Lead emails got a different reg. He wants an easy picker.

### Cause (read-only check of 127 real threads; 11 wrong, 14 should have had no car)
- `identityToken` counted any variant/model word ("limited", "model", "300", "first") or reg fragment as naming a car. A make alone ("bmw") was enough.
- `switchVehicleIfNamed` re-pinned threads from quoted text (HTML replies skipped quote stripping); a quoted year became a hard filter ("£500" moved a Boxster thread to the Fiat 500).
- cd5 lead forwarder `*@mg.cd5.uk` was taken as the customer: 29 leads merged into one thread (Chris's C18). CarDealer5 weekly report became a car "Last week at a glance". CarDealer5 "Cargurus Vehicle Enquiry" HTML was never read.
- Direct CarGurus leads were right. CarGurus stock number == stock index id (checked 28/28).

### Done (functions: all 30 sales-agent functions deployed by name; hosting deployed; 5 Oct)
- New strict matcher for routing only (`stock/search.ts`): full reg, or make + model, or a model alias; never variant words, numbers, years or colours. Ties = no car. Brain's `search_stock` ranking unchanged.
- `findReg` no longer uppercases free text. Switch only on a full reg or a clear make+model in the customer's own words, not in part-ex sentences.
- Parsers: CarDealer5 reports ignored; "Cargurus Vehicle Enquiry" parsed; cd5 forwarder parsed (each lead its own thread; part-ex `Registration:` is never the wanted car).
- New fields: `vehicleInterest.reg`, `carSetByOwner` (Steve's pick locks the car; router/brain/switch leave it).
- `salesAgentCorrectThread` takes `stockId | ledgerVehicleId (+vehicleCompanyId) | noCar | freeTitle | note`.
- Client: `components/salesAgent/inbox/CarPicker.tsx` + `utils/carPickerSearch.ts`. Tap the car line (or menu "Change car"), type reg/make/model; ledger cars + stock index; "No car"; "Use what I typed".
- 20 old threads fixed in RTDB (6 to the right car, 14 to No car). Backup + script: `%TEMP%\claude\...\scratchpad\carmatch\cleanup\` (`backup.json`, `apply.mjs`).
- Tests: functions 230/230 (`node --test "lib/salesAgent/**/*.test.js"`; a folder argument fails on Node 24), root 300/300, builds OK.
- Deploy tip: functions deploy timed out loading code ("Timeout after 10000"); `FUNCTIONS_DISCOVERY_TIMEOUT=120 firebase deploy ...` fixed it.

### Open
- Picker not yet seen in a browser.
- Still wrong, fix by hand with the picker: C18 (Chris, the old merged forwarder thread), S68 and C23 (the real car left the stock index), C16 (Fiat 500c promo).
- "CR-Z" with no make gets no car. Two live Boxsters + "Boxster" only = no car (by design).
- If Chris is logged in, a stock-index pick may not resolve (server looks in the credential company's index); ledger-car picks are fine.
- Commit when Steve says so.

## 5 Oct 2026 — more eBay invoices in (no code change)

- 4 Q3 invoices came in by email (easywaytosellmycar). Each one is uploaded as a receipt and auto-linked to its reconciled bank line: bikebuybike = KZO Trading Ltd (27-15000-28350), Trade Car Parts x2 (09-15013-76482, 01-15029-23408), The Gasket Shop / Harland (13-14989-83803). VAT unchanged.
- New order 13-15241-57962 (Hikari JDM, £18.95, 3 Oct): invoice request emailed 5 Oct 09:02.
- Still waiting: AP Parts (22-14995-93802), GetCarParts (09-15240-20481, chase again after 16 Oct). Mambatek: Steve 5 Oct says keep the 20% VAT (lines unchanged).
- App note: the receipt scan still sets some dates one day early (14 Aug read as 13 Aug, 10 Aug as 9 Aug). Fixed by hand.

## 2 Oct 2026 — eBay invoices now requested by email (no code change)

- New rule (Steve): for every eBay purchase, email the seller from easywaytosellmycar@gmail.com for a VAT invoice (the seller's email comes from the item page's "Seller contact information"). Claude uploads and links every invoice; Steve never does. The skill's run is now about once a month: reconcile, then sweep every invoice. Skill updated: `~/.claude/skills/radlett-vat-quarter/SKILL.md` + `ebay-invoice-chase.md`.
- Sent 2 Oct: 5 emails (4 sellers who asked for our email, plus new Q4 order 09-15240-20481). Logged in `radlett-vat\2026-Q3\ebay-chase.md` and `2026-Q4\ebay-chase.md`.
- Mambatek invoices (2) are uploaded and linked. They show 0% VAT, but the bank lines still claim 20% (£9.37). **Waiting on Steve.**
- Jaguar XF DS66 ZCT: already in stock (#5023, £6,874, invoice PH/6042 attached, bank line linked). Nothing changed. BCA invoice MM/1178613 (BD67 SFX F-Pace, £9,335.80) is not on Steve's bank lines and is probably Chris's. Not booked.

## 2 Oct 2026 — WhatsApp made prominent (LIVE, committed 87dc811 + pushed)

Also committed + deployed another session's functions work (83bbb92: BCA invoice PDF reg via pdf-parse, MOT-record car title, Gmail reprocess `anyLabel`). All 30 sales-agent functions redeployed by name 2 Oct; functions build OK, leadParsers 40/40, no errors in the logs after deploy.

Steve's ask: WhatsApp is only readable in DLP (email he sees in Gmail first), so a WhatsApp must be obvious when it pops up, and WhatsApps, newest first, must sit at the top.

### Done (hosting deployed 2 Oct ~09:01; 291 tests pass; client only, no functions change)
- Pop-up: `components/ui/Toast.tsx` WhatsApp variant is now a big green card at the TOP (top-right desktop, full-width phone), name + 3 lines + Reply / Later, stays until dismissed, max 3, same conversation replaces its own card. Distinct 3-note `playWhatsAppChime()` and a flashing tab title while the window is unfocused (`utils/inboxNotify.ts`).
- OS notification (`public/sw.js` cache v10, `services/pushService.ts`): customer WhatsApp shows as `💬 WhatsApp · <name>` with `requireInteraction` (stays on the Windows desktop until clicked).
- Header: new green `components/nav/WhatsAppButton.tsx` (unread WhatsApp count, pulses) before the inbox button; opens the inbox on the WhatsApp filter + newest unread thread (`requestInboxFilter` in `utils/agentInboxLink.ts`). Both header buttons share `hooks/useAgentInboxConversations.ts`.
- Bell: WhatsApp section first, newest first; badge goes green when unseen WhatsApp.
- Agent Inbox list: new top "WhatsApp" section (any WhatsApp activity in 14 days, newest first) above Needs you / Recent / Earlier (`utils/agentInboxSections.ts`); off on the Email filter. Desktop inbox now opens the top WhatsApp thread first.

### Not seen live yet
- Chime, title flash and OS notification need a real WhatsApp. The lit green header button was checked in code only (demo data has no unread WhatsApp).
- On a phone the company name in the header is cut shorter by the extra button.

## 1 Oct 2026 (night) — invoice sweep, receipt links, Lloyds/Allica split, director's salary (LIVE, NOT committed)

Steve's asks: get every supplier invoice (Logic rent, Google, Prime Video, then all missing ones) into the app; show every receipt on its reconciled bank line; split the two banks; book the Lloyds Q3 statement; never count money in twice; show the salary the company owes him.

### Done (hosting deployed several times; last ~20:00; 286 tests pass; nothing committed — shared tree)
- **Receipt links:** cause = old upload auto-match set receipts Paid with no `reconciledByTxId`. `scripts/link-receipts.mjs` (dry run / `--apply` / `--receipts`) linked 181+ receipts in Steve's ledger and 258 in Chris's (+35 by hand-checked pairing). Steve's ledger: 56 → ~300 linked. App now auto-links a new receipt to a reconciled line only when one-to-one (`utils/statementAutoMatch.ts` `findReconciledLineForReceipt`); automatic paths offer Unpaid receipts only; Match / Advanced also lists Paid-unlinked ones. `vatRate` now written with the VAT on match.
- **Invoices:** ~95 receipts added (Logic rent, Google One/Cloud/Klarna, Prime Video, Motors, CarGurus, Anthropic, OpenAI, Grok, Z.ai, Supabase, Shiply, Total Car Check, Bodicraft). Files + logs: `C:\Users\steve\Desktop\radlett-vat\invoice-sweep\`. Not found: Innov8 £136.79, Group Tyre £63.48, HKS £26.04, YouTube Premium £19.99, Curtis & Co (standing order, no invoices). May 2026 Logic invoice £4,075.96 vs paid £4,049.57 (unlinked).
- **Two banks:** "Bank Account" renamed **Lloyds** (428 lines to 31 Mar 2026), Allica lines (501, from 2 Apr 2026) moved to **Allica** (`scripts/split-bank-accounts.mjs`, backup `radlett-vat\bank-split\`). Upload dedupe now per account; "Transfer ↔ <bank>" suggestion ranked below real matches; no auto-booking of partners. Credit Card marked **closed** (hidden, still counted; Settings → Reopen).
- **Lloyds Q3** uploaded and booked (60/60). All 9 Lloyds→Allica moves are Transfer on both sides (checked in RTDB). Fixes: M6 Toll ×2 → 20%, easyJet £85.99 → Transport, McDonald's Berwick → 20%, OpenAI → 20%, Allica £5,000 Easy Way → Transfer (sale counted on Lloyds card line). Q3 input VAT now £4,071.45 (was £3,899.80); VAT due ≈ £6,456.38 by my count — re-check in the VAT Summary before filing.
- **Director's salary:** Business Details → Director's salary (`businessDetails/directorSalaries`, set to Steven McGinty £1,000/month from 2025-04-01 per payslips/P60s). Accountant hub accrues it, shows owed (£11,040 today; FY25-26 £10,040) and the 9-month deadline. `utils/accounting/directorSalary.ts`.
- Company = **Easywaytosellmycar Ltd T/A Radlett Cars**. Skill `radlett-vat-quarter` updated (invoices-first order, invoice-sweep.md, many payee rulings, no-double-count rule, salary check step).

### Next / open
- **App bug:** Undo on a bank line matched to a sales document does NOT remove the payment it added to that document. Seen on Simon Ellis invoice #67291 (£5,000 payment still points at the Allica line, now Transfer) and MY12 RCZ deposit slip #24661 (£6,245 still on it; invoice #91255 also has it). Balances show £0 owed either way; no VAT effect. Needs a code fix + those two payment records cleaned.
- 7 Aug £100 Lloyds card payment now matched to Boxster invoice #14129 (£0 owed).
- Lloyds Apr–Jun 2026 never uploaded (Q2 filed). Possible personal Amazon items booked as Repairs/Office in older quarters (list in `invoice-sweep\wave2-amazon-log.md`).
- Commit when Steve says so.

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

### Car Dealer 5 invoices (1 Oct, evening)
- 2026 invoices come from the dealer panel (dealers.cardealer5.co.uk/admin.php, vault `v_83802749753b`), not email. PDFs are in `C:\Users\steve\Desktop\radlett-vat\cardealer5-invoices\`. 8 bank lines (Jan–Mar, May–Sep 2026, £132 / £22 VAT) now have a linked receipt. VAT is unchanged.
- April 2026 invoice 99668 is marked Paid, but there is no April CD5 bank line in the ledger. Check the April Allica statement.
- App bug: Undo resets the bank line's `vatRate` to 0, and a re-match does not restore it (`vatAmount` is kept).
- Company = EASYWAYTOSELLMYCAR LTD (08348026) T/A Radlett Cars. Year end 31 March is confirmed on Companies House.

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
