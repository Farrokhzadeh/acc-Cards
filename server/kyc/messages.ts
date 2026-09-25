
export type Lang = "en" | "fa";
export type Msg = { en: string; fa: string };

export function pick(m: Msg, lang: string | null | undefined): string {
  return lang === "fa" ? m.fa : m.en;
}

const m = (en: string, fa: string): Msg => ({ en, fa });

export const KYC = {
  accessDisabled: m(
    "Your AccAbad access is currently disabled. Contact an administrator.",
    "دسترسی شما به AccAbad غیرفعال است. با یک مدیر تماس بگیرید.",
  ),
  featureDisabled: m("Identity verification is currently disabled.", "احراز هویت در حال حاضر غیرفعال است."),
  alreadyApproved: m("✅ Your identity is already verified. Thank you!", "✅ هویت شما پیش‌تر تأیید شده است. سپاس!"),
  alreadyPending: m(
    "⏳ Your identity verification is under review. We'll notify you once an admin approves it.",
    "⏳ درخواست احراز هویت شما در حال بررسی است. پس از تأیید مدیر به شما اطلاع می‌دهیم.",
  ),
  invite: m(
    "🪪 <b>Identity verification (KYC)</b>\nTo verify, please have these ready:\n• Full legal name (as on ID)\n• Date of birth (Shamsi, e.g. 1374-02-03)\n• Country of residence\n• National ID / passport number\n• Phone number (with country code)\n• A clear photo of your ID (passport or national card)\n\n⏱ Takes about a minute. Your information is encrypted and used only for verification.",
    "🪪 <b>احراز هویت</b>\nبرای احراز، این موارد را آماده داشته باشید:\n• نام و نام خانوادگی (مانند مدرک)\n• تاریخ تولد (شمسی، مثلاً 1374-02-03)\n• کشور محل سکونت\n• کد ملی / شماره گذرنامه\n• شماره تلفن با کد کشور\n• عکس واضح از مدرک (گذرنامه یا کارت ملی)\n\n⏱ حدود یک دقیقه. اطلاعات شما رمزنگاری شده و فقط برای احراز استفاده می‌شود.",
  ),
  startKyc: m("✅ Start KYC", "✅ شروع احراز هویت"),
  cancelBtn: m("Cancel", "انصراف"),
  inviteButton: m("🪪 Start verification", "🪪 شروع احراز هویت"),
  intro: m(
    "🪪 <b>Identity verification (KYC)</b>\nI'll ask a few questions. Send /cancel at any time to stop.\n\nEnter your <b>full legal name</b> exactly as it appears on your ID.",
    "🪪 <b>احراز هویت</b>\nچند پرسش می‌پرسم. برای لغو هر زمان /cancel بفرستید.\n\n<b>نام و نام خانوادگی</b> خود را دقیقاً مانند مدرک شناسایی وارد کنید.",
  ),
  askFullName: m("Enter your full legal name (as on your ID).", "نام و نام خانوادگی کامل خود را وارد کنید (مانند مدرک شناسایی)."),
  errFullName: m("Please enter a name between 3 and 120 characters.", "لطفاً نامی بین ۳ تا ۱۲۰ نویسه وارد کنید."),
  askDob: m("Enter your date of birth in Shamsi (Jalali) as <code>YYYY-MM-DD</code> (for example <code>1374-02-03</code>).", "تاریخ تولد را به شمسی (جلالی) با قالب <code>YYYY-MM-DD</code> وارد کنید (مثلاً <code>1374-02-03</code>)."),
  errDob: m("Enter a valid Shamsi date as <code>YYYY-MM-DD</code> (for example <code>1374-02-03</code>).", "یک تاریخ شمسی معتبر با قالب <code>YYYY-MM-DD</code> وارد کنید (مثلاً <code>1374-02-03</code>)."),
  askCountry: m("Enter your country of residence.", "کشور محل سکونت خود را وارد کنید."),
  errCountry: m("Please enter a country between 2 and 80 characters.", "لطفاً کشوری بین ۲ تا ۸۰ نویسه وارد کنید."),
  askNationalId: m("Enter your national ID or passport number.", "کد ملی یا شماره گذرنامه خود را وارد کنید."),
  errNationalId: m("Please enter an ID between 3 and 40 characters.", "لطفاً شناسه‌ای بین ۳ تا ۴۰ نویسه وارد کنید."),
  askPhone: m("Enter your phone number, including the country code (for example <code>+989121234567</code>).", "شماره تلفن خود را با کد کشور وارد کنید (مثلاً <code>+989121234567</code>)."),
  errPhone: m("Enter a valid phone number (6-20 digits, optional +).", "یک شماره تلفن معتبر وارد کنید (۶ تا ۲۰ رقم، با + اختیاری)."),
  askDeliveryCountry: m("📦 Now enter the <b>country for card delivery</b>. This address is used to send your card to you.", "📦 اکنون <b>کشور محل تحویل کارت</b> را وارد کنید. این آدرس برای ارسال کارت به شما استفاده می‌شود."),
  errDeliveryCountry: m("Please enter a delivery country between 2 and 80 characters.", "لطفاً کشور محل تحویل را بین ۲ تا ۸۰ نویسه وارد کنید."),
  askDeliveryProvince: m("Enter your <b>province / state</b> for card delivery.", "<b>استان / ایالت</b> محل تحویل کارت را وارد کنید."),
  errDeliveryProvince: m("Please enter a province or state between 2 and 120 characters.", "لطفاً استان یا ایالت را بین ۲ تا ۱۲۰ نویسه وارد کنید."),
  askDeliveryCity: m("Enter your <b>city</b> for card delivery.", "<b>شهر</b> محل تحویل کارت را وارد کنید."),
  errDeliveryCity: m("Please enter a city between 2 and 120 characters.", "لطفاً شهر را بین ۲ تا ۱۲۰ نویسه وارد کنید."),
  askDeliveryAddress: m("Enter your full <b>street address</b>, including street, building, and unit/apartment when applicable.", "<b>آدرس کامل منزل</b> را شامل خیابان، ساختمان و واحد/آپارتمان در صورت وجود وارد کنید."),
  errDeliveryAddress: m("Please enter a complete address between 8 and 300 characters.", "لطفاً آدرس کاملی بین ۸ تا ۳۰۰ نویسه وارد کنید."),
  askDeliveryPostal: m("Enter your <b>postal / ZIP code</b>. Send <code>-</code> if your address does not have one.", "<b>کد پستی</b> را وارد کنید. اگر آدرس شما کد پستی ندارد، <code>-</code> بفرستید."),
  errDeliveryPostal: m("Enter a postal/ZIP code up to 32 characters, or send <code>-</code> if unavailable.", "کد پستی را حداکثر تا ۳۲ نویسه وارد کنید، یا اگر ندارید <code>-</code> بفرستید."),
  askDocument: m("📷 Now send a clear <b>photo of your ID document</b> (passport or national ID card). JPEG, PNG, WebP, or PDF.", "📷 اکنون یک <b>عکس واضح از مدرک شناسایی</b> (گذرنامه یا کارت ملی) بفرستید. JPEG، PNG، WebP یا PDF."),
  errDocType: m("That file type is not accepted. Send a JPEG, PNG, WebP image or a PDF.", "این نوع فایل پذیرفته نمی‌شود. تصویر JPEG، PNG، WebP یا PDF بفرستید."),
  errDocSize: m("That file is too large. Please send a smaller image or PDF.", "این فایل خیلی بزرگ است. لطفاً تصویر یا PDF کوچک‌تری بفرستید."),
  errDocGeneric: m("We couldn't process that document. Please try sending it again.", "نتوانستیم این مدرک را پردازش کنیم. لطفاً دوباره آن را بفرستید."),
  useButtons: m("Use the Submit or Cancel button below, or send /cancel.", "از دکمهٔ ثبت یا لغو در زیر استفاده کنید، یا /cancel بفرستید."),
  submitted: m("✅ Thank you! Your identity verification was submitted and is now <b>pending admin review</b>.", "✅ سپاس! درخواست احراز هویت شما ثبت شد و اکنون <b>در انتظار بررسی مدیر</b> است."),
  cancelled: m("Identity verification cancelled.", "احراز هویت لغو شد."),
  approvedNotice: m("🎉 Your identity has been <b>approved</b>. Next, choose how much you want on your first card and make that payment.", "🎉 هویت شما <b>تأیید</b> شد. حالا مبلغی را که می‌خواهید روی اولین کارت شما باشد انتخاب کنید و همان مبلغ را پرداخت کنید."),
  rejectedNotice: m("Your identity verification was <b>rejected</b>. You can start again with /kyc.", "احراز هویت شما <b>رد</b> شد. می‌توانید با /kyc دوباره شروع کنید."),
  approvedNoAccount: m(
    "Your identity is approved ✅. You can continue with your card request when prompted.",
    "هویت شما تأیید شده ✅. هر زمان از شما خواسته شد می‌توانید فرایند کارت را ادامه دهید.",
  ),
};

