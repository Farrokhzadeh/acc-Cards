
export type Lang = "en" | "fa";
export type Msg = { en: string; fa: string };

const overridesBySignature = new Map<string, Msg>();
const signature = (value: Msg) => `${value.en}\u0000${value.fa}`;

export function pick(value: Msg, lang: string | null | undefined): string {
  const managed = overridesBySignature.get(signature(value)) ?? value;
  return lang === "fa" ? managed.fa : managed.en;
}

export function render(value: Msg, lang: string | null | undefined, vars: Record<string, string | number | null | undefined> = {}): string {
  return pick(value, lang).replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => {
    const replacement = vars[key];
    return replacement == null ? match : String(replacement);
  });
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
    "🪪 <b>Identity verification (KYC)</b>\nTo verify, please have these ready:\n• Full legal name (as on ID)\n• Date of birth (Shamsi, e.g. 1374-02-03)\n• Country of residence\n• National ID / passport number\n• Phone number (with country code)\n• Home/card-delivery address\n• A clear photo of your ID (passport or national card)\n\n📦 We collect your home address so your card can be sent to you.\n⏱ Takes about a minute. Your information is encrypted and used only for verification and card delivery.",
    "🪪 <b>احراز هویت</b>\nبرای احراز، این موارد را آماده داشته باشید:\n• نام و نام خانوادگی (مانند مدرک)\n• تاریخ تولد (شمسی، مثلاً 1374-02-03)\n• کشور محل سکونت\n• کد ملی / شماره گذرنامه\n• شماره تلفن با کد کشور\n• آدرس منزل / تحویل کارت\n• عکس واضح از مدرک (گذرنامه یا کارت ملی)\n\n📦 آدرس منزل برای ارسال کارت به شما دریافت می‌شود.\n⏱ حدود یک دقیقه. اطلاعات شما رمزنگاری شده و فقط برای احراز هویت و ارسال کارت استفاده می‌شود.",
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
  return render(BOT.kycConfirmSummary, lang, f);
}


