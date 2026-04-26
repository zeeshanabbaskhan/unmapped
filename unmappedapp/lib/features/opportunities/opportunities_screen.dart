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

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            if (result.topOccupation != null)
              Text(
                'Opportunities for: ${result.topOccupation}',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
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
                subtitle: 'Upskilling, gig work and training pathways',
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

            if (result.youthSignals.isNotEmpty) ...[
              const SectionHeader(title: 'Economic Signals'),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: result.youthSignals.map((s) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(s.label, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                          ),
                          Text(s.value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
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
