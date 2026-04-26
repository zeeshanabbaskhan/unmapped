import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/status_states.dart';
import '../../shared/widgets/opportunity_card.dart';
import '../../shared/widgets/economic_signal_card.dart';
import '../../shared/widgets/section_header.dart';
import '../../state/app_state.dart';
import '../../models/opportunity.dart';

class OpportunitiesScreen extends StatefulWidget {
  const OpportunitiesScreen({super.key});

  @override
  State<OpportunitiesScreen> createState() => _OpportunitiesScreenState();
}

class _OpportunitiesScreenState extends State<OpportunitiesScreen> {
  bool _fetched = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final state = context.read<AppState>();
    if (!_fetched && state.profile != null && state.opportunities == null && !state.opportunitiesLoading) {
      _fetched = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => state.fetchOpportunities());
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    if (state.profile == null) {
      return const Scaffold(
        body: EmptyState(
          message: 'Generate a skills profile first to see matching opportunities.',
          icon: Icons.work_outline_rounded,
        ),
      );
    }
    if (state.opportunitiesLoading) {
      return const Scaffold(body: LoadingState(message: 'Finding opportunities...'));
    }
    if (state.opportunitiesError != null) {
      return Scaffold(
        body: ErrorState(
          message: state.opportunitiesError!,
          onRetry: () => state.fetchOpportunities(),
        ),
      );
    }
    final result = state.opportunities;
    if (result == null) {
      return Scaffold(
        body: Center(
          child: FilledButton(
            onPressed: () => state.fetchOpportunities(),
            child: const Text('Load Opportunities'),
          ),
        ),
      );
    }

    final signalEntries = result.signals.entries;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: AppSpacing.screenAll,
          children: [
            if (result.occupationTitle != null) ...[
              Text(
                result.occupationTitle!,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                  letterSpacing: -0.3,
                ),
              ),
              const SizedBox(height: 4),
            ],

            if (result.country != null || result.informalityLevel != null)
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  if (result.country != null)
                    _contextPill(Icons.public_rounded, result.country!),
                  if (result.informalityLevel != null)
                    _contextPill(Icons.storefront_rounded, result.informalityLevel!),
                ],
              ),

            if (result.directJobs.isNotEmpty) ...[
              const SectionHeader(
                title: 'Direct Jobs',
                subtitle: 'Formal employment matching your profile',
                color: AppColors.stable,
              ),
              ..._buildCards(result.directJobs),
            ],

            if (result.adjacentOpps.isNotEmpty) ...[
              const SectionHeader(
                title: 'Adjacent Opportunities',
                subtitle: 'Upskilling pathways and related roles',
                color: AppColors.opportunity,
              ),
              ..._buildCards(result.adjacentOpps),
            ],

            if (result.microEnterprise.isNotEmpty) ...[
              const SectionHeader(
                title: 'Micro-enterprise',
                subtitle: 'Self-employment and informal sector paths',
                color: AppColors.riskMedium,
              ),
              ..._buildCards(result.microEnterprise),
            ],

            if (signalEntries.isNotEmpty) ...[
              const SectionHeader(title: 'Economic Signals'),
              ...signalEntries.map((e) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: EconomicSignalCard(label: e.key, value: e.value),
              )),
            ],
          ],
        ),
      ),
    );
  }

  Widget _contextPill(IconData icon, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.neutralLight,
        borderRadius: AppRadius.pill,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: AppColors.textSecondary),
          const SizedBox(width: 5),
          Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.textSecondary)),
        ],
      ),
    );
  }

  List<Widget> _buildCards(List<OpportunityItem> items) {
    return items.map((o) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: OpportunityCard(item: o),
    )).toList();
  }
}
