import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../models/intake_form.dart';
import '../../state/app_state.dart';

const _educationLevels = [
  ('none', 'No formal education'),
  ('primary', 'Primary'),
  ('lower_secondary', 'Lower secondary'),
  ('upper_secondary', 'Upper secondary'),
  ('post_secondary', 'Post-secondary / Vocational'),
  ('bachelor', 'Bachelor degree'),
  ('master', 'Master degree or higher'),
];

const _sectors = [
  ('agriculture', 'Agriculture'),
  ('manufacturing', 'Manufacturing'),
  ('construction', 'Construction'),
  ('retail_trade', 'Retail / Trade'),
  ('hospitality', 'Hospitality / Food'),
  ('technical_services', 'Technical Services'),
  ('transport', 'Transport'),
  ('domestic_work', 'Domestic Work'),
  ('health', 'Health'),
  ('education', 'Education'),
  ('ict', 'ICT / Digital'),
  ('creative', 'Creative / Arts'),
  ('other', 'Other'),
];

const _commonSkills = [
  'Customer service',
  'Phone repair',
  'Sewing / Tailoring',
  'Driving',
  'Cooking',
  'Farming',
  'Carpentry',
  'Welding',
  'Teaching',
  'Sales',
  'Data entry',
  'Social media',
];

class HomeScreen extends StatefulWidget {
  final VoidCallback onProfileGenerated;
  const HomeScreen({super.key, required this.onProfileGenerated});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _descController = TextEditingController();
  String _education = 'upper_secondary';
  String _sector = 'other';
  int _years = 1;
  final Set<String> _selectedSkills = {};
  final Set<String> _languages = {'English'};
  String? _localValidationError;

  @override
  void dispose() {
    _descController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final descError = _validateWorkDescription(_descController.text);
    if (descError != null) {
      setState(() => _localValidationError = descError);
      return;
    }

    setState(() => _localValidationError = null);
    final state = context.read<AppState>();
    final form = IntakeForm(
      workDescription: _descController.text.trim(),
      countryCode: state.selectedCountry,
      sector: _sector,
      experienceYears: _years,
      education: _education,
      selectedSkills: _selectedSkills.toList(),
      languages: _languages.toList(),
    );
    await state.generateProfile(form);
    if (mounted && state.profileError == null) {
      widget.onProfileGenerated();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.primary,
                    AppColors.primary.withValues(alpha: 0.85),
                  ],
                ),
                borderRadius: AppRadius.lg,
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Tell us about\nyour work',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      height: 1.2,
                      letterSpacing: -0.5,
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'We\'ll match your experience to internationally recognised occupations and skills.',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.white70,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            _sectionLabel('Work experience'),
            const SizedBox(height: 8),
            TextField(
              controller: _descController,
              maxLines: 3,
              onChanged: (_) {
                if (_localValidationError != null) {
                  setState(() => _localValidationError = null);
                }
              },
              style: const TextStyle(fontSize: 14, height: 1.5),
              decoration: const InputDecoration(
                hintText: 'e.g. I repair phones, replace screens and explain problems to customers',
              ),
            ),

