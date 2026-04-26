import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:unmappedapp/main.dart';
import 'package:unmappedapp/state/app_state.dart';

void main() {
  testWidgets('App shell renders bottom navigation', (WidgetTester tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider(
        create: (_) => AppState(),
        child: const UnmappedApp(),
      ),
    );

    expect(find.text('UNMAPPED'), findsOneWidget);
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Profile'), findsOneWidget);
    expect(find.text('Risk'), findsOneWidget);
    expect(find.text('Jobs'), findsOneWidget);
    expect(find.text('Insights'), findsOneWidget);
  });
}
