// Per-language message catalog. Every message is { en, fa }; the bot shows only
// the user's chosen language (never both at once). Users pick at /start and can
// change later via /lang or the 🌐 Language menu button.

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
    "🪪 <b>Identity verification</b>\nBefore we can activate your account, please verify your identity. It takes about a minute.",
    "🪪 <b>احراز هویت</b>\nپیش از فعال‌سازی حساب، لطفاً هویت خود را تأیید کنید. حدود یک دقیقه طول می‌کشد.",
  ),
  inviteButton: m("🪪 Start verification", "🪪 شروع احراز هویت"),
  intro: m(
    "🪪 <b>Identity verification (KYC)</b>\nI'll ask a few questions. Send /cancel at any time to stop.\n\nEnter your <b>full legal name</b> exactly as it appears on your ID.",
    "🪪 <b>احراز هویت</b>\nچند پرسش می‌پرسم. برای لغو هر زمان /cancel بفرستید.\n\n<b>نام و نام خانوادگی</b> خود را دقیقاً مانند مدرک شناسایی وارد کنید.",
  ),
  askFullName: m("Enter your full legal name (as on your ID).", "نام و نام خانوادگی کامل خود را وارد کنید (مانند مدرک شناسایی)."),
  errFullName: m("Please enter a name between 3 and 120 characters.", "لطفاً نامی بین ۳ تا ۱۲۰ نویسه وارد کنید."),
  askDob: m("Enter your date of birth as <code>YYYY-MM-DD</code> (for example <code>1995-04-23</code>).", "تاریخ تولد را به قالب <code>YYYY-MM-DD</code> وارد کنید (مثلاً <code>1995-04-23</code>)."),
  errDob: m("Enter a valid past date in <code>YYYY-MM-DD</code> format.", "یک تاریخ معتبر و گذشته در قالب <code>YYYY-MM-DD</code> وارد کنید."),
  askCountry: m("Enter your country of residence.", "کشور محل سکونت خود را وارد کنید."),
  errCountry: m("Please enter a country between 2 and 80 characters.", "لطفاً کشوری بین ۲ تا ۸۰ نویسه وارد کنید."),
  askNationalId: m("Enter your national ID or passport number.", "کد ملی یا شماره گذرنامه خود را وارد کنید."),
  errNationalId: m("Please enter an ID between 3 and 40 characters.", "لطفاً شناسه‌ای بین ۳ تا ۴۰ نویسه وارد کنید."),
  askPhone: m("Enter your phone number, including the country code (for example <code>+989121234567</code>).", "شماره تلفن خود را با کد کشور وارد کنید (مثلاً <code>+989121234567</code>)."),
  errPhone: m("Enter a valid phone number (6-20 digits, optional +).", "یک شماره تلفن معتبر وارد کنید (۶ تا ۲۰ رقم، با + اختیاری)."),
  askDocument: m("📷 Now send a clear <b>photo of your ID document</b> (passport or national ID card). JPEG, PNG, WebP, or PDF.", "📷 اکنون یک <b>عکس واضح از مدرک شناسایی</b> (گذرنامه یا کارت ملی) بفرستید. JPEG، PNG، WebP یا PDF."),
  errDocType: m("That file type is not accepted. Send a JPEG, PNG, WebP image or a PDF.", "این نوع فایل پذیرفته نمی‌شود. تصویر JPEG، PNG، WebP یا PDF بفرستید."),
  errDocSize: m("That file is too large. Please send a smaller image or PDF.", "این فایل خیلی بزرگ است. لطفاً تصویر یا PDF کوچک‌تری بفرستید."),
  errDocGeneric: m("We couldn't process that document. Please try sending it again.", "نتوانستیم این مدرک را پردازش کنیم. لطفاً دوباره آن را بفرستید."),
  useButtons: m("Use the Submit or Cancel button below, or send /cancel.", "از دکمهٔ ثبت یا لغو در زیر استفاده کنید، یا /cancel بفرستید."),
  submitted: m("✅ Thank you! Your identity verification was submitted and is now <b>pending admin review</b>.", "✅ سپاس! درخواست احراز هویت شما ثبت شد و اکنون <b>در انتظار بررسی مدیر</b> است."),
  cancelled: m("Identity verification cancelled.", "احراز هویت لغو شد."),
  approvedNotice: m("🎉 Your identity has been <b>approved</b>. Welcome!", "🎉 هویت شما <b>تأیید</b> شد. خوش آمدید!"),
  rejectedNotice: m("Your identity verification was <b>rejected</b>. You can start again with /kyc.", "احراز هویت شما <b>رد</b> شد. می‌توانید با /kyc دوباره شروع کنید."),
};

export const MENU = {
  cards: m("💳 My cards", "💳 کارت‌های من"),
  requests: m("📄 My requests", "📄 درخواست‌های من"),
  addFunds: m("➕ Add funds", "➕ افزایش موجودی"),
  requestCard: m("🆕 Request card", "🆕 درخواست کارت"),
  verify: m("🪪 Verify identity", "🪪 احراز هویت"),
  support: m("💬 Support", "💬 پشتیبانی"),
  language: m("🌐 Language", "🌐 زبان"),
};

export const COMMON = {
  welcome: m("Welcome", "خوش آمدید"),
  chooseOption: m("Choose an option:", "یک گزینه انتخاب کنید:"),
  langPicker: m("🌐 Choose your language:", "🌐 زبان خود را انتخاب کنید:"),
  langEn: m("🇬 English", "🇧 English"),
  langFa: m("🇮🇷 فارسی", "🇮🇷 فارسی"),
  langSetEn: m("Language set to English.", "زبان به English تنظیم شد."),
  langSetFa: m("زبان به فارسی تنظیم شد.", "زبان به فارسی تنظیم شد."),
  approvedMenuHint: m("Tap a button below to continue:", "برای ادامه یک دکمه بزنید:"),
};

// Confirmation summary for the KYC review step (single language).
export function kycConfirmSummary(
  f: { fullName: string; dateOfBirth: string; country: string; nationalId: string; phone: string },
  lang: string | null | undefined,
): string {
  return pick(
    m(
      `<b>Confirm your details</b>\nName: ${f.fullName}\nDate of birth: ${f.dateOfBirth}\nCountry: ${f.country}\nNational ID: ${f.nationalId}\nPhone: ${f.phone}\nDocument: attached\n\nTap <b>Submit</b> to send for admin review.`,
      `<b>تأیید اطلاعات</b>\nنام: ${f.fullName}\nتاریخ تولد: ${f.dateOfBirth}\nکشور: ${f.country}\nکد ملی: ${f.nationalId}\nتلفن: ${f.phone}\nمدرک: پیوست شد\n\nبرای ارسال جهت بررسی، <b>ثبت</b> را بزنید.`,
    ),
    lang,
  );
}
