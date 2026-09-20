-- Per-user language preference for the Telegram bot (i18n).
-- NULL = not chosen yet (the bot shows a language picker on first /start).
ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS lang text CHECK (lang IS NULL OR lang IN ('en', 'fa'));
