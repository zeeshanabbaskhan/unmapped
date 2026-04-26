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
          message: 'Fill in your work experience on the Intake tab to generate a portable skills profile.',
          icon: Icons.person_outline_rounded,
        ),
      );
    }

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: AppSpacing.screenAll,
          children: [
            OccupationCard(
              occupation: profile.primaryOccupation,
              confidenceLevel: profile.confidence.level,
            ),

            if (profile.confidence.caveat != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.riskMediumLight,
                  borderRadius: AppRadius.sm,
                  border: Border.all(color: AppColors.riskMedium.withValues(alpha: 0.2)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline_rounded, size: 16, color: AppColors.riskMedium.withValues(alpha: 0.8)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        profile.confidence.caveat!,
                        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary, height: 1.4),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            if (profile.mappedSkills.isNotEmpty) ...[
              const SectionHeader(title: 'Matched Skills'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: profile.mappedSkills.map((s) => SkillChip(skill: s)).toList(),
              ),
            ],

            if (profile.unmappedSkills.isNotEmpty) ...[
              const SectionHeader(
                title: 'Local Skills',
                subtitle: 'Not yet in the ESCO taxonomy',
              ),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: profile.unmappedSkills.map((s) => Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.neutralLight,
                    borderRadius: AppRadius.pill,
                  ),
                  child: Text(
                    s,
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.textSecondary),
                  ),
                )).toList(),
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
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: AppRadius.md,
                  border: Border.all(color: AppColors.divider),
                ),
                child: Text(
                  profile.summary!,
                  style: const TextStyle(fontSize: 13, color: AppColors.textSecondary, height: 1.5),
                ),
              ),
            ],

            if (profile.confidence.extractionMethod != null) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Icon(Icons.memory_rounded, size: 14, color: AppColors.textTertiary),
                  const SizedBox(width: 6),
                  Text(
                    'Extraction: ${profile.confidence.extractionMethod}',
                    style: const TextStyle(fontSize: 11, color: AppColors.textTertiary),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
