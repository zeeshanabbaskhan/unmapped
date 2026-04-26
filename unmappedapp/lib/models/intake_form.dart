class IntakeForm {
  final String workDescription;
  final String countryCode;
  final String sector;
  final int experienceYears;
  final String education;
  final List<String> tools;
  final List<String> selectedSkills;
  final List<String> languages;

  const IntakeForm({
    required this.workDescription,
    required this.countryCode,
    required this.sector,
    required this.experienceYears,
    required this.education,
    this.tools = const [],
    this.selectedSkills = const [],
    this.languages = const [],
  });

  Map<String, dynamic> toJson() => {
    'answers': {
      'work_description': workDescription,
      'country_code': countryCode,
      'sector': sector,
      'experience_years': experienceYears,
      'education': education,
      'tools': tools,
      'selected_skills': selectedSkills,
      'languages': languages,
    },
  };
}
