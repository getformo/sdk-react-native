# @formo/analytics-react-native

Formo Analytics SDK for React Native - Track wallet events and user analytics in mobile dApps.

## Installation

```bash
pnpm add @formo/analytics-react-native @react-native-async-storage/async-storage
```

### iOS Setup

```bash
cd ios && pod install
```

### Android Setup (web-to-mobile attribution)

To attribute installs to where the user came from (e.g. a link on `example.com`
→ Play Store → install), install the Play Install Referrer module and rebuild
the native app:

```bash
pnpm add react-native-play-install-referrer
cd android && ./gradlew clean && cd ..   # then rebuild, e.g. npx expo run:android
```

This is an **optional** peer dependency. Without it the SDK still works, but
Android install attribution is skipped (the SDK logs a warning on startup) and
`Application Installed` events will not carry `referrer` / `utm_*`.

Point your marketing links at the Play Store with a `referrer` parameter, e.g.:

```
https://play.google.com/store/apps/details?id=<your.package>&referrer=utm_source%3Dexample.com%26utm_campaign%3Dspring
```

<sub>iOS note: Apple exposes no install-referrer API, so web-to-mobile install
attribution is not possible on iOS from the SDK. It requires a third-party
attribution service (Branch/AppsFlyer).</sub>

## Quick Start

### 1. Wrap your app with the provider

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FormoAnalyticsProvider } from '@formo/analytics-react-native';

function App() {
  return (
    <FormoAnalyticsProvider
      writeKey="your-write-key"
      asyncStorage={AsyncStorage}
      options={{
        app: {
          name: 'MyApp',
          version: '1.0.0',
        },
      }}
    >
      <YourApp />
    </FormoAnalyticsProvider>
  );
}
```

### 2. Use the hook in your components

```tsx
import { useFormo } from '@formo/analytics-react-native';
import { useEffect } from 'react';

function HomeScreen() {
  const formo = useFormo();

  useEffect(() => {
    // Track screen view
    formo.screen('Home');
  }, []);

  const handleSignUp = () => {
    // Track custom event
    formo.track('Sign Up Button Pressed', {
      screen: 'Home',
    });
  };

  return <Button onPress={handleSignUp}>Sign Up</Button>;
}
```

## Wagmi Integration

For dApps using Wagmi for wallet connections, you can enable automatic wallet event tracking:

```tsx
import { QueryClient } from '@tanstack/react-query';
import { createConfig } from 'wagmi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FormoAnalyticsProvider } from '@formo/analytics-react-native';

const queryClient = new QueryClient();
const wagmiConfig = createConfig({
  // your wagmi config
});

function App() {
  return (
    <FormoAnalyticsProvider
      writeKey="your-write-key"
      asyncStorage={AsyncStorage}
      options={{
        wagmi: {
          config: wagmiConfig,
          queryClient: queryClient,
        },
      }}
    >
      <YourApp />
    </FormoAnalyticsProvider>
  );
}
```

This automatically tracks:
- Wallet connections and disconnections
- Chain changes
- Signature requests (with QueryClient)
- Transaction events (with QueryClient)

## API Reference

### FormoAnalyticsProvider Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `writeKey` | `string` | Yes | Your Formo write key |
| `asyncStorage` | `AsyncStorageInterface` | Yes | AsyncStorage instance |
| `options` | `Options` | No | Configuration options |
| `disabled` | `boolean` | No | Disable analytics |

### Options

```typescript
interface Options {
  // Wagmi integration
  wagmi?: {
    config: any;      // Wagmi config from createConfig()
    queryClient?: any; // TanStack QueryClient for mutation tracking
  };

  // App information
  app?: {
    name?: string;
    version?: string;
    build?: string;
    bundleId?: string;
  };

  // Event batching
  flushAt?: number;       // Batch size (default: 20)
  flushInterval?: number; // Flush interval in ms (default: 30000)
  retryCount?: number;    // Retry count (default: 3)
  maxQueueSize?: number;  // Max queue size in bytes (default: 500KB)

  // Autocapture control
  autocapture?: boolean | {
    connect?: boolean;
    disconnect?: boolean;
    signature?: boolean;
    transaction?: boolean;
    chain?: boolean;
  };

  // Tracking control
  tracking?: boolean | {
    excludeChains?: number[];
    excludeQueryParams?: string[]; // see "Filter URLs" below
  };

  // Logging
  logger?: {
    enabled?: boolean;
    levels?: ('debug' | 'info' | 'warn' | 'error' | 'log')[];
  };

  // Custom API host
  apiHost?: string;

  // Filter the URLs the SDK stores or reports (see "Filter URLs" below)
  sanitizeUrl?: (url: string) => string;

