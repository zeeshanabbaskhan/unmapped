import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../models/opportunity.dart';

class OpportunityCard extends StatelessWidget {
  final OpportunityItem item;
  const OpportunityCard({super.key, required this.item});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: AppRadius.md,
        border: Border.all(color: AppColors.divider),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            item.title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (item.incomeRange != null)
                _tag(Icons.payments_outlined, item.incomeRange!, AppColors.stable),
              if (item.demandStrength != null)
                _tag(Icons.trending_up, item.demandStrength!, AppColors.opportunity),
              if (item.stability != null)
                _tag(Icons.shield_outlined, item.stability!, AppColors.neutral),
              if (item.entryBarrier != null)
                _tag(Icons.lock_outline, item.entryBarrier!, AppColors.riskMedium),
              if (item.iscoCode != null)
                _tag(Icons.tag, 'ISCO ${item.iscoCode}', AppColors.textTertiary),
            ],
          ),
          if (item.reason != null) ...[
            const SizedBox(height: 10),
            Text(
              item.reason!,
              style: const TextStyle(
                fontSize: 13,
                color: AppColors.textSecondary,
                height: 1.4,
              ),
            ),
          ],
          if (item.requiredUpskilling.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: item.requiredUpskilling.map((s) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.opportunityLight,
                  borderRadius: AppRadius.pill,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.arrow_upward_rounded, size: 12, color: AppColors.opportunity),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(
                        s,
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: AppColors.opportunity),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              )).toList(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _tag(IconData icon, String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: AppRadius.pill,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              text,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: color),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
