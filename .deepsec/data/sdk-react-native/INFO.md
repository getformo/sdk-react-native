# sdk-react-native

## What this codebase does

`@formo/analytics-react-native` — a client-side analytics SDK (npm
library) embedded into third-party React Native dApps. It tracks wallet
events (connect / disconnect / signature / transaction / chain), screen
views, and custom events, batches them in `EventQueue`, and POSTs them
to `https://events.formo.so/v0/raw_events`. Optional Wagmi integration
(`WagmiEventHandler`) auto-captures wallet activity. There is **no
server component** in this repo — it is shipped code that runs inside
other people's apps. Classic web vulns (SQLi, SSRF, server authz) mostly
do not apply; data-handling and supply-chain concerns dominate.

## Auth shape

There is no user/session auth. The only credential is the **`writeKey`**
— a *public, write-only* ingest key intentionally bundled into client
apps and sent as `Authorization: Bearer ${writeKey}` via
`EVENTS_API_REQUEST_HEADER` (`constants/config.ts`). Treat it as
non-secret. The relevant gates instead are:

- `hasOptedOutTracking()` / `CONSENT_OPT_OUT_KEY` + `setConsentFlag` /
  `getConsentFlag` / `removeConsentFlag` (`lib/consent`).
- `isBlockedAddress` / `BLOCKED_ADDRESSES` (`utils/address.ts`).
- `validateAddress` (EVM checksum + Solana) before an address is
  attached to any event.

## Threat model

Highest impact: (1) PII / sensitive-data exfiltration — the SDK collects
wallet addresses, the **raw message text being signed**, device info,
deep-link URLs, and UTM/referrer attribution; anything that logs,
persists, or ships a private key or full signature secret is critical.
(2) Consent bypass — events generated or flushed after the user opted
out. (3) Supply-chain / untrusted input — host-app-supplied event
`properties` and deep-link URLs flow into the outbound payload.

## Project-specific patterns to flag

- **Signature capture leaking secrets.** `signature()` /
  `createSignatureEvent` (`EventFactory`) and `WagmiEventHandler`
  mutation tracking store `message` + optional `signatureHash` only.
  Flag any path that captures a private key, mnemonic, or the produced
  signature itself beyond `signatureHash`.
- **Consent-gate bypass.** Every new event entry point must check
  opt-out before `eventQueue.enqueue`, and opt-out must call
  `eventQueue.clear()`. Flag new track paths that skip the consent
  check.
- **Unvalidated address pass-through.** Addresses attached to events
  must go through `validateAddress` / `isBlockedAddress`; flag raw
  user/wallet address used directly in a payload.
- **Untrusted properties / deep-link URLs** merged into event payloads
  (`parseTrafficSource`, `startDeepLinkCapture`, custom `track`
  properties) without sanitization — prototype-pollution or oversized
  payload risk.

## Known false-positives

- `writeKey` in the `Bearer` header / bundled in client config — public
  write-only key by design, **not** a leaked secret.
- `options.apiHost` overriding the ingest endpoint — intended
  self-host/proxy support; not SSRF (runs in the host app's own
  process, configured by that app's developer).
- `generateUUID()` using `Math.random()` (`utils/hash.ts`) — analytics
  dedup/anon IDs, not security tokens. Acceptable.
- **Minute-rounded `message_id` deduplication** (`generateMessageId` →
  `toDateHourMinute`, `lib/event/EventQueue.ts`) — intentional and
  **by design**. This is the *canonical cross-SDK + backend dedup
  contract* shared with `@formo/analytics` (web) and the
  `events.formo.so` ingest pipeline; content-identical events colliding
  within the same wall-clock minute is expected behavior, not a bug. Do
  **not** flag or "fix" this — including the BUG finding
  `other-deduplication-data-loss`. The `message_id` contract may only
  change via coordinated web-SDK + backend + RN sign-off, never as an
  SDK-local patch.
- Unencrypted `AsyncStorage` / `MemoryStorage` fallback — only stores
  anon id + consent flag, non-sensitive by design.
- Hardcoded `SOLANA_SYSTEM_ADDRESSES` / `BLOCKED_ADDRESSES` — public
  constants, not secrets.
- Anything under `src/__tests__/` — fixtures and mocks.
