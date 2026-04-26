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

  @override
  void dispose() {
    _descController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final state = context.read<AppState>();
    final form = IntakeForm(
      workDescription: _descController.text.trim().isEmpty
          ? 'General work experience'
          : _descController.text.trim(),
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
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 100),
          children: [
            const Text(
              'Tell us about your work',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            const Text(
              'We will match your experience to real occupations and skills.',
              style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 20),

            _label('Describe your work experience'),
            const SizedBox(height: 6),
            TextField(
              controller: _descController,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'e.g. I repair phones, replace screens and explain problems to customers',
                hintStyle: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                filled: true,
                fillColor: AppColors.surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: AppColors.divider),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: AppColors.divider),
                ),
              ),
            ),
            const SizedBox(height: 16),

            _label('Education level'),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              initialValue: _education,
              decoration: _dropdownDecoration(),
              items: _educationLevels
                  .map((e) => DropdownMenuItem(value: e.$1, child: Text(e.$2, style: const TextStyle(fontSize: 14))))
                  .toList(),
              onChanged: (v) => setState(() => _education = v!),
            ),
            const SizedBox(height: 16),

            _label('Primary sector'),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              initialValue: _sector,
              decoration: _dropdownDecoration(),
              items: _sectors
                  .map((e) => DropdownMenuItem(value: e.$1, child: Text(e.$2, style: const TextStyle(fontSize: 14))))
                  .toList(),
              onChanged: (v) => setState(() => _sector = v!),
            ),
            const SizedBox(height: 16),

            _label('Years of experience: $_years'),
            Slider(
              value: _years.toDouble(),
              min: 0,
              max: 30,
              divisions: 30,
              label: '$_years',
              onChanged: (v) => setState(() => _years = v.toInt()),
            ),
            const SizedBox(height: 12),

            _label('Skills you have'),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: _commonSkills.map((s) {
                final selected = _selectedSkills.contains(s);
                return FilterChip(
                  label: Text(s),
                  selected: selected,
                  onSelected: (v) {
                    setState(() {
                      if (v) {
                        _selectedSkills.add(s);
                      } else {
                        _selectedSkills.remove(s);
                      }
                    });
                  },
                  selectedColor: AppColors.opportunity.withValues(alpha: 0.12),
                  checkmarkColor: AppColors.opportunity,
                  visualDensity: VisualDensity.compact,
                );
              }).toList(),
            ),
            const SizedBox(height: 16),

            _label('Languages'),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: ['English', 'Bengali', 'Twi', 'Hausa', 'French', 'Arabic', 'Hindi'].map((l) {
                final selected = _languages.contains(l);
                return FilterChip(
                  label: Text(l),
                  selected: selected,
                  onSelected: (v) {
                    setState(() {
                      if (v) {
                        _languages.add(l);
                      } else {
                        _languages.remove(l);
                      }
                    });
                  },
                  selectedColor: AppColors.opportunity.withValues(alpha: 0.12),
                  checkmarkColor: AppColors.opportunity,
                  visualDensity: VisualDensity.compact,
                );
              }).toList(),
            ),

            if (state.profileError != null) ...[
              const SizedBox(height: 16),
              Text(
                state.profileError!,
                style: const TextStyle(color: AppColors.risk, fontSize: 13),
              ),
            ],

            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: FilledButton(
                onPressed: state.profileLoading ? null : _submit,
                child: state.profileLoading
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Generate Profile', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _label(String text) => Text(
    text,
    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
  );

  InputDecoration _dropdownDecoration() => InputDecoration(
    filled: true,
    fillColor: AppColors.surface,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: AppColors.divider),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: AppColors.divider),
    ),
  );
}
