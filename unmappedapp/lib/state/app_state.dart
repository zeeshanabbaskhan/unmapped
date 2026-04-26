import 'package:flutter/foundation.dart';
import '../core/network/api_client.dart';
import '../core/network/api_config.dart';
import '../models/country.dart';
import '../models/skill_profile.dart';
import '../models/automation_risk.dart';
import '../models/opportunity.dart';
import '../models/intake_form.dart';
import '../services/country_service.dart';
import '../services/opportunity_service.dart';

class AppState extends ChangeNotifier {
  final ApiClient _api;
  late final CountryService _countryService;
  late final OpportunityService _opportunityService;

  AppState()
      : _api = ApiClient(baseUrl: ApiConfig.baseUrl) {
    _countryService = CountryService(_api);
    _opportunityService = OpportunityService(_api);
  }

  // --- Countries ---
  List<Country> _countries = [];
  List<Country> get countries => _countries;
  String _selectedCountry = 'GH';
  String get selectedCountry => _selectedCountry;
  bool _countriesLoading = false;
  bool get countriesLoading => _countriesLoading;

  // --- Profile (Module 1) ---
  SkillProfile? _profile;
  SkillProfile? get profile => _profile;
  bool _profileLoading = false;
  bool get profileLoading => _profileLoading;
  String? _profileError;
  String? get profileError => _profileError;
  Map<String, dynamic>? _lastProfileRaw;

  // --- Risk (Module 2) ---
  AutomationRisk? _risk;
  AutomationRisk? get risk => _risk;
  bool _riskLoading = false;
  bool get riskLoading => _riskLoading;
  String? _riskError;
  String? get riskError => _riskError;
  Map<String, dynamic>? _lastRiskRaw;

  // --- Opportunities (Module 3) ---
  OpportunityResult? _opportunities;
  OpportunityResult? get opportunities => _opportunities;
  bool _opportunitiesLoading = false;
  bool get opportunitiesLoading => _opportunitiesLoading;
  String? _opportunitiesError;
  String? get opportunitiesError => _opportunitiesError;

  // --- Last intake ---
  IntakeForm? _lastIntake;
  IntakeForm? get lastIntake => _lastIntake;

  Future<void> loadCountries() async {
    _countriesLoading = true;
    notifyListeners();
    try {
      _countries = await _countryService.fetchCountries();
      if (_countries.isNotEmpty && !_countries.any((c) => c.code == _selectedCountry)) {
        _selectedCountry = _countries.first.code;
      }
    } catch (_) {
      _countries = const [
        Country(code: 'GH', name: 'Ghana'),
        Country(code: 'BD', name: 'Bangladesh'),
      ];
    }
    _countriesLoading = false;
    notifyListeners();
  }

  void selectCountry(String code) {
    if (code == _selectedCountry) return;
    _selectedCountry = code;
    _profile = null;
    _risk = null;
    _opportunities = null;
    _profileError = null;
    _riskError = null;
    _opportunitiesError = null;
    _lastProfileRaw = null;
    _lastRiskRaw = null;
    notifyListeners();
  }

  Map<String, dynamic>? get profilePayload {
    return _lastProfileRaw?['profile'] as Map<String, dynamic>?;
  }

  Future<void> generateProfile(IntakeForm form) async {
    _profileLoading = true;
    _profileError = null;
    _lastIntake = form;
    notifyListeners();
    try {
      final json = await _api.post('/api/module1/profile', form.toJson());
      _lastProfileRaw = json;
      _profile = SkillProfile.fromJson(json);
      _risk = null;
      _opportunities = null;
      _lastRiskRaw = null;
    } on ApiException catch (e) {
      _profileError = e.message;
    } catch (e) {
      _profileError = 'Failed to generate profile.';
    }
    _profileLoading = false;
    notifyListeners();
  }

  Future<void> fetchRisk() async {
    final p = profilePayload;
    if (p == null) {
      _riskError = 'Generate a skills profile first.';
      notifyListeners();
      return;
    }
    _riskLoading = true;
    _riskError = null;
    notifyListeners();
    try {
      final json = await _api.post('/api/module2/risk-analysis', {
        'country_code': _selectedCountry,
        'profile': p,
      });
      _lastRiskRaw = json;
      _risk = AutomationRisk.fromJson(json);
    } on ApiException catch (e) {
      _riskError = e.message;
    } catch (e) {
      _riskError = 'Failed to fetch risk data.';
    }
    _riskLoading = false;
    notifyListeners();
  }

  Future<void> fetchOpportunities() async {
    final p = profilePayload;
    if (p == null) {
      _opportunitiesError = 'Generate a skills profile first.';
      notifyListeners();
      return;
    }
    _opportunitiesLoading = true;
    _opportunitiesError = null;
    notifyListeners();
    try {
      final module2Analysis = _lastRiskRaw?['analysis'] as Map<String, dynamic>?;
      _opportunities = await _opportunityService.fetchOpportunities(
        countryCode: _selectedCountry,
        profile: p,
        module2: module2Analysis,
      );
    } on ApiException catch (e) {
      _opportunitiesError = e.message;
    } catch (e) {
      _opportunitiesError = 'Failed to fetch opportunities.';
    }
    _opportunitiesLoading = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _api.dispose();
    super.dispose();
  }
}
