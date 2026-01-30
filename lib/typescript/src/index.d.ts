/**
 * Formo Analytics SDK for React Native
 *
 * Track wallet events and user analytics in mobile dApps
 *
 * @example
 * ```tsx
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * import { FormoAnalyticsProvider, useFormo } from '@formo/react-native-analytics';
 *
 * // Wrap your app with the provider
 * function App() {
 *   return (
 *     <FormoAnalyticsProvider
 *       writeKey="your-write-key"
 *       asyncStorage={AsyncStorage}
 *       options={{
 *         wagmi: { config, queryClient },
 *         app: { name: 'MyApp', version: '1.0.0' },
 *       }}
 *     >
 *       <YourApp />
 *     </FormoAnalyticsProvider>
 *   );
 * }
 *
 * // Use the hook in your components
 * function MyScreen() {
 *   const formo = useFormo();
 *
 *   useEffect(() => {
 *     formo.screen('Home');
 *   }, []);
 *
 *   return <View>...</View>;
 * }
 * ```
 */
export { FormoAnalytics } from "./FormoAnalytics";
export { FormoAnalyticsProvider, FormoAnalyticsContext, useFormo, } from "./FormoAnalyticsProvider";
export * from "./types";
export { SignatureStatus, TransactionStatus } from "./types/events";
export type { AsyncStorageInterface } from "./lib/storage";
//# sourceMappingURL=index.d.ts.map