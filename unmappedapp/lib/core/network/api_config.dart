class ApiConfig {
  // For Android emulator use 10.0.2.2; for physical device use your LAN IP
  static const String defaultBaseUrl = 'http://10.0.2.2:4000';

  static String baseUrl = const String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: defaultBaseUrl,
  );
}
