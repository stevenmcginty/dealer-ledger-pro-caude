# Inbound lead email formats (sampled from radlettcars@gmail.com, 19–26 Aug 2026)

Every lead email must be normalised into a `ParsedLead` before it hits the router:

```ts
interface ParsedLead {
  source: 'CarGurus' | 'Cazoo' | 'Website' | 'eBay' | 'AutoTrader' | 'Direct' | 'Other';
  kind: 'enquiry' | 'phone_lead' | 'missed_call' | 'reservation' | 'reservation_request' | 'ignore';
  name?: string; firstName?: string; email?: string; phone?: string; postcode?: string;
  vehicle?: { title?: string; reg?: string; price?: number; stockId?: string; url?: string };
  message: string;                // what the customer actually said (may be empty -> treat as "is it still available?")
  enquiryType?: string;           // Cazoo: Question | Test drive | Urgent ...
  flags?: { testDrive?: boolean; wantsServiceHistory?: boolean; wantsMorePhotos?: boolean; wantsVideo?: boolean; partEx?: string };
  preferredContact?: 'email' | 'phone' | 'whatsapp';
  replyTo: { channel: 'email' | 'whatsapp' | 'sms'; address: string };  // NEVER the platform's noreply address
}
```

Detection is by `From:` address first, then subject.

## 1. CarGurus — "Lead submission from CarGurus"
From `dealer-leads@messages.cargurus.com`. Multiple leads can land in ONE Gmail thread (same subject) — parse per message, not per thread. Markdown-ish plaintext:
```
### You have a new customer lead for your 2001 Porsche Boxster 3.2 S 2dr Tiptronic S ###
*Name:* paul summerfield
*Email:* pauljsummerfield@hotmail.com
*Phone number:* 07471 075500
*Postcode:* N3 1PS
*Customer comments:* I'm interested in this 2001 Porsche Boxster and I'd like to know if it's still available. I prefer to be contacted by: Email I prefer to be contacted by: Email (CarGurus deal rating: N/A / Is from deliverable listing: No)
| Reg: BC02YDG Reg. date: 01 Jul 2002 Vehicle: 2001 Porsche Boxster 3.2 S 2dr Tiptronic S Stock number: 1924223 Listing price: £10,995 ...
```
- `Stock number` = the Car Dealer 5 listing id → matches `StockItem.id` directly. `Reg:` also present.
- Strip the trailing "I prefer to be contacted by: X ... (CarGurus deal rating ...)" from comments; set preferredContact from it.
- Reply to the customer's email/phone. Never reply to dealer-leads@.

## 2. CarGurus — "Phone Lead from CarGurus"
Same sender. Plaintext: `Phone: 07712 000229`, `Duration: 1 minutes, 15 seconds`. No vehicle, no name. kind='phone_lead'. Action: if the phone is unknown, open a WhatsApp template `missed_call_followup` ("Hi, thanks for calling Radlett Car Sales earlier. Which car were you calling about? Happy to help with any questions or book a viewing.") — ask Steve first via ask_owner? No: auto-send only if duration < 30s or Steve's setting `followUpPhoneLeads` is on; otherwise log lead + alert only.

## 3. Cazoo (Motors.co.uk) — "Enquiry - <Make Model> <REG> - <FirstName>"
From `dealerleads@info.cazoo.co.uk`. Often sent 2–3 times within seconds (dedupe on `CorrelationID:` line, fallback subject+minute). Plaintext:
```
New sales lead
Vauxhall Astra GTC
BV17OSY Listed at £4,995
           Question            <- enquiry type (Question | Test drive | Urgent | ...)
Call Sam ( tel:07840143700 )   <- tel may be EMPTY "( tel: )"
Email Sam ( sam_18cobb@hotmail.co.uk )
Customer message
Hi, is this still available? I'm interested! Thanks
Would you take a px with cash back? ...
The buyer wants to know if the vehicle has any damages.   <- Cazoo-injected canned lines; keep but mark
Enquiry type
           Question
Customer details
Sam Cobb
 ( tel: )
sam_18cobb@hotmail.co.uk
View vehicle advert ( https://www.cazoo.co.uk/car-78833512/... )
```
- Customer message may be EMPTY (Test drive type) → treat as "wants a test drive of <vehicle>".
- Reg is in the subject → match stock by reg.

