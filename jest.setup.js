// Jest setup file for React Native SDK tests

// Mock React Native modules
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    Version: '17.0',
    select: jest.fn((options) => options.ios),
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 812, scale: 3 })),
  },
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  NativeModules: {
    RNDeviceInfo: {
      deviceId: 'test-device-id',
      model: 'iPhone 14',
      systemName: 'iOS',
      systemVersion: '17.0',
      appVersion: '1.0.0',
      buildNumber: '1',
      bundleId: 'com.test.app',
      isTablet: false,
      getUniqueId: jest.fn().mockResolvedValue('test-unique-id'),
    },
  },
}));

// Mock react-native-device-info
jest.mock('react-native-device-info', () => ({
  getUniqueId: jest.fn().mockResolvedValue('test-device-id'),
  getModel: jest.fn().mockReturnValue('iPhone 14'),
  getSystemName: jest.fn().mockReturnValue('iOS'),
  getSystemVersion: jest.fn().mockReturnValue('17.0'),
  getVersion: jest.fn().mockReturnValue('1.0.0'),
  getBuildNumber: jest.fn().mockReturnValue('1'),
  getBundleId: jest.fn().mockReturnValue('com.test.app'),
  isTablet: jest.fn().mockReturnValue(false),
  getCarrier: jest.fn().mockResolvedValue('Test Carrier'),
  getDeviceName: jest.fn().mockResolvedValue('Test Device'),
  getManufacturer: jest.fn().mockResolvedValue('Apple'),
  getBrand: jest.fn().mockReturnValue('Apple'),
  getDeviceType: jest.fn().mockReturnValue('Handset'),
  hasNotch: jest.fn().mockReturnValue(true),
  getDeviceId: jest.fn().mockReturnValue('iPhone14,2'),
  isEmulator: jest.fn().mockResolvedValue(false),
  isLandscape: jest.fn().mockResolvedValue(false),
  getApplicationName: jest.fn().mockReturnValue('Test App'),
  getFirstInstallTime: jest.fn().mockResolvedValue(1704067200000),
  getLastUpdateTime: jest.fn().mockResolvedValue(1704067200000),
  getTotalMemory: jest.fn().mockResolvedValue(6000000000),
  getUsedMemory: jest.fn().mockResolvedValue(2000000000),
  getUserAgent: jest.fn().mockResolvedValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'),
}));

// Mock expo-device (optional peer dependency)
jest.mock('expo-device', () => ({
  deviceName: 'Test Device',
  deviceYearClass: 2023,
  isDevice: true,
  brand: 'Apple',
  manufacturer: 'Apple',
  modelName: 'iPhone 14',
  modelId: 'iPhone14,2',
  osName: 'iOS',
  osVersion: '17.0',
  osBuildId: '21A5248v',
  platformApiLevel: null,
  deviceType: 1, // PHONE
}), { virtual: true });

// Mock expo-application (optional peer dependency)
jest.mock('expo-application', () => ({
  applicationName: 'Test App',
  applicationId: 'com.test.app',
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '1',
}), { virtual: true });

// Mock @react-native-community/netinfo
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({
    type: 'wifi',
    isConnected: true,
    isInternetReachable: true,
    details: {
      ssid: 'TestNetwork',
    },
  }),
  addEventListener: jest.fn(() => jest.fn()),
}));

// Mock @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(null),
  getItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
  multiGet: jest.fn().mockResolvedValue([]),
  multiSet: jest.fn().mockResolvedValue(null),
  multiRemove: jest.fn().mockResolvedValue(null),
  getAllKeys: jest.fn().mockResolvedValue([]),
  clear: jest.fn().mockResolvedValue(null),
}));

// Global fetch mock
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: jest.fn().mockResolvedValue({}),
});

// Silence console during tests (optional - comment out for debugging)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   debug: jest.fn(),
// };