export const MENU = {
  cards: m("💳 My cards", "💳 کارت‌های من"),
  requests: m("💰 Payments & requests", "💰 پرداخت‌ها و درخواست‌ها"),
  addFunds: m("➕ Add funds", "➕ افزایش موجودی"),
  requestCard: m("🆕 Request card", "🆕 درخواست کارت"),
  verify: m("🪪 Verify identity", "🪪 احراز هویت"),
  support: m("💬 Support", "💬 پشتیبانی"),
  language: m("🌐 Language", "🌐 زبان"),
  status: m("📍 Status", "📍 وضعیت"),
  kycInfo: m("🪪 My KYC", "🪪 اطلاعات احراز هویت"),
  receipt: m("🧾 Payment receipt", "🧾 رسید پرداخت"),
  payment: m("💳 Payment info", "💳 اطلاعات پرداخت"),
  paidBtn: m("💵 Choose first-card amount", "💵 انتخاب مبلغ اولین کارت"),
  back: m("← Menu", "← منو"),
};

export const COMMON = {
  welcome: m("Welcome", "خوش آمدید"),
  chooseOption: m("Choose an option:", "یک گزینه انتخاب کنید:"),
  langPicker: m("🌐 Choose your language:", "🌐 زبان خود را انتخاب کنید:"),
  langEn: m("English", "English"),
  langFa: m("فارسی", "فارسی"),
  langSetEn: m("Language set to English.", "زبان به English تنظیم شد."),
  langSetFa: m("زبان به فارسی تنظیم شد.", "زبان به فارسی تنظیم شد."),
  approvedMenuHint: m("Tap a button below to continue:", "برای ادامه یک دکمه بزنید:"),
  kycStatus: m("🪪 Identity:", "🪪 وضعیت هویت:"),
  kycApproved: m("approved ✅", "تأیید شده ✅"),
  kycPending: m("pending review ⏳", "در حال بررسی ⏳"),
  kycRejected: m("rejected ❌", "رد شده ❌"),
  kycNone: m("not verified", "تأیید نشده"),
};

