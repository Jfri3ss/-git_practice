# In-app Stripe Connect onboarding (iOS)

Yes — and this repo now implements it.

Existing Pluse connected accounts already use `controller.requirement_collection = "application"` and `stripe_dashboard.type = "none"`. That is the configuration that lets Stripe’s **embedded** onboarding stay inside the iOS app without a Safari / `ASWebAuthenticationSession` login popover.

```text
iOS PlusePayouts → POST /connect/account-session → StripeConnect AccountOnboardingController
```

Do not open Account Links in a browser. Do not load those URLs in `WKWebView`.

## Run it

1. In `server/stripe-in-app-onboarding/`:

   ```bash
   cp .env.example .env
   # set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY (test keys)
   npm install
   npm start
   ```

   Optional: set `DEMO_STRIPE_ACCOUNT_ID` to an existing Pluse connected account so the app continues that host instead of creating a new one.

2. On a Mac, open `native-ios/StripeInAppOnboarding/PlusePayouts.xcodeproj`, add your signing team, and run on the Simulator. The app talks to `http://127.0.0.1:4242` and presents Stripe onboarding full-screen.

3. Tap **Set up payouts**. The form stays in the app. After you close it, the screen reloads `details_submitted` / `payouts_enabled` / remaining requirements.

## What to copy into the real Pluse app

- Swift package: `native-ios/StripeInAppOnboarding` (add `StripeConnect` via [stripe-ios-spm](https://github.com/stripe/stripe-ios-spm) 26.7+)
- Present `StripeConnectOnboardingCoordinator` from the host payout screen
- Backend: `POST /connect/account-session`, `GET /connect/account-status`, `POST /connect/webhook` for `account.updated`

`disable_stripe_user_authentication` is set on the Account Session. That flag is valid for the accounts Pluse already creates.
