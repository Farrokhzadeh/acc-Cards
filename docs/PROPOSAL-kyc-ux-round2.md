# Proposal — KYC / Admin UX round 2 (AWAITING APPROVAL — no code yet)

Status: **design only**. Nothing implemented until approved.

---

## 1) KYC pre-info + consent screen (before starting)

**Current:** invite message → tapping "Start verification" jumps straight to the first question (full name). No list of what's needed, no explicit consent.

**Proposed:** after the invite, show a "what you'll need" screen with a **Start KYC** button. Only on agree does the flow begin.

Example (English):
```
🪪 Identity verification (KYC)
To verify your identity, please have these ready:
• Full legal name (exactly as on your ID)
• Date of birth (Shamsi, e.g. 1374-02-03)
• Country of residence
• National ID / passport number
• Phone number (with country code, e.g. +98912…)
• A clear photo of your ID (passport or national card)

⏱ Takes about a minute. Your information is encrypted and used only for verification.

[ ✅ Start KYC ]     [ Cancel ]
```
Example (فارسی):
```
🪪 احراز هویت
برای احراز هویت این موارد را آماده داشته باشید:
• نام و نام خانوادگی (دقیقاً مانند مدرک)
• تاریخ تولد (شمسی، مثلاً ۱۳۷۴-۰۲-۰۳)
• کشور محل سکونت
• کد ملی / شماره گذرنامه
• شماره تلفن با کد کشور (مثلاً +98912…)
• عکس واضح از مدرک شناسایی (گذرنامه یا کارت ملی)

⏱ حدود یک دقیقه. اطلاعات شما رمزنگاری شده و فقط برای احراز استفاده می‌شود.

[ ✅ شروع احراز هویت ]     [ انصراف ]
```
`[Start KYC]` → begins step 1. `[Cancel]` → returns to menu.

---

## 2) Payment → wait for admin → admin "Notify user" button

**Current:** after payment/funding submission the user gets a generic "submitted, pending review". When the admin later assigns an account / issues a card, the user is **not** told.

**Proposed:**
- Bot (after payment/funding submit): explicit "please wait" line:
  - EN: `⏳ Payment received. Our team is reviewing it — please wait. We'll message you here as soon as your card is ready.`
  - FA: `⏳ پرداخت دریافت شد. تیم ما در حال بررسی است — لطفاً صبر کنید. به محض آماده شدن کارت، اینجا پیام می‌دهیم.`
- Admin: after **assigning an account** (Clients) or **issuing a card** (Requests), a **[ 🔔 Notify user ]** button appears on that row/sheet. Clicking sends (in the user's language):
  - EN: `✅ Your card is ready ••1234. Open the menu to start using it.`
  - FA: `✅ کارت شما آماده است ••1234. منو را باز کنید و استفاده را شروع کنید.`
  - …plus the main-menu keyboard.

---

## 3) Shamsi (Jalali) date of birth

**Current:** asks Gregorian `YYYY-MM-DD` with example `1995-04-23`; validation rejects Jalali.

**Proposed:**
- Prompt shows a **Shamsi example**: `Date of birth (Shamsi): e.g. 1374-02-03` / `تاریخ تولد (شمسی): مثلاً ۱۳۷۴-۰۲-۰۳`.
- **Accept Jalali** `YYYY-MM-DD` (year ~1250–1420), convert to Gregorian, store Gregorian in `date_of_birth`. Also accept Gregorian as a fallback.
- Admin KYC detail shows the stored date; optionally show both (Gregorian + Shamsi).
- Example: user enters `1374-02-03` (Jalali) → stored as `1995-04-23` (Gregorian).

---

## 4) Admin can see KYC info + the ID photo/file

**Current:** the KYC detail pane already lists all submitted fields and shows the document **inline for images** (or an "Open document" link for PDFs).

**Proposed enhancements (confirm + improve):**
- Detail pane: all fields + a **large document preview** + **[ Download ]** button; PDF opens in a new tab.
- List rows: add a small ** photo** indicator + status so you can see at a glance who attached a document.
- Verify both image and PDF render/download correctly for the reviewer.

---

## 5) Move KYC into the Requests tab

**Current:** standalone **KYC** nav item; Requests view has tabs `[New cards] [Funding]`.

**Proposed:**
- Remove the standalone **KYC** nav item.
- Requests view tabs become: `[New cards] [Funding] [KYC (n)]` where `n` = pending KYC count.
- The KYC tab hosts the existing queue (list + detail + approve/reject) unchanged in behavior.

---

## 6) Inbox shows the FULL user↔bot chat (not just support)

**Current:** only **support** messages are stored (`messages` table via the support relay). Normal bot conversation (KYC, menu, cards, funding) is **not logged**, so Inbox can't show it.

**Proposed:**
- Log **every** bot exchange (user inbound + bot outbound) with a category: `support | kyc | cards | funding | system`.
- Inbox shows the **full transcript** per user, with a filter `[ All | Support ]`.
- Example transcript:
  ```
  user: /start
  bot:  🌐 Choose your language …
  user: (photo – ID document)
  bot:  ✅ Thank you! … pending admin review
  user: (support) I can't upload my photo
  bot:  (support reply) …
  ```

---

## Open questions for your approval
1. Item 3: store **Gregorian** (converted) and show Shamsi in the prompt — OK? Or store Shamsi as-entered?
2. Item 6: logging **all** bot messages increases DB writes; acceptable? (Recommended yes — it's what makes Inbox useful.)
3. Item 2: place the **[Notify user]** button on **both** the Clients sheet and the Requests row, or just one?

**Approve (or adjust) and I'll implement all six.**
