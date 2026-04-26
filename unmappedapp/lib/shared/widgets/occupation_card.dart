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
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (isPrimary)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.opportunity.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  'PRIMARY MATCH',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.opportunity,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
            if (isPrimary) const SizedBox(height: 8),
            Text(
              occupation.title,
              style: TextStyle(
                fontSize: isPrimary ? 20 : 16,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                if (occupation.iscoCode != null) ...[
                  Text(
                    'ISCO ${occupation.iscoCode}',
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                  const SizedBox(width: 12),
                ],
                if (confidenceLevel != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: _confidenceColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      confidenceLevel!,
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: _confidenceColor),
                    ),
                  ),
                if (occupation.matchScore != null) ...[
                  const SizedBox(width: 12),
                  Text(
                    '${(occupation.matchScore! * 100).toInt()}% match',
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                ],
              ],
            ),
            if (occupation.matchReason != null) ...[
              const SizedBox(height: 8),
              Text(
                occupation.matchReason!,
                style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Color get _confidenceColor {
    switch (confidenceLevel?.toLowerCase()) {
      case 'high':
        return AppColors.stable;
      case 'medium':
        return Colors.orange;
      default:
        return AppColors.risk;
    }
  }
}