export const BOT = {
  joinGate: m("To use AccAbad, join the required channel(s) below and then check again.", "برای استفاده از AccAbad ابتدا عضو کانال‌های لازم شوید و سپس دوباره بررسی کنید."),
  joinChannel: m("Join {channel}", "عضویت در {channel}"),
  joinRetry: m("✅ I've joined — check again", "✅ عضو شدم — دوباره بررسی کن"),
  defaultCardLabel: m("Card", "کارت"),
  showFullCard: m("👁 Show full card info", "👁 نمایش اطلاعات کامل کارت"),
  transactions: m("Transactions", "تراکنش‌ها"),
  freeze: m("❄️ Freeze", "❄️ مسدود کردن"),
  unfreeze: m("🔓 Unfreeze", "🔓 رفع مسدودی"),
  backCard: m("← Card", "← کارت"),
  backCards: m("← Cards", "← کارت‌ها"),
  cardDetail: m("<b>{label}</b>\nCard: •{last4}\nStatus: <b>{status}</b>\nBalance: <b>{balance}</b>", "<b>{label}</b>\nکارت: •{last4}\nوضعیت: <b>{status}</b>\nموجودی: <b>{balance}</b>"),
  fullCardInfo: m("<b>💳 Full card information</b>\nCard number: <code>{number}</code>\nExpiry: <code>{expiry}</code>\nCVV: <code>{cvv}</code>\nCardholder: <b>{holder}</b>\nBalance: <b>{balance}</b>\nStatus: <b>{status}</b>\n\nKeep these card details private.", "<b>💳 اطلاعات کامل کارت</b>\nشماره کارت: <code>{number}</code>\nتاریخ انقضا: <code>{expiry}</code>\nCVV: <code>{cvv}</code>\nنام دارنده: <b>{holder}</b>\nموجودی: <b>{balance}</b>\nوضعیت: <b>{status}</b>\n\nاین اطلاعات کارت را محرمانه نگه دارید."),
  recentTransactions: m("<b>Recent transactions · •{last4}</b>\n{items}", "<b>تراکنش‌های اخیر · •{last4}</b>\n{items}"),
  firstCardPurpose: m("First card", "اولین کارت"),
  newCardPurpose: m("New card", "کارت جدید"),
  fundingPurpose: m("Card funding", "افزایش موجودی کارت"),
  reference: m("Reference", "مرجع"),
  paymentReference: m("Payment reference", "مرجع پرداخت"),
  paymentStatus: m("Payment status", "وضعیت پرداخت"),
  requestStatus: m("Request status", "وضعیت درخواست"),
  card: m("Card", "کارت"),
  cardAmount: m("Card amount", "مبلغ کارت"),
  providerFee: m("Provider fee", "کارمزد سرویس کارت"),
  serviceFee: m("Service fee", "کارمزد خدمات"),
  totalUsdBasis: m("Total USD basis", "مبنای کل دلاری"),
  lockedRate: m("Locked rate", "نرخ ثبت‌شده"),
  rialPerUsd: m("rial/USD", "ریال/دلار"),
  exactRialAmount: m("Exact rial amount", "مبلغ دقیق ریالی"),
  receipt: m("Receipt", "رسید"),
  notUploaded: m("not uploaded", "ثبت نشده"),
  created: m("Created", "ایجاد"),
  reviewed: m("Reviewed", "بررسی"),
  adminNote: m("Admin note", "یادداشت مدیر"),
  viewReceipt: m("🧾 View receipt", "🧾 مشاهده رسید"),
  uploadReceipt: m("📤 Upload receipt", "📤 ارسال رسید"),
  cardRequestDetails: m("Card request details", "جزئیات درخواست کارت"),
  fundingRequestDetails: m("Funding request details", "جزئیات افزایش موجودی"),
  backPayments: m("← Payments & requests", "← پرداخت‌ها و درخواست‌ها"),
  paymentReceiptUpload: m("Upload the payment receipt as JPEG, PNG, WebP, or PDF.", "رسید پرداخت را به صورت JPEG، PNG، WebP یا PDF ارسال کنید."),
  cardAmountInvalid: m("Enter a valid USD amount of at least <b>{minimum}</b>.", "یک مبلغ معتبر دلاری حداقل <b>{minimum}</b> وارد کنید."),
  askCardEmail: m("Enter the email address to use for the new card:", "ایمیل موردنظر برای کارت را وارد کنید:"),
  invalidCardEmail: m("Enter a valid email address.", "یک ایمیل معتبر وارد کنید."),
  reviewCardRequest: m("<b>Review card request</b>\nAmount: <b>{amount}</b>\nEmail: <code>{email}</code>\n\nAfter submission you will receive payment instructions and must upload a receipt.", "<b>بررسی درخواست کارت</b>\nمبلغ: <b>{amount}</b>\nایمیل: <code>{email}</code>\n\nبعد از ثبت، اطلاعات پرداخت نمایش داده می‌شود و باید رسید را ارسال کنید."),
  submit: m("✅ Submit", "✅ ثبت"),
  cancel: m("Cancel", "لغو"),
  useSubmit: m("Use the Submit button above, or send /cancel.", "از دکمه ثبت بالا استفاده کنید یا /cancel بفرستید."),
  receiptEvidenceRequired: m("Upload the payment receipt as a JPEG, PNG, WebP, or PDF file. Text alone cannot be used as payment evidence.", "رسید پرداخت را به صورت JPEG، PNG، WebP یا PDF ارسال کنید. متن به تنهایی به عنوان مدرک پرداخت پذیرفته نمی‌شود."),
  uploadPaymentEvidence: m("Upload payment evidence for <b>{reference}</b> as JPEG, PNG, WebP, or PDF.", "مدرک پرداخت برای <b>{reference}</b> را به صورت JPEG، PNG، WebP یا PDF ارسال کنید."),
  invalidReceiptType: m("That document type is not accepted. Upload a PDF, JPEG, PNG, or WebP receipt.", "این نوع فایل پذیرفته نمی‌شود. رسید را به صورت PDF، JPEG، PNG یا WebP ارسال کنید."),
  cardPaymentReceiptReceived: m("Payment receipt received. An administrator must verify it before your card request can be approved or issued.", "رسید پرداخت دریافت شد. مدیر باید آن را تأیید کند تا درخواست کارت قابل تأیید یا صدور باشد."),
  fundingChooseCard: m("<b>Funding request</b>\nChoose the card you want to fund.", "<b>درخواست افزایش موجودی</b>\nکارتی را که می‌خواهید شارژ کنید انتخاب کنید."),
  fundingReviewQuote: m("<b>Review funding quote</b>\nCard: •{last4}\nCard amount: <b>{amount}</b>\nProvider fee: {providerFee}\nService fee: {serviceFee}\nTotal USD basis: <b>{total}</b>\nRate: {rate} rial/USD\nClient pays: <b>{rial}</b>\n\nThis quote expires at {expires} UTC.", "<b>بررسی پیش‌فاکتور افزایش موجودی</b>\nکارت: •{last4}\nمبلغ کارت: <b>{amount}</b>\nکارمزد ارائه‌دهنده: {providerFee}\nکارمزد خدمات: {serviceFee}\nمبنای کل دلاری: <b>{total}</b>\nنرخ: {rate} ریال/دلار\nمبلغ پرداختی: <b>{rial}</b>\n\nاین پیش‌فاکتور در {expires} UTC منقضی می‌شود."),
  submitUploadReceipt: m("Submit & upload receipt", "ثبت و ارسال رسید"),
  fundingAmountInvalid: m("Enter a valid USD amount of at least <b>{minimum}</b>, for example <code>50</code> or <code>75.25</code>.", "یک مبلغ معتبر دلاری حداقل <b>{minimum}</b> وارد کنید؛ مثلاً <code>50</code> یا <code>75.25</code>."),
  useSubmitUpload: m("Use the Submit & upload receipt button above, or send /cancel.", "از دکمه ثبت و ارسال رسید بالا استفاده کنید یا /cancel بفرستید."),
  fundingReceiptRequired: m("Upload the receipt as a JPEG, PNG, WebP, or PDF file. Text alone cannot be used as payment evidence. Send /cancel to cancel the request.", "رسید را به صورت JPEG، PNG، WebP یا PDF ارسال کنید. متن به تنهایی مدرک پرداخت نیست. برای لغو درخواست /cancel بفرستید."),
  uploadReceiptFile: m("Upload a JPEG, PNG, WebP, or PDF receipt file.", "یک فایل رسید JPEG، PNG، WebP یا PDF ارسال کنید."),
  receiptReceived: m("Receipt received for <b>{reference}</b>. The request is now awaiting admin review. No card funding has been executed.", "رسید برای <b>{reference}</b> دریافت شد. درخواست در انتظار بررسی مدیر است و هنوز هیچ افزایش موجودی کارت انجام نشده است."),
  uploadReplacementEvidence: m("Upload replacement payment evidence for <b>{reference}</b> as JPEG, PNG, WebP, or PDF.", "مدرک پرداخت جایگزین برای <b>{reference}</b> را به صورت JPEG، PNG، WebP یا PDF ارسال کنید."),
  cancelRequest: m("Cancel request", "لغو درخواست"),
  backRequests: m("← My requests", "← درخواست‌های من"),
  supportPrompt: m("Send your support message now. It will appear in AccAbad Admin. Send /cancel when you're finished.", "پیام پشتیبانی خود را ارسال کنید. پیام در پنل AccAbad نمایش داده می‌شود. پس از پایان /cancel بفرستید."),
  callbackUnavailable: m("This button is unavailable.", "این دکمه دیگر در دسترس نیست."),
  cardStateUncertain: m("The card-state result is uncertain. An administrator must reconcile it before another change can be attempted.", "نتیجه تغییر وضعیت کارت نامشخص است. مدیر باید آن را بررسی کند تا تغییر دیگری انجام شود."),
  cardStateNow: m("Card is now <b>{status}</b>.", "کارت اکنون <b>{status}</b> است."),
  cardRequestCancelled: m("Card request cancelled.", "درخواست کارت لغو شد."),
  fundingAmountPrompt: m("Enter the USD amount to add to card •{last4}. Minimum: <b>{minimum}</b>.", "مبلغ دلاری برای افزودن به کارت •{last4} را وارد کنید. حداقل: <b>{minimum}</b>."),
  fundingCreated: m("Funding request <b>{reference}</b> was created with an immutable quote.\nNow upload your payment receipt as a JPEG, PNG, WebP, or PDF.\n\nNo card funding has been executed yet.", "درخواست افزایش موجودی <b>{reference}</b> با نرخ ثابت ایجاد شد.\nاکنون رسید پرداخت را به صورت JPEG، PNG، WebP یا PDF ارسال کنید.\n\nهنوز هیچ افزایش موجودی کارت انجام نشده است."),
  fundingDraftCancelled: m("Funding request draft cancelled.", "پیش‌نویس درخواست افزایش موجودی لغو شد."),
  fundingCancelled: m("Funding request <b>{reference}</b> was cancelled.", "درخواست افزایش موجودی <b>{reference}</b> لغو شد."),
  actionExpired: m("This action is no longer available. Use /start to reopen the menu.", "این عملیات دیگر در دسترس نیست. برای باز کردن دوباره منو /start را بفرستید."),
  actionFailed: m("This action could not be completed right now.", "این عملیات در حال حاضر قابل انجام نیست."),
  help: m("<b>AccAbad commands</b>\n/start or /menu — main menu\n/kyc — identity verification\n/support — contact support\n/lang — language\n/cancel — cancel the current flow", "<b>دستورهای AccAbad</b>\n/start یا /menu — منوی اصلی\n/kyc — احراز هویت\n/support — پشتیبانی\n/lang — زبان\n/cancel — لغو فرایند جاری"),
  supportDuplicate: m("Support already received this message.", "پشتیبانی قبلاً این پیام را دریافت کرده است."),
  supportSent: m("Your message{attachment} was sent to support. Send another message, or /cancel to return to the menu.", "پیام شما{attachment} برای پشتیبانی ارسال شد. پیام دیگری بفرستید یا برای بازگشت به منو /cancel را ارسال کنید."),
  supportAttachmentSuffix: m(" and attachment", " به همراه پیوست"),
  supportFailed: m("The support message could not be stored. Please try again.", "پیام پشتیبانی ذخیره نشد. لطفاً دوباره تلاش کنید."),
  kycSubmit: m("✅ Submit / ثبت", "✅ Submit / ثبت"),
  kycCancel: m("❌ Cancel / لغو", "❌ Cancel / لغو"),
  onboardingPending: m("Payment receipt under review ⏳", "رسید پرداخت در حال بررسی است ⏳"),
  onboardingAccepted: m("Payment approved; your card is waiting to be prepared ✅", "پرداخت تأیید شده و کارت شما در انتظار آماده‌سازی است ✅"),
  onboardingPreparing: m("Your card is being prepared ⏳", "کارت شما در حال آماده‌سازی است ⏳"),
  onboardingReady: m("Your card is ready and onboarding is being finalized ✅", "کارت شما آماده است و فرایند نهایی می‌شود ✅"),
  onboardingComplete: m("Your first card is active ✅", "اولین کارت شما فعال است ✅"),
  onboardingDenied: m("Payment receipt was denied ❌", "رسید پرداخت رد شده است ❌"),
  onboardingWaitingPayment: m("Waiting for your first-card payment", "در انتظار پرداخت اولین کارت"),
  firstCardAmountLabel: m("First-card amount", "مبلغ اولین کارت"),
  receiptSubmittedLabel: m("Receipt submitted", "رسید ثبت شد"),
  kycDetails: m("<b>🪪 My KYC</b>\nName: <b>{name}</b>\nDate of birth: {dob}\nCountry: {country}\nNational ID / passport: <code>{nationalId}</code>\nPhone: <code>{phone}</code>\nCard delivery address: {address}\nStatus: <b>{status}</b>\nDocument: {document}", "<b>🪪 اطلاعات احراز هویت</b>\nنام: <b>{name}</b>\nتاریخ تولد: {dob}\nکشور: {country}\nکد ملی / گذرنامه: <code>{nationalId}</code>\nتلفن: <code>{phone}</code>\nآدرس تحویل کارت: {address}\nوضعیت: <b>{status}</b>\nمدرک: {document}"),
  documentSubmitted: m("submitted ✅", "ثبت شده ✅"),
  documentNotSubmitted: m("not submitted", "ثبت نشده"),
  firstCardReceiptCaption: m("🧾 Your first-card payment receipt", "🧾 رسید پرداخت اولین کارت شما"),
  uploadPaymentReceiptButton: m("Upload payment receipt", "ارسال رسید پرداخت"),
  noTimelineEvents: m("No timeline events.", "رویدادی در تاریخچه ثبت نشده است."),
  timeline: m("Timeline", "تاریخچه"),
  newCardType: m("New card", "کارت جدید"),
  initialAmount: m("Initial amount", "مبلغ اولیه"),
  emailLabel: m("Email", "ایمیل"),
  statusLabel: m("Status", "وضعیت"),
  typeLabel: m("Type", "نوع"),
  fundingClientPays: m("Client pays", "مبلغ پرداختی"),
  unavailable: m("Unavailable", "ناموجود"),
  stored: m("stored", "ذخیره شده"),
  firstCardRate: m("Locked rate: <b>{rate}</b> rial/USD\nPay exactly: <b>{rial}</b>", "نرخ ثبت‌شده: <b>{rate}</b> ریال برای هر دلار\nمبلغ دقیق قابل پرداخت: <b>{rial}</b>"),
  requestCardStart: m("<b>🆕 Request a new card</b>\nEnter the initial USD amount you want on the new card. Minimum: <b>{minimum}</b>.\n\nOur team will handle the card setup after reviewing your request.", "<b>🆕 درخواست کارت جدید</b>\nمبلغ اولیه‌ای که می‌خواهید روی کارت جدید باشد را به دلار وارد کنید. حداقل: <b>{minimum}</b>.\n\nانتخاب نوع صدور کارت توسط تیم ما انجام می‌شود."),
  cardRequestReview: m("<b>Review card request</b>\nInitial amount: <b>{amount}</b>\nEmail: <code>{email}</code>\n\nAfter submission, an administrator will review the request.", "<b>بررسی درخواست کارت</b>\nمبلغ اولیه: <b>{amount}</b>\nایمیل: <code>{email}</code>\n\nپس از ثبت، مدیر درخواست را بررسی می‌کند."),
  cardRequestPayment: m("Card request <b>{reference}</b> was created.\nUSD basis: <b>{usd}</b>\nLocked rate: {rate} rial/USD\nPay exactly: <b>{rial}</b>\nPayment card: <code>{card}</code>\nHolder: <b>{holder}</b>\n\nAfter paying, upload the receipt here. No card will be approved or issued before admin verification.", "درخواست <b>{reference}</b> ثبت شد.\nمبلغ: <b>{usd}</b>\nنرخ ثبت‌شده: {rate} ریال/دلار\nمبلغ دقیق قابل پرداخت: <b>{rial}</b>\nکارت پرداخت: <code>{card}</code>\nبه نام: <b>{holder}</b>\n\nبعد از پرداخت، رسید را همینجا ارسال کنید. تا تایید مدیر هیچ کارتی ساخته نمی‌شود."),
  cardRequestDetail: m("<b>{reference}</b>\nType: <b>{type}</b>\nStatus: <b>{status}</b>\nInitial amount: <b>{amount}</b>\nEmail: <code>{email}</code>{payment}{adminNote}\n\n<b>Timeline</b>\n{timeline}", "<b>{reference}</b>\nنوع: <b>{type}</b>\nوضعیت: <b>{status}</b>\nمبلغ اولیه: <b>{amount}</b>\nایمیل: <code>{email}</code>{payment}{adminNote}\n\n<b>تاریخچه</b>\n{timeline}"),
  cardRequestPaymentDetail: m("\nPayment: <b>{status}</b>\nRate: {rate} rial/USD\nPayable: <b>{rial}</b>", "\nپرداخت: <b>{status}</b>\nنرخ: {rate} ریال/دلار\nمبلغ قابل پرداخت: <b>{rial}</b>"),
  adminNoteLine: m("\nAdmin note: {note}", "\nیادداشت مدیر: {note}"),
  fundingDetail: m("<b>{reference}</b>\nStatus: <b>{status}</b>\nCard: •{last4}\nCard amount: <b>{amount}</b>\nTotal USD basis: {total}\nClient pays: {rial}{adminNote}\nReceipt: {receipt}\n\n<b>Timeline</b>\n{timeline}", "<b>{reference}</b>\nوضعیت: <b>{status}</b>\nکارت: •{last4}\nمبلغ کارت: <b>{amount}</b>\nمبنای کل دلاری: {total}\nمبلغ پرداختی: {rial}{adminNote}\nرسید: {receipt}\n\n<b>تاریخچه</b>\n{timeline}"),
  kycConfirmSummary: m("<b>Confirm your details</b>\nName: {fullName}\nDate of birth: {dateOfBirth}\nCountry: {country}\nNational ID: {nationalId}\nPhone: {phone}\nCard delivery address: {deliveryAddress}\nDocument: attached\n\nTap <b>Submit</b> to send for admin review.", "<b>تأیید اطلاعات</b>\nنام: {fullName}\nتاریخ تولد: {dateOfBirth}\nکشور: {country}\nکد ملی: {nationalId}\nتلفن: {phone}\nآدرس تحویل کارت: {deliveryAddress}\nمدرک: پیوست شد\n\nبرای ارسال جهت بررسی، <b>ثبت</b> را بزنید."),
};

