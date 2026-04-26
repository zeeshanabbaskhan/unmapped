import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../models/opportunity.dart';

class OpportunityCard extends StatelessWidget {
  final OpportunityItem item;
  const OpportunityCard({super.key, required this.item});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    item.title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ),
                if (item.score > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.opportunity.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '${(item.score * 100).toInt()}%',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.opportunity,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 4,
              children: [
                if (item.incomeRange != null)
                  _tag(Icons.payments_outlined, item.incomeRange!),
                if (item.demandLevel != null)
                  _tag(Icons.trending_up, item.demandLevel!),
                if (item.stability != null)
                  _tag(Icons.shield_outlined, item.stability!),
                if (item.iscoCode != null)
                  _tag(Icons.tag, 'ISCO ${item.iscoCode}'),
              ],
            ),
            if (item.rationale != null) ...[
              const SizedBox(height: 8),
              Text(
                item.rationale!,
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
            ],
            if (item.providers.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                'Via: ${item.providers.join(', ')}',
                style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _tag(IconData icon, String text) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: AppColors.textSecondary),
        const SizedBox(width: 3),
        Text(text, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
      ],
    );
  }
}
