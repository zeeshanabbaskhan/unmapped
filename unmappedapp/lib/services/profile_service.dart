import '../core/network/api_client.dart';
import '../models/intake_form.dart';
import '../models/skill_profile.dart';

class ProfileService {
  final ApiClient _api;

  ProfileService(this._api);

  Future<SkillProfile> generateProfile(IntakeForm form) async {
    final json = await _api.post('/api/module1/profile', form.toJson());
    return SkillProfile.fromJson(json);
  }
}