## 4. "Reservation request from Cazoo" — SPAM/PHISHING (Steve, 26 Aug)
Sent from a random personal address (finlay.douglas@gmx.co.uk) with a "View Reservation Request" link to a non-Cazoo domain, no vehicle, and a customer name that doesn't match the sender. kind='ignore' + record under salesAgent/ignored. General spam rule: a lead email whose only call-to-action is "log in to the platform" / a link on a domain that isn't cargurus.com, cazoo.co.uk, motors.co.uk, cardealer5.co.uk, ebay.co.uk, autotrader.co.uk, radlettcarsales.com, and which carries no plain customer email/phone, is spam → ignore, alert nobody.

## Core reply rule
The agent NEVER follows platform links or logs in anywhere. It replies only to a real customer contact found in the email: (a) the sender, if a personal address (not noreply/dealer-leads/platform), or (b) an email address in the body, or (c) a phone number in the body → WhatsApp (SMS fallback). If both email and phone are found, do both (email reply + WhatsApp opener). If none → alert Steve, no reply.

## 5. Cazoo/Gumtree missed call — "You just missed a lead"
From `noreply@partners.gumtree.com`. `You can reach the customer on 077 9350 5141.` / `Call back +447793505141`. kind='missed_call', phone only. Same handling as CarGurus phone lead.

## 6. Own website (Car Dealer 5) — "Enquiry - BMW Z4 (EA59ODK) - Simon"
From `noreply@cardealer5.co.uk`. HTML ONLY (plaintext is "use an HTML viewer"). Parse with cheerio:
- vehicle link `a[href*="/cars/"]` → url, stockId = last path segment (1546657); `h2` title, `h3` price.
- `table.personal-info` rows: Name / Phone (`a[href^=tel:]`) / Email (`a[href^=mailto:]`) / Message / GDPR Contact ("Email, Phone").
- reg from subject `(EA59ODK)`.
Also from cardealer5: "Vehicle Reservation Successful - Radlett Cars" (cc radlettcars, To customer) → kind='reservation' (£99 paid): alert Steve, agent sends a warm confirmation + asks for viewing time. "Payment Failed - Reservation #" → alert Steve only.

## 7. Direct customer email (no platform)
Plain email from a person, subject like "Porsche" / "Peugeot rcz". Body is the message; name from From header; phone via extractUkMobiles; vehicle by fuzzy match of subject+body against stock titles. Quoted replies ("On ... wrote:", "From: ... Sent: ...", "Sent from Outlook") must be stripped.

## Ignore list (never create a lead)
CarGurus `Lead Intelligence:` / `marketing@` / `marketing-info@`; cardealer5 `sales@` newsletters; jigsawfinance payouts; bca.com; partsinmotion; facebookmail; dealerforecourt; totalcarcheck forwards; anything from radlettcars@gmail.com itself; threads Steve has already replied to within 2 minutes.

## eBay / AutoTrader
No lead emails in the last 30 days (eBay listing goes via the CD5 feed; enquiries arrive as eBay messages, not email). Leave a stub parser keyed on `ebay.co.uk` / `autotrader.co.uk` senders that falls through to the generic parser and flags source.

## Steve's real reply style (use as few-shot examples for email tone)
- "Hi Harriet, Thank you for your email. Yes the Porsche is still available. Would you like to arrange a viewing. Regards, Steven McGinty www.radlettcarsales.com Tel: 07710525694"
- "Hello Paul, Thank you for your enquiry. Yes the Boxster is available, it just came into stock yesterday. If you need any further information or would like to book an appointment to view the car, please..."
- "Hello Nigel, Thank you for the information regarding your A5. I think as a part exchange I would be able to offer around £9000 for it." (part-ex valuations are Steve-only → ask_owner)
Note the office is sometimes covered by Chris; the agent signs as the dealership, not a person, unless settings.signature says otherwise.