            const SizedBox(height: 20),
            _sectionLabel('Education level'),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _education,
              decoration: const InputDecoration(),
              items: _educationLevels
                  .map((e) => DropdownMenuItem(value: e.$1, child: Text(e.$2, style: const TextStyle(fontSize: 14))))
                  .toList(),
              onChanged: (v) => setState(() => _education = v!),
            ),

            const SizedBox(height: 20),
            _sectionLabel('Primary sector'),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _sector,
              decoration: const InputDecoration(),
              items: _sectors
                  .map((e) => DropdownMenuItem(value: e.$1, child: Text(e.$2, style: const TextStyle(fontSize: 14))))
                  .toList(),
              onChanged: (v) => setState(() => _sector = v!),
            ),

            const SizedBox(height: 20),
            Row(
              children: [
                _sectionLabel('Years of experience'),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.primaryLight,
                    borderRadius: AppRadius.pill,
                  ),
                  child: Text(
                    '$_years ${_years == 1 ? 'year' : 'years'}',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.primary),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            SliderTheme(
              data: SliderThemeData(
                activeTrackColor: AppColors.primary,
                inactiveTrackColor: AppColors.divider,
                thumbColor: AppColors.primary,
                overlayColor: AppColors.primary.withValues(alpha: 0.1),
                trackHeight: 4,
              ),
              child: Slider(
                value: _years.toDouble(),
                min: 0,
                max: 30,
                divisions: 30,
                onChanged: (v) => setState(() => _years = v.toInt()),
              ),
            ),

            const SizedBox(height: 16),
            _sectionLabel('Skills you have'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _commonSkills.map((s) {
                final selected = _selectedSkills.contains(s);
                return GestureDetector(
                  onTap: () {
                    setState(() {
                      if (selected) {
                        _selectedSkills.remove(s);
                      } else {
                        _selectedSkills.add(s);
                      }
                    });
                  },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: selected ? AppColors.primaryLight : AppColors.surface,
                      borderRadius: AppRadius.pill,
                      border: Border.all(
                        color: selected ? AppColors.primary.withValues(alpha: 0.4) : AppColors.divider,
                      ),
                    ),
                    child: Text(
                      s,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                        color: selected ? AppColors.primary : AppColors.textSecondary,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),

            const SizedBox(height: 20),
            _sectionLabel('Languages'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: ['English', 'Bengali', 'Twi', 'Hausa', 'French', 'Arabic', 'Hindi'].map((l) {
                final selected = _languages.contains(l);
                return GestureDetector(
                  onTap: () {
                    setState(() {
                      if (selected) {
                        _languages.remove(l);
                      } else {
                        _languages.add(l);
                      }
                    });
                  },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: selected ? AppColors.primaryLight : AppColors.surface,
                      borderRadius: AppRadius.pill,
                      border: Border.all(
                        color: selected ? AppColors.primary.withValues(alpha: 0.4) : AppColors.divider,
                      ),
                    ),
                    child: Text(
                      l,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                        color: selected ? AppColors.primary : AppColors.textSecondary,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),

            if (_localValidationError != null || state.profileError != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.riskLight,
                  borderRadius: AppRadius.sm,
                  border: Border.all(color: AppColors.risk.withValues(alpha: 0.2)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline_rounded, size: 16, color: AppColors.risk),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _localValidationError ?? state.profileError!,
                        style: const TextStyle(color: AppColors.risk, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 28),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: FilledButton(
                onPressed: state.profileLoading ? null : _submit,
                child: state.profileLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Generate Profile'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) => Text(
    text,
    style: const TextStyle(
      fontSize: 13,
      fontWeight: FontWeight.w600,
      color: AppColors.textPrimary,
      letterSpacing: -0.1,
    ),
  );

  String? _validateWorkDescription(String rawText) {
    final text = rawText.trim();
    if (text.isEmpty) {
      return 'Please describe your work in 1-2 sentences.';
    }

    const placeholders = {
      'n/a',
      'na',
      'none',
      'nothing',
      'no',
      'no experience',
      'no exp',
      'idk',
      'unknown',
      'test',
      'asdf',
      '...',
      '-',
      '.',
    };
    final lower = text.toLowerCase();
    if (placeholders.contains(lower)) {
      return 'Work description is too vague. Please describe real tasks you perform.';
    }

    final words = RegExp(r"[a-z][a-z'-]*", caseSensitive: false)
        .allMatches(text)
        .map((m) => m.group(0)!.toLowerCase())
        .toList();
    final uniqueWords = words.toSet();
    final letterCount = RegExp(r'[a-z]', caseSensitive: false).allMatches(text).length;

    if (text.length < 20 || words.length < 4 || uniqueWords.length < 3 || letterCount < 12) {
      return 'Too short. Add 1-2 sentences with specific tasks (tools used, tasks done, customers served).';
    }

    return null;
  }
}