export const PAYMENT = {
  info: m(
    "💳 <b>Pay exactly ${amount} for your first card</b>\nCard number: <code>{card}</code>\nCard holder: <b>{holder}</b>\nThe approved amount becomes the initial balance of your first card.",
    "💳 <b>برای اولین کارت دقیقاً ${amount} پرداخت کنید</b>\nشماره کارت: <code>{card}</code>\nبه نام: <b>{holder}</b>\nمبلغ تأییدشده، موجودی اولیه اولین کارت شما خواهد بود.",
  ),
  chooseAmount: m(
    "✅ KYC approved. Choose how much you want on your first card. Minimum: <b>${min}</b>. After you enter the amount, we will show the payment card and exact amount to send.",
    "✅ احراز هویت تأیید شد. مبلغ موردنظر برای اولین کارت را انتخاب کنید. حداقل: <b>${min}</b>. بعد از وارد کردن مبلغ، کارت پرداخت و مبلغ دقیق نمایش داده می‌شود.",
  ),
  notConfigured: m("Payment card is not configured yet. Please contact support.", "کارت پرداخت هنوز تنظیم نشده است. لطفاً با پشتیبانی تماس بگیرید."),
  askReceipt: m("🧾 Now send the <b>payment receipt</b> as a screenshot/image or PDF. The receipt is required for admin approval.", "🧾 حالا <b>رسید پرداخت</b> را به‌صورت تصویر یا PDF ارسال کنید. رسید برای تأیید مدیر الزامی است."),
  askAmount: m("💵 Enter the amount you want on your first card in USD:", "💵 مبلغی را که می‌خواهید روی اولین کارت شما باشد به دلار وارد کنید:"),
  errAmount: m("Enter a valid amount in USD, for example <code>20</code>.", "یک مبلغ معتبر به دلار وارد کنید، مثلاً <code>20</code>."),
  errMinAmount: m("The minimum load is <code>{min}</code>. Please enter at least that amount.", "حداقل شارژ <code>{min}</code> است. لطفاً حداقل این مبلغ را وارد کنید."),
  denied: m("❌ Your payment receipt was <b>denied</b>. Please check the amount and receipt and send them again, or contact support.", "❌ رسید پرداخت شما <b>رد</b> شد. لطفاً مبلغ و رسید را بررسی و دوباره بفرستید، یا با پشتیبانی تماس بگیرید."),
  complete: m("✅ Payment confirmed! Your card (Ucard) is active. Open the menu to view your card and its balance.", "✅ پرداخت تأیید شد! کارت شما (Ucard) فعال است. منو را باز کنید تا کارت و موجودی آن را ببینید."),
  skipReceipt: m("Receipt required", "رسید الزامی است"),
  receiptRequired: m("A payment receipt is required. Upload an image or PDF of the payment to continue.", "رسید پرداخت الزامی است. برای ادامه تصویر یا PDF رسید را ارسال کنید."),
};

