import React, { FC } from "react";
import { AsyncStorageInterface } from "./lib/storage";
import { FormoAnalyticsProviderProps, IFormoAnalytics } from "./types";
export declare const FormoAnalyticsContext: React.Context<IFormoAnalytics>;
export interface FormoAnalyticsProviderPropsWithStorage extends FormoAnalyticsProviderProps {
    /**
     * AsyncStorage instance from @react-native-async-storage/async-storage
     * Required for persistent storage
     */
    asyncStorage?: AsyncStorageInterface;
    /**
     * Callback when SDK is ready
     * Note: Use useCallback to avoid re-initialization on every render
     */
    onReady?: (sdk: IFormoAnalytics) => void;
    /**
     * Callback when SDK initialization fails
     * Note: Use useCallback to avoid re-initialization on every render
     */
    onError?: (error: Error) => void;
}
/**
 * Formo Analytics Provider for React Native
 *
 * Wraps your app to provide analytics context
 *
 * @example
 * ```tsx
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * import { FormoAnalyticsProvider } from '@formo/react-native-analytics';
 *
 * function App() {
 *   return (
 *     <FormoAnalyticsProvider
 *       writeKey="your-write-key"
 *       asyncStorage={AsyncStorage}
 *       options={{ wagmi: { config, queryClient } }}
 *     >
 *       <YourApp />
 *     </FormoAnalyticsProvider>
 *   );
 * }
 * ```
 */
export declare const FormoAnalyticsProvider: FC<FormoAnalyticsProviderPropsWithStorage>;
/**
 * Hook to access Formo Analytics
 *
 * @example
 * ```tsx
 * import { useFormo } from '@formo/react-native-analytics';
 *
 * function MyScreen() {
 *   const formo = useFormo();
 *
 *   useEffect(() => {
 *     formo.screen('Home');
 *   }, []);
 *
 *   const handleButtonPress = () => {
 *     formo.track('Button Pressed', { buttonName: 'signup' });
 *   };
 *
 *   return <Button onPress={handleButtonPress}>Sign Up</Button>;
 * }
 * ```
 */
export declare const useFormo: () => IFormoAnalytics;
//# sourceMappingURL=FormoAnalyticsProvider.d.ts.map