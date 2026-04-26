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

    return Card(
      color: bgColor,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Icon(
              isHigh ? Icons.warning_amber_rounded : Icons.check_circle_outline,
              size: 20,
              color: color,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                task.name,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: color,
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                '${(task.risk * 100).toInt()}%',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
