class OpportunityItem {
  final String title;
  final String? iscoCode;
  final String? incomeRange;
  final String? demandStrength;
  final String? entryBarrier;
  final String? stability;
  final String? reason;
  final List<String> requiredUpskilling;

  const OpportunityItem({
    required this.title,
    this.iscoCode,
    this.incomeRange,
    this.demandStrength,
    this.entryBarrier,
    this.stability,
    this.reason,
    this.requiredUpskilling = const [],
  });

  factory OpportunityItem.fromJson(Map<String, dynamic> json) {
    final upskilling = json['required_upskilling'];
    return OpportunityItem(
      title: json['title'] as String? ?? 'Untitled',
      iscoCode: json['isco_code'] as String?,
      incomeRange: json['income_range'] as String?,
      demandStrength: json['demand_strength'] as String?,
      entryBarrier: json['entry_barrier'] as String?,
      stability: json['stability'] as String?,
      reason: json['reason'] as String?,
      requiredUpskilling: upskilling is List ? upskilling.map((e) => e.toString()).toList() : [],
    );
  }
}

class RankingItem {
  final String opportunity;
  final double score;
  final String? reason;

  const RankingItem({required this.opportunity, required this.score, this.reason});

  factory RankingItem.fromJson(Map<String, dynamic> json) {
    return RankingItem(
      opportunity: json['opportunity'] as String? ?? '',
      score: (json['score'] as num?)?.toDouble() ?? 0,
      reason: json['reason'] as String?,
    );
  }
}

class PolicyView {
  final String? laborGap;
  final String? sectorShortage;
  final String? recommendation;

  const PolicyView({this.laborGap, this.sectorShortage, this.recommendation});

  factory PolicyView.fromJson(Map<String, dynamic> json) {
    return PolicyView(
      laborGap: json['labor_gap_identified'] as String?,
      sectorShortage: json['sector_shortage_signal'] as String?,
      recommendation: json['recommendation_for_government_or_ngos'] as String?,
    );
  }
}

class LaborMarketSignals {
  final String? wageFloor;
  final String? sectorEmployment;
  final String? youthUnemployment;
  final String? neetRate;
  final String? gdpPerCapita;
  final String? selfEmployed;
  final String? digitalInfra;

  const LaborMarketSignals({
    this.wageFloor, this.sectorEmployment, this.youthUnemployment,
    this.neetRate, this.gdpPerCapita, this.selfEmployed, this.digitalInfra,
  });

  factory LaborMarketSignals.fromJson(Map<String, dynamic> json) {
    return LaborMarketSignals(
      wageFloor: json['wage_floor'] as String?,
      sectorEmployment: json['sector_employment_share'] as String?,
      youthUnemployment: json['youth_unemployment_rate'] as String?,
      neetRate: json['neet_rate'] as String?,
      gdpPerCapita: json['gdp_per_capita'] as String?,
      selfEmployed: json['self_employed_share'] as String?,
      digitalInfra: json['digital_infrastructure'] as String?,
    );
  }

  List<MapEntry<String, String>> get entries {
    return [
      if (wageFloor != null && wageFloor != 'Not available') MapEntry('Wage floor', wageFloor!),
      if (youthUnemployment != null && youthUnemployment != 'Not available') MapEntry('Youth unemployment', youthUnemployment!),
      if (neetRate != null && neetRate != 'Not available') MapEntry('NEET rate', neetRate!),
      if (selfEmployed != null && selfEmployed != 'Not available') MapEntry('Self-employed', selfEmployed!),
      if (sectorEmployment != null && sectorEmployment != 'Not available') MapEntry('Sector employment', sectorEmployment!),
      if (gdpPerCapita != null && gdpPerCapita != 'Not available') MapEntry('GDP per capita', gdpPerCapita!),
      if (digitalInfra != null && digitalInfra != 'Not available') MapEntry('Digital infrastructure', digitalInfra!),
    ];
  }
}

class OpportunityResult {
  final String? occupationTitle;
  final String? iscoCode;
  final String? country;
  final String? informalityLevel;
  final LaborMarketSignals signals;
  final List<OpportunityItem> directJobs;
  final List<OpportunityItem> adjacentOpps;
  final List<OpportunityItem> microEnterprise;
  final List<RankingItem> ranking;
  final PolicyView policyView;

  const OpportunityResult({
    this.occupationTitle,
    this.iscoCode,
    this.country,
    this.informalityLevel,
    this.signals = const LaborMarketSignals(),
    this.directJobs = const [],
    this.adjacentOpps = const [],
    this.microEnterprise = const [],
    this.ranking = const [],
    this.policyView = const PolicyView(),
  });

  /// Parses the response from POST /api/module3/opportunities
  /// which returns { opportunities: { ... } }
  factory OpportunityResult.fromJson(Map<String, dynamic> json) {
    final root = json['opportunities'] as Map<String, dynamic>? ?? json;

    final opps = root['opportunities'] as Map<String, dynamic>? ?? {};
    final lmc = root['labor_market_context'] as Map<String, dynamic>? ?? {};
    final sig = lmc['key_economic_signals'] as Map<String, dynamic>? ?? {};
    final rkRaw = root['ranking'] as List? ?? [];
    final pvRaw = root['policy_view'] as Map<String, dynamic>? ?? {};

    List<OpportunityItem> parseList(dynamic raw) {
      if (raw is List) return raw.whereType<Map<String, dynamic>>().map(OpportunityItem.fromJson).toList();
      return [];
    }

    return OpportunityResult(
      occupationTitle: root['occupation_title'] as String?,
      iscoCode: root['isco_code'] as String?,
      country: lmc['country'] as String?,
      informalityLevel: lmc['informality_level'] as String?,
      signals: LaborMarketSignals.fromJson(sig),
      directJobs: parseList(opps['direct']),
      adjacentOpps: parseList(opps['adjacent']),
      microEnterprise: parseList(opps['micro_enterprise']),
      ranking: rkRaw.whereType<Map<String, dynamic>>().map(RankingItem.fromJson).toList(),
      policyView: PolicyView.fromJson(pvRaw),
    );
  }
}
