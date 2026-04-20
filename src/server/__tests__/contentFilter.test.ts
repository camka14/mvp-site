import {
  assertEventContentAllowed,
  EventContentFilterError,
} from '@/server/contentFilter';

describe('event content denylist', () => {
  it('rejects blocked language in the event name', () => {
    expect(() => assertEventContentAllowed({
      name: 'You are a bitch',
      description: 'friendly doubles',
    })).toThrow(EventContentFilterError);
  });

  it('rejects blocked language in the event description', () => {
    expect(() => assertEventContentAllowed({
      name: 'Late Night Open Gym',
      description: 'Show up and kill yourself on the court',
    })).toThrow(EventContentFilterError);
  });

  it('allows ordinary event content', () => {
    expect(() => assertEventContentAllowed({
      name: 'Late Night Open Gym',
      description: 'Intermediate doubles at the beach courts.',
    })).not.toThrow();
  });
});
