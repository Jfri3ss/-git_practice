# In-app Stripe Connect onboarding (iOS)

Hosts finish payout setup inside Pluse with visible progress, so they don't drop off at a browser handoff.

## Retention-focused UX

- **Progress bar + step checklist** (business, personal details, identity, bank, terms)
- **Continue where you left off** — button label reflects the next incomplete step
- **Under-review state** when Stripe is verifying but nothing else is due
- **Setup validation** — `GET /connect/setup-validation` lists what still blocks payouts

## Run it

1. `server/stripe-in-app-onboarding`: copy `.env.example` → `.env`, set Stripe keys, `npm start`
2. Open `native-ios/StripeInAppOnboarding/PlusePayouts.xcodeproj` on a Mac and run the Simulator
3. Pull to refresh after closing Stripe onboarding to see updated progress

## API

| Endpoint | Purpose |
|----------|---------|
| `POST /connect/account-session` | Client secret for in-app StripeConnect UI |
| `GET /connect/account-status` | Status + `progress` object for the checklist |
| `GET /connect/setup-validation` | Whether payouts are correctly configured |
| `POST /connect/webhook` | `account.updated` → refresh stored account mapping |

Copy the Swift package into real Pluse `native-ios/` and replace Account Link browser flows with `StripeConnectOnboardingCoordinator`.
