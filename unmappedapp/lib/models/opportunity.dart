class OpportunityItem {
  final String id;
  final String type;
  final String title;
  final String? incomeRange;
  final String? demandLevel;
  final String? stability;
  final String? rationale;
  final String? iscoCode;
  final double score;
  final List<String> providers;

  const OpportunityItem({
    required this.id,
    required this.type,
    required this.title,
    this.incomeRange,
    this.demandLevel,
    this.stability,
    this.rationale,
    this.iscoCode,
    this.score = 0,
    this.providers = const [],
  });

  factory OpportunityItem.fromJson(Map<String, dynamic> json) {
    final provRaw = json['providers'] as List? ?? [];
    return OpportunityItem(
      id: json['id'] as String? ?? '',
      type: json['type'] as String? ?? 'unknown',
      title: json['title'] as String? ?? json['label'] as String? ?? 'Untitled',
      incomeRange: json['income_range'] as String? ?? json['wage_range'] as String?,
      demandLevel: json['demand_level'] as String? ?? json['demand'] as String?,
      stability: json['stability'] as String?,
      rationale: json['rationale'] as String? ?? json['reason'] as String?,
      iscoCode: json['isco_code'] as String?,
      score: (json['score'] as num?)?.toDouble() ?? 0,
      providers: provRaw.map((e) => e.toString()).toList(),
    );
  }
}

class PolicyInsight {
  final String label;
  final String value;
  final String? detail;

  const PolicyInsight({required this.label, required this.value, this.detail});

  factory PolicyInsight.fromJson(Map<String, dynamic> json) {
    return PolicyInsight(
      label: json['label'] as String? ?? json['indicator'] as String? ?? '',
      value: json['value']?.toString() ?? 'N/A',
      detail: json['detail'] as String?,
    );
  }
}

class OpportunityResult {
  final List<OpportunityItem> opportunities;
  final List<PolicyInsight> youthSignals;
  final List<PolicyInsight> policySignals;
  final String? topOccupation;

  const OpportunityResult({
    this.opportunities = const [],
    this.youthSignals = const [],
    this.policySignals = const [],
    this.topOccupation,
  });

  factory OpportunityResult.fromJson(Map<String, dynamic> json) {
    final oppsRaw = json['opportunities'] as List? ?? json['ranked_opportunities'] as List? ?? [];
    final youthRaw = json['youth_view'] as Map<String, dynamic>? ?? {};
    final policyRaw = json['policymaker_view'] as Map<String, dynamic>? ?? {};

    List<PolicyInsight> parseSignals(Map<String, dynamic> view) {
      final signals = <PolicyInsight>[];
      final econDash = view['econometric_dashboard'] as Map<String, dynamic>?
          ?? view['labor_market_snapshot'] as Map<String, dynamic>?
          ?? view;
      for (final entry in econDash.entries) {
        if (entry.value is Map) continue;
        signals.add(PolicyInsight(
          label: _humanize(entry.key),
          value: entry.value?.toString() ?? 'N/A',
        ));
      }
      return signals;
    }

    return OpportunityResult(
      opportunities: oppsRaw.whereType<Map<String, dynamic>>().map(OpportunityItem.fromJson).toList(),
      youthSignals: parseSignals(youthRaw),
      policySignals: parseSignals(policyRaw),
      topOccupation: json['top_occupation'] as String?,
    );
  }

  List<OpportunityItem> byType(String type) =>
      opportunities.where((o) => o.type == type).toList();

  List<OpportunityItem> get directJobs => opportunities.where((o) =>
      o.type == 'formal_employment' || o.type == 'formal').toList();

  List<OpportunityItem> get adjacentOpps => opportunities.where((o) =>
      o.type == 'training' || o.type == 'upskilling' || o.type == 'gig').toList();

  List<OpportunityItem> get microEnterprise => opportunities.where((o) =>
      o.type == 'self_employment' || o.type == 'microenterprise' || o.type == 'agriculture').toList();
}

String _humanize(String key) {
  return key
      .replaceAll('_', ' ')
      .replaceAllMapped(RegExp(r'(^|\s)\w'), (m) => m[0]!.toUpperCase());
}
