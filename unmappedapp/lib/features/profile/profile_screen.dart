import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../shared/widgets/status_states.dart';
import '../../shared/widgets/skill_chip.dart';
import '../../shared/widgets/occupation_card.dart';
import '../../shared/widgets/section_header.dart';
import '../../models/skill_profile.dart';
import '../../state/app_state.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    if (state.profileLoading) {
      return const Scaffold(body: LoadingState(message: 'Generating your profile...'));
    }
    if (state.profileError != null) {
      return Scaffold(body: ErrorState(message: state.profileError!));
    }
    final profile = state.profile;
    if (profile == null) {
      return const Scaffold(
        body: EmptyState(
          message: 'Fill in your work experience on the Intake tab to generate a portable skills profile.',
          icon: Icons.person_outline_rounded,
        ),
      );
    }

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: AppSpacing.screenAll,
          children: [
            OccupationCard(
              occupation: profile.primaryOccupation,
              confidenceLevel: profile.confidence.level,
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: () => _exportProfilePdf(context, profile),
                icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                label: const Text('Export profile PDF'),
              ),
            ),

            if (profile.confidence.caveat != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.riskMediumLight,
                  borderRadius: AppRadius.sm,
                  border: Border.all(color: AppColors.riskMedium.withValues(alpha: 0.2)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline_rounded, size: 16, color: AppColors.riskMedium.withValues(alpha: 0.8)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        profile.confidence.caveat!,
                        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary, height: 1.4),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            if (profile.mappedSkills.isNotEmpty) ...[
              const SectionHeader(title: 'Matched Skills'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: profile.mappedSkills.map((s) => SkillChip(skill: s)).toList(),
              ),
            ],

            if (profile.unmappedSkills.isNotEmpty) ...[
              const SectionHeader(
                title: 'Local Skills',
                subtitle: 'Not yet in the ESCO taxonomy',
              ),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: profile.unmappedSkills.map((s) => Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.neutralLight,
                    borderRadius: AppRadius.pill,
                  ),
                  child: Text(
                    s,
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.textSecondary),
                  ),
                )).toList(),
              ),
            ],

            if (profile.alternativeOccupations.isNotEmpty) ...[
              const SectionHeader(title: 'Alternative Occupations'),
              ...profile.alternativeOccupations.map((o) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: OccupationCard(occupation: o, isPrimary: false),
              )),
            ],

            if (profile.summary != null) ...[
              const SectionHeader(title: 'Explanation'),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: AppRadius.md,
                  border: Border.all(color: AppColors.divider),
                ),
                child: Text(
                  profile.summary!,
                  style: const TextStyle(fontSize: 13, color: AppColors.textSecondary, height: 1.5),
                ),
              ),
            ],

          ],
        ),
      ),
    );
  }

  Future<void> _exportProfilePdf(BuildContext context, SkillProfile profile) async {
    try {
      final baseFont = await PdfGoogleFonts.notoSansRegular();
      final boldFont = await PdfGoogleFonts.notoSansBold();
      final doc = pw.Document(
        theme: pw.ThemeData.withFont(
          base: baseFont,
          bold: boldFont,
        ),
      );
      final generatedAt = DateTime.now().toIso8601String().replaceFirst('T', ' ').split('.').first;

      doc.addPage(
        pw.MultiPage(
          pageTheme: const pw.PageTheme(
            margin: pw.EdgeInsets.all(28),
            pageFormat: PdfPageFormat.a4,
          ),
          build: (_) => [
            pw.Text('Vectra - Profile Report', style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold)),
            pw.SizedBox(height: 4),
            pw.Text('Generated: $generatedAt', style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey700)),
            pw.SizedBox(height: 16),
            pw.Text('Primary Occupation', style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
            pw.SizedBox(height: 6),
            pw.Text(profile.primaryOccupation.title),
            if (profile.primaryOccupation.iscoCode != null) pw.Text('ISCO: ${profile.primaryOccupation.iscoCode}'),
            pw.Text('Confidence: ${profile.confidence.level}'),
            if (profile.summary != null) ...[
              pw.SizedBox(height: 14),
              pw.Text('Summary', style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
              pw.SizedBox(height: 4),
              pw.Text(profile.summary!),
            ],
            if (profile.mappedSkills.isNotEmpty) ...[
              pw.SizedBox(height: 14),
              pw.Text('Mapped Skills', style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
              pw.SizedBox(height: 4),
              ...profile.mappedSkills.take(40).map<pw.Widget>((s) => pw.Bullet(text: s.label)),
            ],
            if (profile.unmappedSkills.isNotEmpty) ...[
              pw.SizedBox(height: 14),
              pw.Text('Local Skills (Unmapped)', style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
              pw.SizedBox(height: 4),
              ...profile.unmappedSkills.take(40).map<pw.Widget>((s) => pw.Bullet(text: s)),
            ],
            if (profile.alternativeOccupations.isNotEmpty) ...[
              pw.SizedBox(height: 14),
              pw.Text('Alternative Occupations', style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
              pw.SizedBox(height: 4),
              ...profile.alternativeOccupations.take(20).map<pw.Widget>((o) {
                final isco = o.iscoCode != null ? ' (ISCO ${o.iscoCode})' : '';
                return pw.Bullet(text: '${o.title}$isco');
              }),
            ],
          ],
        ),
      );

      await Printing.layoutPdf(
        name: 'vectra_profile_report.pdf',
        onLayout: (_) async => doc.save(),
      );
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not export PDF. Please try again.')),
      );
    }
  }
}
