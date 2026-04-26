class Country {
  final String code;
  final String name;
  final String? region;

  const Country({required this.code, required this.name, this.region});

  factory Country.fromJson(Map<String, dynamic> json) {
    return Country(
      code: (json['country_code'] as String?)
              ?? (json['code'] as String?)
              ?? (json['iso2'] as String?)
              ?? '',
      name: (json['country_name'] as String?)
              ?? (json['name'] as String?)
              ?? '',
      region: json['region'] as String?,
    );
  }
}
