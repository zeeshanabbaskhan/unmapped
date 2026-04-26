import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../models/skill_profile.dart';

class SkillChip extends StatelessWidget {
  final MappedSkill skill;
  const SkillChip({super.key, required this.skill});

  @override
  Widget build(BuildContext context) {
    final score = skill.matchScore;
    final color = score >= 0.7
        ? AppColors.stable
        : score >= 0.4
            ? AppColors.riskMedium
            : AppColors.textTertiary;

    return Tooltip(
      message: skill.matchReason ?? 'Match: ${(score * 100).toInt()}%',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: AppRadius.sm,
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: Text(
                '${(score * 100).toInt()}',
                style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: color),
              ),
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                skill.label,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppColors.textPrimary),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
