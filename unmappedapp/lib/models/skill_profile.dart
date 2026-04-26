class MappedSkill {
  final String label;
  final String? escoUri;
  final double matchScore;
  final String? matchReason;

  const MappedSkill({
    required this.label,
    this.escoUri,
    this.matchScore = 0,
    this.matchReason,
  });

  factory MappedSkill.fromJson(Map<String, dynamic> json) {
    return MappedSkill(
      label: json['plain_label'] as String? ?? json['label'] as String? ?? json['name'] as String? ?? 'Unknown skill',
      escoUri: json['esco_uri'] as String?,
      matchScore: (json['match_score'] as num?)?.toDouble() ?? 0,
      matchReason: json['match_reason'] as String?,
    );
  }
}

class Occupation {
  final String title;
  final String? iscoCode;
  final double? matchScore;
  final String? matchReason;
  final double? automationRiskBase;

  const Occupation({
    required this.title,
    this.iscoCode,
    this.matchScore,
    this.matchReason,
    this.automationRiskBase,
  });

  factory Occupation.fromJson(Map<String, dynamic> json) {
    return Occupation(
      title: json['title'] as String? ?? 'Unknown occupation',
      iscoCode: json['isco_code'] as String? ?? json['isco'] as String?,
      matchScore: (json['match_score'] as num?)?.toDouble(),
      matchReason: json['match_reason'] as String?,
      automationRiskBase: (json['automation_risk_base'] as num?)?.toDouble(),
    );
  }
}

class Confidence {
  final String level;
  final String? caveat;
  final String? extractionMethod;

  const Confidence({required this.level, this.caveat, this.extractionMethod});

  factory Confidence.fromJson(Map<String, dynamic> json) {
    return Confidence(
      level: json['level'] as String? ?? 'unknown',
      caveat: json['caveat'] as String?,
      extractionMethod: json['extraction_method'] as String?,
    );
  }
}

class SkillProfile {
  final Occupation primaryOccupation;
  final List<Occupation> alternativeOccupations;
  final List<MappedSkill> mappedSkills;
  final List<String> unmappedSkills;
  final Confidence confidence;
  final String? summary;

  const SkillProfile({
    required this.primaryOccupation,
    this.alternativeOccupations = const [],
    this.mappedSkills = const [],
    this.unmappedSkills = const [],
    required this.confidence,
    this.summary,
  });

  factory SkillProfile.fromJson(Map<String, dynamic> json) {
    final profile = json['profile'] as Map<String, dynamic>? ?? json;

    final primaryJson = profile['primary_occupation'] as Map<String, dynamic>?
        ?? profile['final_selection'] as Map<String, dynamic>?
        ?? {};

    final skillsRaw = profile['skills'];
    List<MappedSkill> mapped = [];
    List<String> unmapped = [];

    if (skillsRaw is Map<String, dynamic>) {
      final mappedList = skillsRaw['mapped'];
      if (mappedList is List) {
        mapped = mappedList
            .whereType<Map<String, dynamic>>()
            .map(MappedSkill.fromJson)
            .toList();
      }
      final unmappedList = skillsRaw['local_unmapped'];
      if (unmappedList is List) {
        unmapped = unmappedList.map((e) => e.toString()).toList();
      }
    } else if (skillsRaw is List) {
      mapped = skillsRaw
          .whereType<Map<String, dynamic>>()
          .map(MappedSkill.fromJson)
          .toList();
    }

    final altsRaw = profile['alternative_occupations'];
    List<Occupation> alts = [];
    if (altsRaw is List) {
      alts = altsRaw.whereType<Map<String, dynamic>>().map(Occupation.fromJson).toList();
    }

    final confJson = profile['confidence'] as Map<String, dynamic>? ?? {};

    return SkillProfile(
      primaryOccupation: Occupation.fromJson(primaryJson),
      alternativeOccupations: alts,
      mappedSkills: mapped,
      unmappedSkills: unmapped,
      confidence: Confidence.fromJson(confJson),
      summary: profile['summary'] as String?,
    );
  }
}
