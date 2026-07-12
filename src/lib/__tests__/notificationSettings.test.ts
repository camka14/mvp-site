import {
  DEFAULT_NOTIFICATION_SETTINGS,
  normalizeNotificationSettings,
} from '@/lib/notificationSettings';

describe('normalizeNotificationSettings', () => {
  it('uses the declared defaults when preferences are missing', () => {
    expect(normalizeNotificationSettings(null)).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(normalizeNotificationSettings({})).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it('preserves provided preferences while defaulting missing channels', () => {
    const settings = normalizeNotificationSettings({
      invitations: { email: false },
      matchScheduleUpdates: { push: false },
    });

    expect(settings.invitations).toEqual({ email: false, push: true });
    expect(settings.matchScheduleUpdates).toEqual({ email: false, push: false });
    expect(settings.chatMessages).toEqual({ email: false, push: true });
  });
});
