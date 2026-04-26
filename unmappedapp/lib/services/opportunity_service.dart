import '../core/network/api_client.dart';
import '../models/opportunity.dart';

class OpportunityService {
  final ApiClient _api;

  OpportunityService(this._api);

  Future<OpportunityResult> fetchOpportunities({
    required String countryCode,
    required Map<String, dynamic> module1Output,
  }) async {
    final json = await _api.post('/api/module3/opportunities', {
      'country_code': countryCode,
      'module1_output': module1Output,
    });
    return OpportunityResult.fromJson(json);
  }
}