export const FLOW = {
  getCardLead: m(
    "🆕 <b>Getting your card</b>\nSend your payment to the card below. After we confirm it, our team issues your card — no extra steps needed.",
    "🆕 <b>دریافت کارت</b>\nمبلغ را به کارت زیر واریز کنید. پس از تأیید، تیم ما کارت شما را صادر می‌کند — مرحله اضافه‌ای لازم نیست.",
  ),
  emptyCards: m(
    "You don't have a card yet.\n1️⃣ Verify your identity\n2️⃣ Make your first payment\nOur team activates your card right after.",
    "هنوز کارت ندارید.\n1️⃣ هویت خود را تأیید کنید\n2️⃣ اولین پرداخت را انجام دهید\nتیم ما بلافاصله کارت شما را فعال می‌کند.",
  ),
  cardsHeader: m("<b>Your cards</b>\nTap a card to see details, balance, and transactions.", "<b>کارت‌های شما</b>\nبرای جزئیات، موجودی و تراکنش‌ها روی یک کارت بزنید."),
  emptyRequests: m(
    "<b>Payments & requests</b>\nNo payment history yet. First-card payments, new-card purchases, and card funding will appear here.",
    "<b>پرداخت‌ها و درخواست‌ها</b>\nهنوز سابقه پرداختی ندارید. پرداخت اولین کارت، کارت جدید و افزایش موجودی اینجا نمایش داده می‌شود.",
  ),
  requestsHeader: m("<b>Payments & requests</b>\nTap an item to see the exact amount, locked rate, receipt, and status.", "<b>پرداخت‌ها و درخواست‌ها</b>\nبرای مبلغ دقیق، نرخ ثبت‌شده، رسید و وضعیت روی هر مورد بزنید."),
  emptyTransactions: m("No transactions yet. Once you use your card, its activity appears here.", "هنوز تراکنشی نیست. پس از استفاده از کارت، فعالیت‌ها اینجا نمایش می‌گیرد."),
  waitPayment: m("⏳ Payment received. Our team is reviewing it — please wait. We'll message you here as soon as your card is ready.", "⏳ پرداخت دریافت شد. تیم ما در حال بررسی است — لطفاً صبر کنید. به محض آماده شدن کارت، اینجا پیام می‌دهیم."),
  waitingActivation: m("⏳ Receipt received. An administrator will verify the payment and prepare your first card with the approved amount. We'll notify you when the card is ready.", "⏳ رسید دریافت شد. مدیر پرداخت را بررسی می‌کند و اولین کارت شما را با مبلغ تأییدشده آماده می‌کند. وقتی کارت آماده شد به شما اطلاع می‌دهیم."),
  waitingMenu: m("You can use the options below while your setup is in progress.", "تا زمانی که فرایند شما در حال انجام است می‌توانید از گزینه‌های زیر استفاده کنید."),
  noKycInfo: m("No KYC submission is available yet.", "هنوز اطلاعات احراز هویتی ثبت نشده است."),
  noPaymentReceipt: m("No first-card payment receipt is available yet.", "هنوز رسید پرداخت اولین کارت ثبت نشده است."),
};

export const NOTIFY = {
  cardReady: m("✅ Your card is ready ••{last4}. Open the menu to start using it.", "✅ کارت شما آماده است ••{last4}. منو را باز کنید و استفاده را شروع کنید."),
  accountReady: m("✅ Your onboarding is complete. Open the menu to view your card.", "✅ ثبت‌نام شما تکمیل شد. منو را باز کنید و کارت خود را ببینید."),
};
export function kycConfirmSummary(
  f: { fullName: string; dateOfBirth: string; country: string; nationalId: string; phone: string; deliveryAddress: string },
  lang: string | null | undefined,
): string {
  return pick(
    m(
      `<b>Confirm your details</b>\nName: ${f.fullName}\nDate of birth: ${f.dateOfBirth}\nCountry: ${f.country}\nNational ID: ${f.nationalId}\nPhone: ${f.phone}\nCard delivery address: ${f.deliveryAddress}\nDocument: attached\n\nTap <b>Submit</b> to send for admin review.`,
      `<b>تأیید اطلاعات</b>\nنام: ${f.fullName}\nتاریخ تولد: ${f.dateOfBirth}\nکشور: ${f.country}\nکد ملی: ${f.nationalId}\nتلفن: ${f.phone}\nآدرس تحویل کارت: ${f.deliveryAddress}\nمدرک: پیوست شد\n\nبرای ارسال جهت بررسی، <b>ثبت</b> را بزنید.`,
    ),
    lang,
  );
}
