import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../models/skill_profile.dart';

class OccupationCard extends StatelessWidget {
  final Occupation occupation;
  final String? confidenceLevel;
  final bool isPrimary;

  const OccupationCard({
    super.key,
    required this.occupation,
    this.confidenceLevel,
    this.isPrimary = true,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: isPrimary ? AppColors.primaryLight : AppColors.surface,
        borderRadius: AppRadius.md,
        border: Border.all(
          color: isPrimary ? AppColors.primary.withValues(alpha: 0.2) : AppColors.divider,
        ),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (isPrimary)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              margin: const EdgeInsets.only(bottom: 10),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                borderRadius: AppRadius.pill,
              ),
              child: const Text(
                'PRIMARY MATCH',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primary,
                  letterSpacing: 0.8,
                ),
              ),
            ),
          Text(
            occupation.title,
            style: TextStyle(
              fontSize: isPrimary ? 20 : 15,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
              letterSpacing: -0.3,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (occupation.iscoCode != null)
                _badge('ISCO ${occupation.iscoCode}', AppColors.neutral),
              if (confidenceLevel != null)
                _badge(confidenceLevel!, _confidenceColor),
              if (occupation.matchScore != null)
                _badge('${(occupation.matchScore! * 100).toInt()}% match', AppColors.textSecondary),
            ],
          ),
          if (occupation.matchReason != null) ...[
            const SizedBox(height: 10),
            Text(
              occupation.matchReason!,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textSecondary,
                height: 1.4,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _badge(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: AppRadius.pill,
      ),
      child: Text(
        text,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }

  Color get _confidenceColor {
    switch (confidenceLevel?.toLowerCase()) {
      case 'high':
        return AppColors.stable;
      case 'medium':
        return AppColors.riskMedium;
      default:
        return AppColors.risk;
    }
  }
}