export type BotTextCatalogEntry = {
  key: string;
  section: string;
  name: string;
  defaultEn: string;
  defaultFa: string;
};

export function getBotTextCatalog(): BotTextCatalogEntry[] {
  const groups: Record<string, Record<string, Msg>> = { KYC, MENU, COMMON, PAYMENT, FLOW, NOTIFY, BOT };
  return Object.entries(groups).flatMap(([section, values]) =>
    Object.entries(values).map(([name, value]) => ({
      key: `${section}.${name}`,
      section,
      name,
      defaultEn: value.en,
      defaultFa: value.fa,
    })),
  );
}

export function applyBotTextOverrides(rows: Array<{ key: string; enText: string; faText: string }>) {
  overridesBySignature.clear();
  const byKey = new Map(rows.map((row) => [row.key, row]));
  for (const entry of getBotTextCatalog()) {
    const override = byKey.get(entry.key);
    if (!override) continue;
    overridesBySignature.set(signature({ en: entry.defaultEn, fa: entry.defaultFa }), {
      en: override.enText,
      fa: override.faText,
    });
  }
}

export function getBotTextByKey(key: string): Msg | null {
  const [section, name] = key.split(".", 2);
  const groups: Record<string, Record<string, Msg>> = { KYC, MENU, COMMON, PAYMENT, FLOW, NOTIFY, BOT };
  return groups[section]?.[name] ?? null;
}
