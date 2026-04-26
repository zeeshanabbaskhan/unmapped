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

    final signals = result.policySignals.isNotEmpty ? result.policySignals : result.youthSignals;

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
              'Labor market signals for ${state.selectedCountry}',
              style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
            ),

            if (signals.isNotEmpty) ...[
              const SectionHeader(title: 'Economic Indicators'),
              ...signals.map((s) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: EconomicSignalCard(signal: s),
              )),
            ],

            if (result.policySignals.isEmpty && result.youthSignals.isEmpty) ...[
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
