# In-app Stripe Connect onboarding (iOS)

Yes. You can complete Stripe seller/host setup inside the iOS app without opening Safari or an `ASWebAuthenticationSession` / `SFSafariViewController` popover.

The current browser flow is **Stripe-hosted onboarding** (Account Links). Stripe does not support that flow in a webview, so the app has to leave for a browser.

The replacement is **Connect embedded onboarding** via the official `StripeConnect` iOS SDK. The app presents Stripe’s onboarding controller full-screen. You keep Stripe’s KYC, identity, and bank collection — you layer Pluse chrome and branding on top of it.

```text
Old: iOS → your API creates Account Link → Safari / browser popover → Stripe-hosted form
New: iOS → your API creates Account Session → StripeConnect SDK presents in-app → Stripe form stays in Pluse
```

## What this is not

- Do **not** load an Account Link URL in `WKWebView`. Hosted onboarding is unsupported there.
- Do **not** rebuild every KYC field yourself (API onboarding). Stripe’s requirements change by country and you would own that forever.
- This is **not** a zero-WebView guarantee at the SDK layer. Stripe’s iOS controller is an official in-app component (their `ConnectComponentWebViewController` inside a `UINavigationController`). It is not Safari and not a browser popover.

To keep Stripe from showing a **login** browser popover, connected accounts must let the **platform** collect requirements, and the Account Session must set:

```text
components.account_onboarding.features.disable_stripe_user_authentication = true
```

That flag is only valid when `controller.requirement_collection = "application"`. Express-style accounts (Stripe collects requirements) will still hit Stripe login.

## iOS drop-in

1. Add the **StripeConnect** product from [stripe-ios-spm](https://github.com/stripe/stripe-ios-spm) (iOS 15+).
2. Add `NSCameraUsageDescription` from `native-ios/StripeInAppOnboarding/Info.plist.keys`.
3. Present `StripeConnectOnboardingCoordinator` from the payout setup screen. See `native-ios/StripeInAppOnboarding/`.

The coordinator:

- Asks your backend for an Account Session `client_secret`
- Presents `AccountOnboardingController` full-screen
- On exit, reloads `details_submitted` / `payouts_enabled` / remaining requirements

## Backend change

Stop creating Account Links for this flow. Create an [Account Session](https://docs.stripe.com/api/account_sessions/create) with `account_onboarding` enabled.

Sample API:

- `POST /connect/account-session` → `{ clientSecret }`
- `GET /connect/account-status` → payout readiness

See `server/stripe-in-app-onboarding/`.

## After the user closes the sheet

`accountOnboardingDidExit` only means they left the form. Check the Account:

- `details_submitted`
- `payouts_enabled`
- `requirements.currently_due`

If anything is still due, present the same in-app controller again. Listen for `account.updated` (or Accounts v2 requirement events) so you can send them back later without inventing per-field UI.
