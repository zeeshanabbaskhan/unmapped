import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../models/opportunity.dart';

class EconomicSignalCard extends StatelessWidget {
  final PolicyInsight signal;
  const EconomicSignalCard({super.key, required this.signal});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            const Icon(Icons.insights, size: 20, color: AppColors.opportunity),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                signal.label,
                style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
              ),
            ),
            Text(
              signal.value,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
