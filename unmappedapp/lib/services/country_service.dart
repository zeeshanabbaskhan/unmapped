import '../core/network/api_client.dart';
import '../models/country.dart';

class CountryService {
  final ApiClient _api;

  CountryService(this._api);

  Future<List<Country>> fetchCountries() async {
    final json = await _api.get('/api/countries');
    final list = json['countries'] as List? ?? json['data'] as List? ?? [];
    return list.whereType<Map<String, dynamic>>().map(Country.fromJson).toList();
  }

  Future<Map<String, dynamic>> fetchConfig(String countryCode) async {
    return _api.get('/api/config/$countryCode');
  }
}
