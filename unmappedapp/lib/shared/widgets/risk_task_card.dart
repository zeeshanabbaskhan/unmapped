import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../models/automation_risk.dart';

class RiskTaskCard extends StatelessWidget {
  final TaskRisk task;
  const RiskTaskCard({super.key, required this.task});

  @override
  Widget build(BuildContext context) {
    final isHigh = task.isHighRisk;
    final color = isHigh ? AppColors.risk : AppColors.stable;
    final bgColor = isHigh ? AppColors.riskLight : AppColors.stableLight;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: AppRadius.sm,
        border: Border.all(color: color.withValues(alpha: 0.15)),
      ),
      child: Row(
        children: [
          Icon(
            isHigh ? Icons.warning_amber_rounded : Icons.check_circle_outline,
            size: 18,
            color: color,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              task.name,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: color.withValues(alpha: 0.9),
                height: 1.3,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: AppRadius.pill,
            ),
            child: Text(
              '${(task.risk * 100).toInt()}%',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color),
            ),
          ),
        ],
      ),
    );
  }
}
