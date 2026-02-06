import { buildInviteEmail } from '@/server/emailTemplates';

describe('buildInviteEmail', () => {
  it('builds an event invite with schedule link', () => {
    const result = buildInviteEmail({
      baseUrl: 'http://localhost:3000',
      email: 'ref@example.com',
      inviteType: 'referee',
      eventId: 'event_123',
      eventName: 'Spring Invitational',
    });

    expect(result.subject).toContain('Spring Invitational');
    expect(result.text).toContain('Spring Invitational');
    expect(result.actionUrl).toBe('http://localhost:3000/events/event_123/schedule');
  });

  it('builds a team invite with teams link', () => {
    const result = buildInviteEmail({
      baseUrl: 'https://mvp.razumly.com/',
      email: 'player@example.com',
      inviteType: 'player',
      teamId: 'team_456',
      teamName: 'Aces United',
    });

    expect(result.subject).toContain('Aces United');
    expect(result.actionUrl).toBe('https://mvp.razumly.com/teams');
  });
});
