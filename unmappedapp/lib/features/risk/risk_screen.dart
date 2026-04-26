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

            if (risk.lmicExplanation.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.opportunityLight,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.public, size: 16, color: AppColors.opportunity),
                        SizedBox(width: 8),
                        Text('LMIC Adjustment', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.opportunity)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    ...risk.lmicExplanation.map((e) => Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Text(e, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                    )),
                  ],
                ),
              ),
            ],

            if (risk.readinessSummary != null) ...[
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          if (risk.riskLevel != null) Chip(label: Text(risk.riskLevel!.toUpperCase(), style: const TextStyle(fontSize: 11))),
                          const SizedBox(width: 6),
                          if (risk.resilienceLevel != null) Chip(label: Text('Resilience: ${risk.resilienceLevel!}', style: const TextStyle(fontSize: 11))),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(risk.readinessSummary!, style: const TextStyle(fontSize: 13)),
                    ],
                  ),
                ),
              ),
            ],

            if (risk.highRiskTasks.isNotEmpty) ...[
              const SectionHeader(title: 'High-risk tasks', color: AppColors.risk),
              ...risk.highRiskTasks.map((t) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: RiskTaskCard(task: t),
              )),
            ],

            if (risk.lowRiskTasks.isNotEmpty) ...[
              const SectionHeader(title: 'Lower-risk tasks', color: AppColors.stable),
              ...risk.lowRiskTasks.map((t) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: RiskTaskCard(task: t),
              )),
            ],

            if (risk.durableSkills.isNotEmpty || risk.atRiskSkills.isNotEmpty) ...[
              const SectionHeader(title: 'Skill Resilience'),
              if (risk.durableSkills.isNotEmpty) ...[
                const Text('Durable skills:', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.stable)),
                Wrap(
                  spacing: 6, runSpacing: 4,
                  children: risk.durableSkills.map((s) => Chip(
                    avatar: const Icon(Icons.check_circle_outline, size: 16, color: AppColors.stable),
                    label: Text(s, style: const TextStyle(fontSize: 12)),
                  )).toList(),
                ),
                const SizedBox(height: 8),
              ],
              if (risk.atRiskSkills.isNotEmpty) ...[
                const Text('At-risk skills:', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.risk)),
                Wrap(
                  spacing: 6, runSpacing: 4,
                  children: risk.atRiskSkills.map((s) => Chip(
                    avatar: const Icon(Icons.warning_amber_rounded, size: 16, color: AppColors.risk),
                    label: Text(s, style: const TextStyle(fontSize: 12)),
                  )).toList(),
                ),
                const SizedBox(height: 8),
              ],
              if (risk.adjacentSkills.isNotEmpty) ...[
                const Text('Adjacent (upskilling):', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.opportunity)),
                Wrap(
                  spacing: 6, runSpacing: 4,
                  children: risk.adjacentSkills.map((s) => Chip(
                    avatar: const Icon(Icons.arrow_upward, size: 16, color: AppColors.opportunity),
                    label: Text(s, style: const TextStyle(fontSize: 12)),
                  )).toList(),
                ),
              ],
            ],

            if (risk.educationProjection != null || risk.laborShiftTrend != null) ...[
              const SectionHeader(title: 'Macro Signals'),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (risk.educationProjection != null) ...[
                        const Text('Education projection', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                        Text(risk.educationProjection!, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                        const SizedBox(height: 8),
                      ],
                      if (risk.laborShiftTrend != null) ...[
                        const Text('Labor shift trend', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                        Text(risk.laborShiftTrend!, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                      ],
                    ],
                  ),
                ),
              ),
            ],

            if (risk.analysisProvider != null) ...[
              const SizedBox(height: 12),
              Text(
                'Analysis: ${risk.analysisProvider}',
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
