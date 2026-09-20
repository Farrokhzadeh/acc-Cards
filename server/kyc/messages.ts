// Bilingual (English + Persian) message catalog for the Telegram KYC flow.
// Static text only; any user-supplied value must be HTML-escaped by the caller.

export function bi(en: string, fa: string): string {
  return `${en}\n${fa}`;
}

export const KYC = {
  accessDisabled: bi(
    "Your AccAbad access is currently disabled. Contact an administrator.",
    "دسترسی شما به AccAbad غیرفعال است. با یک مدیر تماس بگیرید.",
  ),
  featureDisabled: bi(
    "Identity verification is currently disabled.",
    "احراز هویت در حال حاضر غیرفعال است.",
  ),
  alreadyApproved: bi(
    "✅ Your identity is already verified. Thank you!",
    "✅ هویت شما پیش‌تر تأیید شده است. سپاس!",
  ),
  alreadyPending: bi(
    "⏳ Your identity verification is under review. We'll notify you once an admin approves it.",
    "⏳ درخواست احراز هویت شما در حال بررسی است. پس از تأیید توسط مدیر، به شما اطلاع می‌دهیم.",
  ),
  invite: bi(
    "🪪 <b>Identity verification</b>\nBefore we can activate your account, please verify your identity. It takes about a minute.",
    "🪪 <b>احراز هویت</b>\nپیش از فعال‌سازی حساب شما، لطفاً هویت خود را تأیید کنید. حدود یک دقیقه طول می‌کشد.",
  ),
  inviteButton: "🪪 Start verification / شروع احراز هویت",
  intro: bi(
    "🪪 <b>Identity verification (KYC)</b>\nI'll ask a few questions. Send /cancel at any time to stop.\n\nEnter your <b>full legal name</b> exactly as it appears on your ID.",
    "🪪 <b>احراز هویت</b>\nچند پرسش از شما می‌پرسم. برای لغو، هر زمان /cancel بفرستید.\n\n<b>نام و نام خانوادگی کامل</b> خود را دقیقاً مانند مدرک شناسایی وارد کنید.",
  ),
  askFullName: bi(
    "Enter your full legal name (as on your ID).",
    "نام و نام خانوادگی کامل خود را وارد کنید (مانند مدرک شناسایی).",
  ),
  errFullName: bi(
    "Please enter a name between 3 and 120 characters.",
    "لطفاً نامی بین ۳ تا ۱۲۰ نویسه وارد کنید.",
  ),
  askDob: bi(
    "Enter your date of birth as <code>YYYY-MM-DD</code> (for example <code>1995-04-23</code>).",
    "تاریخ تولد خود را به قالب <code>YYYY-MM-DD</code> وارد کنید (مثلاً <code>1995-04-23</code>).",
  ),
  errDob: bi(
    "Enter a valid past date in <code>YYYY-MM-DD</code> format.",
    "یک تاریخ معتبر و گذشته در قالب <code>YYYY-MM-DD</code> وارد کنید.",
  ),
  askCountry: bi(
    "Enter your country of residence.",
    "کشور محل سکونت خود را وارد کنید.",
  ),
  errCountry: bi(
    "Please enter a country between 2 and 80 characters.",
    "لطفاً کشوری بین ۲ تا ۸۰ نویسه وارد کنید.",
  ),
  askNationalId: bi(
    "Enter your national ID or passport number.",
    "کد ملی یا شماره گذرنامه خود را وارد کنید.",
  ),
  errNationalId: bi(
    "Please enter an ID between 3 and 40 characters.",
    "لطفاً شناسه‌ای بین ۳ تا ۴۰ نویسه وارد کنید.",
  ),
  askPhone: bi(
    "Enter your phone number, including the country code (for example <code>+989121234567</code>).",
    "شماره تلفن خود را با کد کشور وارد کنید (مثلاً <code>+989121234567</code>).",
  ),
  errPhone: bi(
    "Enter a valid phone number (6-20 digits, optional +).",
    "یک شماره تلفن معتبر وارد کنید (۶ تا ۲۰ رقم، با + اختیاری).",
  ),
  askDocument: bi(
    "📷 Now send a clear <b>photo of your ID document</b> (passport or national ID card). JPEG, PNG, WebP, or PDF.",
    "📷 اکنون یک <b>عکس واضح از مدرک شناسایی</b> خود (گذرنامه یا کارت ملی) بفرستید. JPEG، PNG، WebP یا PDF.",
  ),
  errDocType: bi(
    "That file type is not accepted. Send a JPEG, PNG, WebP image or a PDF.",
    "این نوع فایل پذیرفته نمی‌شود. یک تصویر JPEG، PNG، WebP یا یک PDF بفرستید.",
  ),
  errDocSize: bi(
    "That file is too large. Please send a smaller image or PDF.",
    "این فایل خیلی بزرگ است. لطفاً تصویر یا PDF کوچک‌تری بفرستید.",
  ),
  errDocGeneric: bi(
    "We couldn't process that document. Please try sending it again.",
    "نتوانستیم این مدرک را پردازش کنیم. لطفاً دوباره آن را بفرستید.",
  ),
  useButtons: bi(
    "Use the Submit or Cancel button below, or send /cancel.",
    "از دکمهٔ ثبت یا لغو در زیر استفاده کنید، یا /cancel بفرستید.",
  ),
  submitted: bi(
    "✅ Thank you! Your identity verification was submitted and is now <b>pending admin review</b>.",
    "✅ سپاس! درخواست احراز هویت شما ثبت شد و اکنون <b>در انتظار بررسی مدیر</b> است.",
  ),
  cancelled: bi(
    "Identity verification cancelled.",
    "احراز هویت لغو شد.",
  ),
  approvedNotice: bi(
    "🎉 Your identity has been <b>approved</b>. Welcome!",
    "🎉 هویت شما <b>تأیید</b> شد. خوش آمدید!",
  ),
  rejectedNotice: bi(
    "Your identity verification was <b>rejected</b>. You can start again with /kyc.",
    "احراز هویت شما <b>رد</b> شد. می‌توانید با /kyc دوباره شروع کنید.",
  ),
};

// Builds the confirmation summary. All field values must already be HTML-escaped.
export function kycConfirmSummary(f: {
  fullName: string;
  dateOfBirth: string;
  country: string;
  nationalId: string;
  phone: string;
}): string {
  return bi(
    `<b>Confirm your details</b>\nName: ${f.fullName}\nDate of birth: ${f.dateOfBirth}\nCountry: ${f.country}\nNational ID: ${f.nationalId}\nPhone: ${f.phone}\nDocument: attached\n\nTap <b>Submit</b> to send for admin review.`,
    `<b>تأیید اطلاعات</b>\nنام: ${f.fullName}\nتاریخ تولد: ${f.dateOfBirth}\nکشور: ${f.country}\nکد ملی: ${f.nationalId}\nتلفن: ${f.phone}\nمدرک: پیوست شد\n\nبرای ارسال جهت بررسی مدیر، روی <b>ثبت</b> بزنید.`,
  );
}
