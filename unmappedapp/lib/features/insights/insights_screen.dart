import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/status_states.dart';
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
          icon: Icons.analytics_outlined,
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
              const Icon(Icons.analytics_outlined, size: 48, color: AppColors.divider),
              const SizedBox(height: 12),
              const Text(
                'Policy insights load alongside opportunities.',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
              ),
              const SizedBox(height: 16),
              FilledButton.tonal(
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

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            const Text(
              'Policy Insights',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              'Labor market signals for ${result.country ?? state.selectedCountry}',
              style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
            ),

            if (pv.laborGap != null || pv.sectorShortage != null || pv.recommendation != null) ...[
              const SectionHeader(title: 'Policy View'),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (pv.laborGap != null) ...[
                        const Text('Labor gap', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.opportunity)),
                        Text(pv.laborGap!, style: const TextStyle(fontSize: 13)),
                        const SizedBox(height: 8),
                      ],
                      if (pv.sectorShortage != null) ...[
                        const Text('Sector shortage signal', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.opportunity)),
                        Text(pv.sectorShortage!, style: const TextStyle(fontSize: 13)),
                        const SizedBox(height: 8),
                      ],
                      if (pv.recommendation != null) ...[
                        const Text('Recommendation', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.opportunity)),
                        Text(pv.recommendation!, style: const TextStyle(fontSize: 13)),
                      ],
                    ],
                  ),
                ),
              ),
            ],

            if (signalEntries.isNotEmpty) ...[
              const SectionHeader(title: 'Economic Indicators'),
              ...signalEntries.map((e) => Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  child: Row(
                    children: [
                      const Icon(Icons.insights, size: 20, color: AppColors.opportunity),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(e.key, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                      ),
                      Flexible(
                        child: Text(e.value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.textPrimary), textAlign: TextAlign.end),
                      ),
                    ],
                  ),
                ),
              )),
            ],

            if (signalEntries.isEmpty && pv.laborGap == null) ...[
              const SizedBox(height: 32),
              const EmptyState(
                message: 'No policy signals available for this country yet.',
                icon: Icons.analytics_outlined,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
