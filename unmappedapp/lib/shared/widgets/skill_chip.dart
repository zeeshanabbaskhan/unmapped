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
            ? AppColors.neutral
            : AppColors.textSecondary;

    return Tooltip(
      message: skill.matchReason ?? 'Match: ${(score * 100).toInt()}%',
      child: Chip(
        avatar: CircleAvatar(
          radius: 10,
          backgroundColor: color.withValues(alpha: 0.15),
          child: Text(
            '${(score * 100).toInt()}',
            style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: color),
          ),
        ),
        label: Text(skill.label),
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        visualDensity: VisualDensity.compact,
      ),
    );
  }
}
