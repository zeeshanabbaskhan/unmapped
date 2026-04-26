import 'package:flutter/foundation.dart';

class ApiConfig {
  static const String _envBaseUrl = String.fromEnvironment('API_BASE_URL');

  // Web runs in browser, so localhost is correct.
  // Android emulator needs 10.0.2.2 to reach host machine.
  static String get defaultBaseUrl => kIsWeb
      ? 'http://localhost:4000'
      : 'http://10.0.2.2:4000';

  static String get baseUrl =>
      _envBaseUrl.isNotEmpty ? _envBaseUrl : defaultBaseUrl;
}
