import '../core/network/api_client.dart';
import '../models/automation_risk.dart';

class RiskService {
  final ApiClient _api;

  RiskService(this._api);

  Future<AutomationRisk> fetchRisk({
    required String countryCode,
    required String occupationTitle,
    double? automationRiskBase,
    String scenario = 'current',
  }) async {
    final json = await _api.post('/api/module2/automation-risk', {
      'country_code': countryCode,
      'scenario': scenario,
      'occupation': {
        'title': occupationTitle,
        if (automationRiskBase != null) 'automation_risk_base': automationRiskBase,
      },
    });
    return AutomationRisk.fromJson(json);
  }
}
