import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/status_states.dart';
import '../../shared/widgets/risk_task_card.dart';
import '../../shared/widgets/section_header.dart';
import '../../state/app_state.dart';

class RiskScreen extends StatefulWidget {
  const RiskScreen({super.key});

  @override
  State<RiskScreen> createState() => _RiskScreenState();
}

class _RiskScreenState extends State<RiskScreen> {
  bool _fetched = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final state = context.read<AppState>();
    if (!_fetched && state.profile != null && state.risk == null && !state.riskLoading) {
      _fetched = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => state.fetchRisk());
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    if (state.profile == null) {
      return const Scaffold(
        body: EmptyState(
          message: 'Generate a skills profile first to see automation risk analysis.',
          icon: Icons.smart_toy_outlined,
        ),
      );
    }
    if (state.riskLoading) {
      return const Scaffold(body: LoadingState(message: 'Analysing automation risk...'));
    }
    if (state.riskError != null) {
      return Scaffold(
        body: ErrorState(
          message: state.riskError!,
          onRetry: () => state.fetchRisk(),
        ),
      );
    }
    final risk = state.risk;
    if (risk == null) {
      return Scaffold(
        body: Center(
          child: FilledButton.tonal(
            onPressed: () => state.fetchRisk(),
            child: const Text('Load Risk Analysis'),
          ),
        ),
      );
    }

    final highRisk = risk.tasks.where((t) => t.isHighRisk).toList();
    final lowRisk = risk.tasks.where((t) => !t.isHighRisk).toList();

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            _riskHeader(risk.adjustedRisk, risk.riskLabel),

            if (risk.occupationTitle != null) ...[
              const SizedBox(height: 4),
              Text(
                risk.occupationTitle!,
                style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
                textAlign: TextAlign.center,
              ),
            ],

            if (risk.countryAdjustmentNote != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.opportunityLight,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.public, size: 16, color: AppColors.opportunity),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        risk.countryAdjustmentNote!,
                        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            if (highRisk.isNotEmpty) ...[
              const SectionHeader(title: 'High-risk tasks', color: AppColors.risk),
              ...highRisk.map((t) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: RiskTaskCard(task: t),
              )),
            ],

            if (lowRisk.isNotEmpty) ...[
              const SectionHeader(title: 'Lower-risk tasks', color: AppColors.stable),
              ...lowRisk.map((t) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: RiskTaskCard(task: t),
              )),
            ],

            if (risk.econometricSignals.isNotEmpty) ...[
              const SectionHeader(title: 'Economic context'),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: risk.econometricSignals.map((s) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              s.label,
                              style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                            ),
                          ),
                          Text(
                            '${s.value}${s.unit != null ? ' ${s.unit}' : ''}',
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    )).toList(),
                  ),
                ),
              ),
            ],

            if (risk.scenario != null) ...[
              const SizedBox(height: 12),
              Text(
                'Scenario: ${risk.scenario}',
                style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _riskHeader(double value, String label) {
    final color = value >= 0.7
        ? AppColors.risk
        : value >= 0.4
            ? Colors.orange
            : AppColors.stable;

    return Column(
      children: [
        Text(
          '${(value * 100).toInt()}%',
          style: TextStyle(fontSize: 48, fontWeight: FontWeight.w800, color: color),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            '$label Automation Risk',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: color),
          ),
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: value,
            minHeight: 8,
            backgroundColor: AppColors.divider,
            valueColor: AlwaysStoppedAnimation(color),
          ),
        ),
      ],
    );
  }
}
