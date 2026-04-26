import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/status_states.dart';
import '../../shared/widgets/economic_signal_card.dart';
import '../../shared/widgets/section_header.dart';
import '../../state/app_state.dart';

class InsightsScreen extends StatelessWidget {
  const InsightsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    if (state.profile == null) {
      return const Scaffold(
        body: EmptyState(
          message: 'Generate a skills profile first to see policy insights.',
          icon: Icons.bar_chart_rounded,
        ),
      );
    }

    final result = state.opportunities;
    if (result == null) {
      if (state.opportunitiesLoading) {
        return const Scaffold(body: LoadingState(message: 'Loading policy data...'));
      }
      return Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: AppColors.neutralLight,
                  borderRadius: AppRadius.xl,
                ),
                child: const Icon(Icons.bar_chart_rounded, size: 28, color: AppColors.textTertiary),
              ),
              const SizedBox(height: 16),
              const Text(
                'Policy insights load alongside opportunities.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () => state.fetchOpportunities(),
                child: const Text('Load Data'),
              ),
            ],
          ),
        ),
      );
    }

    final pv = result.policyView;
    final signalEntries = result.signals.entries;
    final hasPolicy = pv.laborGap != null || pv.sectorShortage != null || pv.recommendation != null;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: AppSpacing.screenAll,
          children: [
            Text(
              'Policy Insights',
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Labor market signals for ${result.country ?? state.selectedCountry}',
              style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
            ),

            if (hasPolicy) ...[
              const SectionHeader(title: 'Policy View'),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: AppRadius.md,
                  border: Border.all(color: AppColors.divider),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (pv.laborGap != null)
                      _policyBlock(
                        Icons.group_outlined,
                        'Labor gap',
                        pv.laborGap!,
                        AppColors.risk,
                      ),
                    if (pv.laborGap != null && pv.sectorShortage != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Divider(height: 1, color: AppColors.divider),
                      ),
                    if (pv.sectorShortage != null)
                      _policyBlock(
                        Icons.factory_outlined,
                        'Sector shortage',
                        pv.sectorShortage!,
                        AppColors.riskMedium,
                      ),
                    if ((pv.laborGap != null || pv.sectorShortage != null) && pv.recommendation != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Divider(height: 1, color: AppColors.divider),
                      ),
                    if (pv.recommendation != null)
                      _policyBlock(
                        Icons.lightbulb_outline_rounded,
                        'Recommendation',
                        pv.recommendation!,
                        AppColors.stable,
                      ),
                  ],
                ),
              ),
            ],

            if (signalEntries.isNotEmpty) ...[
              const SectionHeader(title: 'Economic Indicators'),
              ...signalEntries.map((e) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: EconomicSignalCard(label: e.key, value: e.value),
              )),
            ],

            if (signalEntries.isEmpty && !hasPolicy)
              const Padding(
                padding: EdgeInsets.only(top: 32),
                child: EmptyState(
                  message: 'No policy signals available for this country yet.',
                  icon: Icons.bar_chart_rounded,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _policyBlock(IconData icon, String title, String body, Color color) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 32,
          height: 32,
          margin: const EdgeInsets.only(top: 2),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: AppRadius.sm,
          ),
          child: Icon(icon, size: 16, color: color),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color),
              ),
              const SizedBox(height: 4),
              Text(
                body,
                style: const TextStyle(fontSize: 13, color: AppColors.textSecondary, height: 1.4),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
