import '../core/network/api_client.dart';
import '../models/automation_risk.dart';

class RiskService {
  final ApiClient _api;

  RiskService(this._api);

  /// Sends the full Module 1 profile to the Module 2 risk analysis endpoint.
  Future<AutomationRisk> fetchRisk({
    required String countryCode,
    required Map<String, dynamic> profile,
  }) async {
    final json = await _api.post('/api/module2/risk-analysis', {
      'country_code': countryCode,
      'profile': profile,
    });
    return AutomationRisk.fromJson(json);
  }
}
