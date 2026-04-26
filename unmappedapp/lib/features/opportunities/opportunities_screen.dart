import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/status_states.dart';
import '../../shared/widgets/opportunity_card.dart';
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
          icon: Icons.work_outline,
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
          child: FilledButton.tonal(
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
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            if (result.occupationTitle != null)
              Text(
                'Opportunities for: ${result.occupationTitle}',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),

            if (result.country != null || result.informalityLevel != null) ...[
              const SizedBox(height: 4),
              Text(
                '${result.country ?? ''} | Formality: ${result.informalityLevel ?? 'unknown'}',
                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
              ),
            ],

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
                color: Colors.orange,
              ),
              ..._buildCards(result.microEnterprise),
            ],

            if (signalEntries.isNotEmpty) ...[
              const SectionHeader(title: 'Economic Signals'),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: signalEntries.map((e) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(e.key, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                          ),
                          Flexible(
                            child: Text(e.value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600), textAlign: TextAlign.end),
                          ),
                        ],
                      ),
                    )).toList(),
                  ),
                ),
              ),
            ],
          ],
        ),
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
