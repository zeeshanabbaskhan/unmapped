import '../core/network/api_client.dart';
import '../models/opportunity.dart';

class OpportunityService {
  final ApiClient _api;

  OpportunityService(this._api);

  /// Sends Module 1 profile + optional Module 2 analysis to Module 3.
  /// The new opportunity-engine.js expects { profile, module2, country_code }.
  Future<OpportunityResult> fetchOpportunities({
    required String countryCode,
    required Map<String, dynamic> profile,
    Map<String, dynamic>? module2,
  }) async {
    final json = await _api.post('/api/module3/opportunities', {
      'country_code': countryCode,
      'profile': profile,
      if (module2 != null) 'module2': module2,
    });
    return OpportunityResult.fromJson(json);
  }
}