  // Ready callback
  ready?: (formo: IFormoAnalytics) => void;
}
```

### Filter URLs

The SDK reads deep links and the launch URL for attribution. It reports them
in `Deep Link Opened` and `Application Opened`, and it saves the last link as
the `referrer` of later events. Some links carry values that must not reach
analytics, for example an OAuth callback with a `code` and a `state`.

There are two controls. They apply to deep links, the launch URL, the Android
Play install referrer, the saved referrer, and the `url` property of each
event.

#### Remove query parameters: `tracking.excludeQueryParams`

List the parameter names to remove. This is the same option as in the web SDK.

```tsx
options={{
  tracking: {
    excludeQueryParams: ['token', 'access_token', 'email', 'signature'],
  },
}}
```

Names match without regard to case. The URL fragment (after `#`) is not
changed.

These parameters are always removed, with or without configuration:

- `privy_oauth_code`
- `privy_oauth_state`
- `privy_oauth_provider`

#### Drop or rewrite a link: `sanitizeUrl`

`excludeQueryParams` removes parameters, but the link is still reported. To
ignore a link fully, or for a rule that a list of names cannot express, use
`sanitizeUrl`. Return the URL to use, or an empty string to drop it:

```tsx
options={{
  sanitizeUrl: (url) => {
    // Ignore sign-in callbacks.
    if (url.includes('privy_oauth_code=')) return '';
    return url;
  },
}}
```

When the result is an empty string:

- The SDK ignores the deep link. It sends no `Deep Link Opened` event and does
  not change the saved attribution, so the campaign that came before stays.
- `Application Opened` is sent without the `url` property.
- The `url` property and the `referrer` context field are removed from the
  event.

The function receives the URL as it arrived. The excluded parameters are then
removed from its result. The function must be synchronous. The SDK can call it
more than once for the same URL, so the result must not change when the
function is applied again. If the function throws or does not return a string,
the SDK drops the URL.

On Android, the saved referrer can be the Play install referrer. This value is
a query string (`utm_source=...&utm_medium=...`) and not a full URL.

### useFormo Hook Methods

#### `screen(name, properties?, context?, callback?)`
Track a screen view.

```typescript
formo.screen('Profile', { userId: '123' });
```

#### `track(event, properties?, context?, callback?)`
Track a custom event.

```typescript
formo.track('Purchase Completed', {
  revenue: 99.99,
  currency: 'USD',
  productId: 'nft-001',
});
```

#### `identify(params, properties?, context?, callback?)`
Identify a user by their wallet address.

```typescript
formo.identify({
  address: '0x1234...',
  userId: 'user-123',
  providerName: 'MetaMask',
  rdns: 'io.metamask',
});
```

#### `connect(params, properties?, context?, callback?)`
Track wallet connection.

```typescript
formo.connect({
  chainId: 1,
  address: '0x1234...',
});
```

#### `disconnect(params?, properties?, context?, callback?)`
Track wallet disconnection.

```typescript
formo.disconnect({
  chainId: 1,
  address: '0x1234...',
});
```

#### `chain(params, properties?, context?, callback?)`
Track chain change.

```typescript
formo.chain({
  chainId: 137,
  address: '0x1234...',
});
```

#### `signature(params, properties?, context?, callback?)`
Track signature event.

```typescript
import { SignatureStatus } from '@formo/analytics-react-native';

formo.signature({
  status: SignatureStatus.CONFIRMED,
  chainId: 1,
  address: '0x1234...',
  message: 'Sign this message',
  signatureHash: '0xabcd...',
});
```

#### `transaction(params, properties?, context?, callback?)`
Track transaction event.

```typescript
import { TransactionStatus } from '@formo/analytics-react-native';

formo.transaction({
  status: TransactionStatus.BROADCASTED,
  chainId: 1,
  address: '0x1234...',
  to: '0x5678...',
  value: '1000000000000000000',
  transactionHash: '0xdef...',
});
```

#### Consent Management

```typescript
// Opt out of tracking (GDPR compliance)
formo.optOutTracking();

// Check opt-out status
const isOptedOut = formo.hasOptedOutTracking();

// Opt back in
formo.optInTracking();
```

## Event Types

The SDK automatically enriches events with mobile-specific context:

- Device information (OS, version, model)
- Screen dimensions and density
- Locale and timezone
- App information (if provided)
- Anonymous ID (persistent across sessions)

## Offline Support

Events are queued locally and sent when the device has network connectivity. Events are automatically flushed when:

- The batch size is reached (default: 20 events)
- The flush interval passes (default: 30 seconds)
- The app goes to background

## License

MIT
