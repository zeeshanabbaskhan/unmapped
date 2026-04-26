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
          icon: Icons.shield_outlined,
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
          child: FilledButton(
            onPressed: () => state.fetchRisk(),
            child: const Text('Load Risk Analysis'),
          ),
        ),
      );
    }

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: AppSpacing.screenAll,
          children: [
            _riskGauge(risk.adjustedRisk, risk.riskLabel),

            if (risk.occupationTitle != null) ...[
              const SizedBox(height: 6),
              Text(
                risk.occupationTitle!,
                style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
                textAlign: TextAlign.center,
              ),
            ],

            if (risk.readinessSummary != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: AppRadius.md,
                  border: Border.all(color: AppColors.divider),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        if (risk.riskLevel != null) _pill(risk.riskLevel!, _riskLevelColor(risk.riskLevel!)),
                        if (risk.resilienceLevel != null) _pill('Resilience: ${risk.resilienceLevel!}', AppColors.stable),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      risk.readinessSummary!,
                      style: const TextStyle(fontSize: 13, color: AppColors.textSecondary, height: 1.5),
                    ),
                  ],
                ),
              ),
            ],

            if (risk.lmicExplanation.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.opportunityLight,
                  borderRadius: AppRadius.md,
                  border: Border.all(color: AppColors.opportunity.withValues(alpha: 0.15)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 24,
                          height: 24,
                          decoration: BoxDecoration(
                            color: AppColors.opportunity.withValues(alpha: 0.12),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.public_rounded, size: 14, color: AppColors.opportunity),
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          'LMIC Calibration',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.opportunity),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    ...risk.lmicExplanation.map((e) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(e, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary, height: 1.4)),
                    )),
                  ],
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

            if (risk.durableSkills.isNotEmpty || risk.atRiskSkills.isNotEmpty || risk.adjacentSkills.isNotEmpty) ...[
              const SectionHeader(title: 'Skill Resilience'),
              if (risk.durableSkills.isNotEmpty) ...[
                _skillGroup('Durable', AppColors.stable, Icons.check_circle_outline_rounded, risk.durableSkills),
                const SizedBox(height: 10),
              ],
              if (risk.atRiskSkills.isNotEmpty) ...[
                _skillGroup('At risk', AppColors.risk, Icons.warning_amber_rounded, risk.atRiskSkills),
                const SizedBox(height: 10),
              ],
              if (risk.adjacentSkills.isNotEmpty)
                _skillGroup('Upskilling paths', AppColors.opportunity, Icons.arrow_upward_rounded, risk.adjacentSkills),
            ],

            if (risk.educationProjection != null || risk.laborShiftTrend != null) ...[
              const SectionHeader(title: 'Macro Signals'),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: AppRadius.md,
                  border: Border.all(color: AppColors.divider),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (risk.educationProjection != null) ...[
                      _signalRow(Icons.school_outlined, 'Education projection', risk.educationProjection!),
                      if (risk.laborShiftTrend != null) ...[
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          child: Divider(height: 1, color: AppColors.divider),
                        ),
                      ],
                    ],
                    if (risk.laborShiftTrend != null)
                      _signalRow(Icons.swap_horiz_rounded, 'Labor shift trend', risk.laborShiftTrend!),
                  ],
                ),
              ),
            ],

          ],
        ),
      ),
    );
  }

  Widget _riskGauge(double value, String label) {
    final color = value >= 0.7
        ? AppColors.risk
        : value >= 0.4
            ? AppColors.riskMedium
            : AppColors.stable;

    return Column(
      children: [
        const SizedBox(height: 8),
        Text(
          '${(value * 100).toInt()}%',
          style: TextStyle(
            fontSize: 52,
            fontWeight: FontWeight.w800,
            color: color,
            letterSpacing: -2,
            height: 1,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.1),
            borderRadius: AppRadius.pill,
          ),
          child: Text(
            '$label Automation Risk',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color),
          ),
        ),
        const SizedBox(height: 14),
        ClipRRect(
          borderRadius: AppRadius.pill,
          child: LinearProgressIndicator(
            value: value,
            minHeight: 6,
            backgroundColor: AppColors.neutralLight,
            valueColor: AlwaysStoppedAnimation(color),
          ),
        ),
      ],
    );
  }

  Widget _pill(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: AppRadius.pill,
      ),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color, letterSpacing: 0.3),
      ),
    );
  }

  Color _riskLevelColor(String level) {
    switch (level.toLowerCase()) {
      case 'very high':
      case 'high':
        return AppColors.risk;
      case 'medium':
        return AppColors.riskMedium;
      default:
        return AppColors.stable;
    }
  }

  Widget _skillGroup(String title, Color color, IconData icon, List<String> skills) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 15, color: color),
            const SizedBox(width: 6),
            Text(title, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color)),
          ],
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: skills.map((s) => Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.06),
              borderRadius: AppRadius.pill,
              border: Border.all(color: color.withValues(alpha: 0.15)),
            ),
            child: Text(s, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: color)),
          )).toList(),
        ),
      ],
    );
  }

  Widget _signalRow(IconData icon, String title, String body) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          margin: const EdgeInsets.only(top: 2),
          decoration: BoxDecoration(
            color: AppColors.neutralLight,
            borderRadius: AppRadius.sm,
          ),
          child: Icon(icon, size: 15, color: AppColors.textSecondary),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
              const SizedBox(height: 2),
              Text(body, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary, height: 1.4)),
            ],
          ),
        ),
      ],
    );
  }
}
