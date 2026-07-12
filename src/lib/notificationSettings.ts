export const NOTIFICATION_CHANNELS = ['email', 'push'] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = [
  'invitations',
  'eventAnnouncements',
  'matchScheduleUpdates',
  'chatMessages',
  'newEventsFromConnections',
  'hostActionRequired',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationSettings = Partial<
  Record<NotificationType, Partial<Record<NotificationChannel, boolean>>>
>;

export type NormalizedNotificationSettings = Record<
  NotificationType,
  Record<NotificationChannel, boolean>
>;

export type NotificationSettingRow = {
  id: NotificationType;
  label: string;
  description: string;
  channels: Record<NotificationChannel, boolean>;
};

export const NOTIFICATION_SETTING_ROWS: NotificationSettingRow[] = [
  {
    id: 'invitations',
    label: 'Invitations',
    description: 'Event, team, staff, and organization invitations.',
    channels: { email: true, push: true },
  },
  {
    id: 'eventAnnouncements',
    label: 'Event announcements',
    description: 'Messages sent by an event host or manager.',
    channels: { email: true, push: true },
  },
  {
    id: 'matchScheduleUpdates',
    label: 'Match and schedule updates',
    description: 'Match times, assigned teams, and generated schedule changes.',
    channels: { email: false, push: true },
  },
  {
    id: 'chatMessages',
    label: 'Chat messages',
    description: 'New messages in chat groups you have not muted.',
    channels: { email: false, push: true },
  },
  {
    id: 'newEventsFromConnections',
    label: 'New events from connections',
    description: 'Events created by friends or people you follow.',
    channels: { email: true, push: true },
  },
  {
    id: 'hostActionRequired',
    label: 'Host action required',
    description: 'Operational event alerts that need host review.',
    channels: { email: true, push: true },
  },
];

const rowsById = new Map(NOTIFICATION_SETTING_ROWS.map((row) => [row.id, row]));

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const isNotificationChannelSupported = (
  type: NotificationType,
  channel: NotificationChannel,
): boolean => rowsById.get(type)?.channels[channel] === true;

export const DEFAULT_NOTIFICATION_SETTINGS: NormalizedNotificationSettings =
  NOTIFICATION_TYPES.reduce((settings, type) => {
    const row = rowsById.get(type);
    settings[type] = NOTIFICATION_CHANNELS.reduce((channels, channel) => {
      channels[channel] = row?.channels[channel] === true;
      return channels;
    }, {} as Record<NotificationChannel, boolean>);
    return settings;
  }, {} as NormalizedNotificationSettings);

export const normalizeNotificationSettings = (
  value: unknown,
): NormalizedNotificationSettings => {
  const root = isRecord(value) ? value : {};

  return NOTIFICATION_TYPES.reduce((settings, type) => {
    const rawTypeSettings = root[type];
    const typeSettings = isRecord(rawTypeSettings) ? rawTypeSettings : {};
    settings[type] = NOTIFICATION_CHANNELS.reduce((channels, channel) => {
      const supported = isNotificationChannelSupported(type, channel);
      const rawValue = typeSettings[channel];
      channels[channel] = supported && (
        typeof rawValue === 'boolean'
          ? rawValue
          : DEFAULT_NOTIFICATION_SETTINGS[type][channel]
      );
      return channels;
    }, {} as Record<NotificationChannel, boolean>);
    return settings;
  }, {} as NormalizedNotificationSettings);
};

export const isNotificationChannelEnabled = (
  settings: unknown,
  type: NotificationType,
  channel: NotificationChannel,
): boolean => normalizeNotificationSettings(settings)[type][channel];
