import 'package:flutter/material.dart';

class AppColors {
  static const risk = Color(0xFFD32F2F);
  static const riskLight = Color(0xFFFBE9E7);
  static const stable = Color(0xFF388E3C);
  static const stableLight = Color(0xFFE8F5E9);
  static const opportunity = Color(0xFF1565C0);
  static const opportunityLight = Color(0xFFE3F2FD);
  static const neutral = Color(0xFF616161);
  static const neutralLight = Color(0xFFF5F5F5);
  static const background = Color(0xFFFAFAFA);
  static const surface = Colors.white;
  static const textPrimary = Color(0xFF212121);
  static const textSecondary = Color(0xFF757575);
  static const divider = Color(0xFFE0E0E0);
}

ThemeData buildAppTheme() {
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    scaffoldBackgroundColor: AppColors.background,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.opportunity,
      brightness: Brightness.light,
      surface: AppColors.surface,
    ),
    appBarTheme: const AppBarTheme(
      elevation: 0,
      scrolledUnderElevation: 1,
      backgroundColor: AppColors.surface,
      foregroundColor: AppColors.textPrimary,
      titleTextStyle: TextStyle(
        color: AppColors.textPrimary,
        fontSize: 18,
        fontWeight: FontWeight.w600,
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.divider),
      ),
      color: AppColors.surface,
      margin: EdgeInsets.zero,
    ),
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.neutralLight,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      side: BorderSide.none,
      labelStyle: const TextStyle(fontSize: 13),
    ),
    dividerTheme: const DividerThemeData(
      color: AppColors.divider,
      thickness: 1,
      space: 0,
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 64,
      elevation: 2,
      backgroundColor: AppColors.surface,
      indicatorColor: AppColors.opportunity.withValues(alpha: 0.12),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.opportunity);
        }
        return const TextStyle(fontSize: 11, color: AppColors.textSecondary);
      }),
    ),
  );
}
