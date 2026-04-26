import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/theme/app_theme.dart';
import 'state/app_state.dart';
import 'features/home/home_screen.dart';
import 'features/profile/profile_screen.dart';
import 'features/risk/risk_screen.dart';
import 'features/opportunities/opportunities_screen.dart';
import 'features/insights/insights_screen.dart';

void main() {
  runApp(
    ChangeNotifierProvider(
      create: (_) => AppState()..loadCountries(),
      child: const UnmappedApp(),
    ),
  );
}

class UnmappedApp extends StatelessWidget {
  const UnmappedApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'UNMAPPED',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: const AppShell(),
    );
  }
}

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _tabIndex = 0;

  void _goToProfile() {
    setState(() => _tabIndex = 1);
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();

    final screens = [
      HomeScreen(onProfileGenerated: _goToProfile),
      const ProfileScreen(),
      const RiskScreen(),
      const OpportunitiesScreen(),
      const InsightsScreen(),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('UNMAPPED'),
        actions: [
          if (state.countries.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: state.selectedCountry,
                  icon: const Icon(Icons.public, size: 18),
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                  items: state.countries.map((c) {
                    return DropdownMenuItem(
                      value: c.code,
                      child: Text('${_flag(c.code)} ${c.code}'),
                    );
                  }).toList(),
                  onChanged: (code) {
                    if (code != null) state.selectCountry(code);
                  },
                ),
              ),
            ),
        ],
      ),
      body: IndexedStack(
        index: _tabIndex,
        children: screens,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tabIndex,
        onDestinationSelected: (i) => setState(() => _tabIndex = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
          NavigationDestination(icon: Icon(Icons.smart_toy_outlined), selectedIcon: Icon(Icons.smart_toy), label: 'Risk'),
          NavigationDestination(icon: Icon(Icons.work_outline), selectedIcon: Icon(Icons.work), label: 'Jobs'),
          NavigationDestination(icon: Icon(Icons.analytics_outlined), selectedIcon: Icon(Icons.analytics), label: 'Insights'),
        ],
      ),
    );
  }

  String _flag(String code) {
    if (code.length != 2) return '';
    final a = code.codeUnitAt(0) - 0x41 + 0x1F1E6;
    final b = code.codeUnitAt(1) - 0x41 + 0x1F1E6;
    return String.fromCharCodes([a, b]);
  }
}
