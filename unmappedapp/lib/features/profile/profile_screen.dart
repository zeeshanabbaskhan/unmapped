import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/status_states.dart';
import '../../shared/widgets/skill_chip.dart';
import '../../shared/widgets/occupation_card.dart';
import '../../shared/widgets/section_header.dart';
import '../../state/app_state.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    if (state.profileLoading) {
      return const Scaffold(body: LoadingState(message: 'Generating your profile...'));
    }
    if (state.profileError != null) {
      return Scaffold(body: ErrorState(message: state.profileError!));
    }
    final profile = state.profile;
    if (profile == null) {
      return const Scaffold(
        body: EmptyState(
          message: 'Go to Home and fill in your work experience to generate a skills profile.',
          icon: Icons.person_outline,
        ),
      );
    }

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            OccupationCard(
              occupation: profile.primaryOccupation,
              confidenceLevel: profile.confidence.level,
            ),

            if (profile.confidence.caveat != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.orange.withValues(alpha: 0.2)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.info_outline, size: 16, color: Colors.orange),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        profile.confidence.caveat!,
                        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            if (profile.mappedSkills.isNotEmpty) ...[
              const SectionHeader(title: 'Matched Skills'),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: profile.mappedSkills.map((s) => SkillChip(skill: s)).toList(),
              ),
            ],

            if (profile.unmappedSkills.isNotEmpty) ...[
              const SectionHeader(title: 'Local / Informal Skills', subtitle: 'Not in ESCO taxonomy'),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: profile.unmappedSkills
                    .map((s) => Chip(
                          label: Text(s),
                          backgroundColor: AppColors.neutralLight,
                          visualDensity: VisualDensity.compact,
                        ))
                    .toList(),
              ),
            ],

            if (profile.alternativeOccupations.isNotEmpty) ...[
              const SectionHeader(title: 'Alternative Occupations'),
              ...profile.alternativeOccupations.map((o) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: OccupationCard(occupation: o, isPrimary: false),
              )),
            ],

            if (profile.summary != null) ...[
              const SectionHeader(title: 'Explanation'),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Text(
                    profile.summary!,
                    style: const TextStyle(fontSize: 13, color: AppColors.textSecondary, height: 1.5),
                  ),
                ),
              ),
            ],

            if (profile.confidence.extractionMethod != null) ...[
              const SizedBox(height: 12),
              Text(
                'Extraction method: ${profile.confidence.extractionMethod}',
                style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
