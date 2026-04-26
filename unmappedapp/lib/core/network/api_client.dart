import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  ApiException(this.message, {this.statusCode});

  @override
  String toString() => 'ApiException: $message (status: $statusCode)';
}

class ApiClient {
  final String baseUrl;
  final http.Client _client;
  static const _timeout = Duration(seconds: 15);

  ApiClient({required this.baseUrl}) : _client = http.Client();

  Future<Map<String, dynamic>> get(String path) async {
    try {
      final response = await _client
          .get(Uri.parse('$baseUrl$path'))
          .timeout(_timeout);
      return _handleResponse(response);
    } on TimeoutException {
      throw ApiException('Request timed out. Check your connection.');
    } on SocketException {
      throw ApiException('No internet connection.');
    }
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    try {
      final response = await _client
          .post(
            Uri.parse('$baseUrl$path'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(body),
          )
          .timeout(_timeout);
      return _handleResponse(response);
    } on TimeoutException {
      throw ApiException('Request timed out. Check your connection.');
    } on SocketException {
      throw ApiException('No internet connection.');
    }
  }

  Map<String, dynamic> _handleResponse(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) return decoded;
      return {'data': decoded};
    }
    throw ApiException(
      'Server error: ${response.reasonPhrase ?? 'Unknown'}',
      statusCode: response.statusCode,
    );
  }

  void dispose() => _client.close();
}
