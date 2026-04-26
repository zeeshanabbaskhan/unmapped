class TaskRisk {
  final String name;
  final double risk;
  final String? category;

  const TaskRisk({required this.name, required this.risk, this.category});

  factory TaskRisk.fromJson(Map<String, dynamic> json) {
    return TaskRisk(
      name: json['name'] as String? ?? json['task'] as String? ?? 'Unknown',
      risk: (json['risk'] as num?)?.toDouble() ?? (json['score'] as num?)?.toDouble() ?? 0.5,
      category: json['category'] as String?,
    );
  }

  bool get isHighRisk => risk >= 0.6;
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
  final String? scenario;
  final String? occupationTitle;
  final List<TaskRisk> tasks;
  final List<EconSignal> econometricSignals;
  final Map<String, double> uncertaintyBand;
  final String? countryAdjustmentNote;

  const AutomationRisk({
    required this.adjustedRisk,
    required this.baseRisk,
    this.scenario,
    this.occupationTitle,
    this.tasks = const [],
    this.econometricSignals = const [],
    this.uncertaintyBand = const {},
    this.countryAdjustmentNote,
  });

  factory AutomationRisk.fromJson(Map<String, dynamic> json) {
    final tasksRaw = json['task_breakdown'] as List? ?? json['tasks'] as List? ?? [];
    final signalsRaw = json['econometric_signals'] as List? ?? json['signals'] as List? ?? [];
    final band = json['uncertainty_band'] as Map<String, dynamic>? ?? {};

    return AutomationRisk(
      adjustedRisk: (json['adjusted_risk'] as num?)?.toDouble() ?? 0.5,
      baseRisk: (json['base_risk'] as num?)?.toDouble() ?? 0.5,
      scenario: json['scenario'] as String?,
      occupationTitle: json['occupation_title'] as String?,
      tasks: tasksRaw.whereType<Map<String, dynamic>>().map(TaskRisk.fromJson).toList(),
      econometricSignals: signalsRaw.whereType<Map<String, dynamic>>().map(EconSignal.fromJson).toList(),
      uncertaintyBand: band.map((k, v) => MapEntry(k, (v as num).toDouble())),
      countryAdjustmentNote: json['country_adjustment_note'] as String?,
    );
  }

  String get riskLabel {
    if (adjustedRisk >= 0.7) return 'High';
    if (adjustedRisk >= 0.4) return 'Medium';
    return 'Low';
  }
}
