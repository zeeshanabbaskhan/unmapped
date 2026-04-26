class TaskRisk {
  final String name;
  final double risk;

  const TaskRisk({required this.name, required this.risk});

  factory TaskRisk.fromJson(Map<String, dynamic> json) {
    return TaskRisk(
      name: json['task'] as String? ?? json['name'] as String? ?? 'Unknown',
      risk: (json['risk_score'] as num?)?.toDouble() ?? (json['risk'] as num?)?.toDouble() ?? 0.5,
    );
  }

  bool get isHighRisk => risk >= 0.5;
}

class EconSignal {
  final String label;
  final String value;
  final String? unit;

  const EconSignal({required this.label, required this.value, this.unit});

  factory EconSignal.fromJson(Map<String, dynamic> json) {
    return EconSignal(
      label: json['label'] as String? ?? json['indicator'] as String? ?? '',
      value: json['value']?.toString() ?? 'N/A',
      unit: json['unit'] as String?,
    );
  }
}

class AutomationRisk {
  final double adjustedRisk;
  final double baseRisk;
  final String? baseSource;
  final String? occupationTitle;
  final String? iscoCode;
  final List<TaskRisk> highRiskTasks;
  final List<TaskRisk> lowRiskTasks;
  final List<String> atRiskSkills;
  final List<String> durableSkills;
  final List<String> adjacentSkills;
  final List<String> lmicExplanation;
  final String? riskLevel;
  final String? resilienceLevel;
  final String? readinessSummary;
  final String? educationProjection;
  final String? laborShiftTrend;
  final String? economicContextNote;
  final String? analysisProvider;

  const AutomationRisk({
    required this.adjustedRisk,
    required this.baseRisk,
    this.baseSource,
    this.occupationTitle,
    this.iscoCode,
    this.highRiskTasks = const [],
    this.lowRiskTasks = const [],
    this.atRiskSkills = const [],
    this.durableSkills = const [],
    this.adjacentSkills = const [],
    this.lmicExplanation = const [],
    this.riskLevel,
    this.resilienceLevel,
    this.readinessSummary,
    this.educationProjection,
    this.laborShiftTrend,
    this.economicContextNote,
    this.analysisProvider,
  });

  /// Parses the response from POST /api/module2/risk-analysis
  /// which returns { analysis: { ... } }
  factory AutomationRisk.fromJson(Map<String, dynamic> json) {
    final analysis = json['analysis'] as Map<String, dynamic>? ?? json;

    final aa = analysis['automation_analysis'] as Map<String, dynamic>? ?? {};
    final tb = analysis['task_breakdown'] as Map<String, dynamic>? ?? {};
    final sr = analysis['skill_resilience_analysis'] as Map<String, dynamic>? ?? {};
    final ms = analysis['macro_signals'] as Map<String, dynamic>? ?? {};
    final frp = analysis['final_readiness_profile'] as Map<String, dynamic>? ?? {};
    final ec = analysis['economic_context'] as Map<String, dynamic>? ?? {};
    final meta = analysis['_meta'] as Map<String, dynamic>? ?? {};

    List<String> toStringList(dynamic raw) {
      if (raw is List) return raw.map((e) => e.toString()).toList();
      return [];
    }

    List<TaskRisk> parseTasks(dynamic raw) {
      if (raw is List) return raw.whereType<Map<String, dynamic>>().map(TaskRisk.fromJson).toList();
      return [];
    }

    return AutomationRisk(
      adjustedRisk: (aa['adjusted_automation_probability'] as num?)?.toDouble() ?? 0.5,
      baseRisk: (aa['base_automation_probability'] as num?)?.toDouble() ?? 0.5,
      baseSource: aa['base_source'] as String?,
      occupationTitle: analysis['occupation_title'] as String?,
      iscoCode: analysis['isco_code'] as String?,
      highRiskTasks: parseTasks(tb['high_risk_tasks']),
      lowRiskTasks: parseTasks(tb['low_risk_tasks']),
      atRiskSkills: toStringList(sr['at_risk_skills']),
      durableSkills: toStringList(sr['durable_skills']),
      adjacentSkills: toStringList(sr['adjacent_skills']),
      lmicExplanation: toStringList(aa['lmic_adjustment_explanation']),
      riskLevel: frp['risk_level'] as String?,
      resilienceLevel: frp['resilience_level'] as String?,
      readinessSummary: frp['summary'] as String?,
      educationProjection: ms['education_projection'] as String?,
      laborShiftTrend: ms['labor_shift_trend'] as String?,
      economicContextNote: ec['interpretation'] as String?,
      analysisProvider: meta['analysis_provider'] as String?,
    );
  }

  String get riskLabel => riskLevel ?? (adjustedRisk >= 0.7 ? 'High' : adjustedRisk >= 0.4 ? 'Medium' : 'Low');
}
