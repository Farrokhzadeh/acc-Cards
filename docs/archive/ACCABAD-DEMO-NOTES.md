# AccAbad Admin demo notes

This build reflects the current AccAbad product direction for demo purposes.

## Account balance

- Keep the Kripicard **account balance visible** in the admin UI for future workflows.
- Demo account balances are currently `$0.00` and are explicitly labeled as informational/future-use state.
- Current **card creation** and **card funding** do not debit the account balance. They continue to use the separate admin crypto-payment demo flow.
- There is no user-facing action to fund an account.
- Do not present the displayed account balance as a verified live provider balance until a provider endpoint/contract supports it.

## Email / inbox direction

- AccAbad should not depend on an AccAbad-owned custom email domain.
- Supported mailbox providers for this demo are **Outlook/Hotmail** and **Gmail only**.
- Each Kripicard account is associated with one separately created external mailbox.
- The panel stores the provider, mailbox address, connector state, and last-sync metadata.
- Outlook/Hotmail inbox access should use Microsoft Graph with OAuth.
- Gmail inbox access should use the Gmail API with OAuth.
- Do not use mailbox passwords for automated inbox access when OAuth is available.
- No additional mailbox providers are exposed in the demo.
- Provider selection should follow the upstream service's accepted-email rules and applicable terms; do not build automatic provider rotation to bypass explicit restrictions.

## Other demo limitations

- The Telegram bot is still not implemented; bot settings and conversations are simulated.
- Crypto payment addresses are demo placeholders and must never receive real funds.
- The inbox contains demo data only; no mailbox connector is live yet.
- Direct crypto-to-card settlement remains a product/demo workflow until the production Kripicard contract confirms the exact operation.
