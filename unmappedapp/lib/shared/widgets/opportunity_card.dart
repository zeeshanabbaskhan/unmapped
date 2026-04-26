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
            Text(
              item.title,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 12,
              runSpacing: 4,
              children: [
                if (item.incomeRange != null)
                  _tag(Icons.payments_outlined, item.incomeRange!),
                if (item.demandStrength != null)
                  _tag(Icons.trending_up, item.demandStrength!),
                if (item.stability != null)
                  _tag(Icons.shield_outlined, item.stability!),
                if (item.entryBarrier != null)
                  _tag(Icons.lock_outline, 'Barrier: ${item.entryBarrier!}'),
                if (item.iscoCode != null)
                  _tag(Icons.tag, 'ISCO ${item.iscoCode}'),
              ],
            ),
            if (item.reason != null) ...[
              const SizedBox(height: 8),
              Text(
                item.reason!,
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
            ],
            if (item.requiredUpskilling.isNotEmpty) ...[
              const SizedBox(height: 6),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: item.requiredUpskilling.map((s) => Chip(
                  avatar: const Icon(Icons.arrow_upward, size: 14),
                  label: Text(s, style: const TextStyle(fontSize: 11)),
                  visualDensity: VisualDensity.compact,
                )).toList(),
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
