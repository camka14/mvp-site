/** @jest-environment node */

jest.mock('@/server/eventTags', () => ({
  normalizeEventTagInputs: (value: unknown) => {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          const text = record.name ?? record.label ?? record.value;
          return typeof text === 'string' ? text.trim() : '';
        }
        return '';
      })
      .filter(Boolean)
      .filter((entry) => {
        const key = entry.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  },
}));

import { inferAffiliateEventTagNames } from '@/server/affiliateImports/tags';

describe('affiliate import tag inference', () => {
  it('tags pickleball group play rows as open play', () => {
    expect(inferAffiliateEventTagNames({
      title: 'Night Owl (3.5 - 4.0)',
      formatLabel: 'SKILLED GROUP PLAY',
      skillLevel: 'Skilled Round Robin',
      sportName: 'Pickleball',
    })).toEqual(['Open Play']);
  });

  it('tags cooperative basketball games as pickup games', () => {
    expect(inferAffiliateEventTagNames({
      title: '12:00 PM - Zero referees COOPERATIVE game - 54 minutes 5v5 Full Court',
      sportName: 'Basketball',
    })).toEqual(['Pickup Game']);
  });

  it('tags city league game rows as pickup games instead of league registrations', () => {
    expect(inferAffiliateEventTagNames({
      title: '8:50 PM - Regular city league basketball game with referees',
      sportName: 'Basketball',
    })).toEqual(['Pickup Game']);
  });

  it('tags classes and training programs as clinics', () => {
    expect(inferAffiliateEventTagNames({
      title: 'Rookie Level Class',
      sportName: 'Baseball',
    })).toEqual(['Clinic']);

    expect(inferAffiliateEventTagNames({
      title: '03 Elite Team Training',
      sportName: 'Badminton',
    })).toEqual(['Clinic']);
  });

  it('tags friendly match rows as pickup games', () => {
    expect(inferAffiliateEventTagNames({
      title: 'Troutdale Indoor Sports Indoor Soccer Friendly Match',
      scheduleText: 'Friendly games available. Call for availability.',
      sportName: 'Indoor Soccer',
    })).toEqual(['Pickup Game']);
  });

  it('uses normalized import fields when candidate columns are sparse', () => {
    expect(inferAffiliateEventTagNames({
      rawPayload: {
        normalizedImport: {
          title: 'Team Play Wednesdays',
          formatLabel: 'Half Price Night',
          sportName: 'Indoor Volleyball',
        },
      },
    })).toEqual(['Open Play']);
  });

  it('tags social rows as social events', () => {
    expect(inferAffiliateEventTagNames({
      title: 'Camp RECS - Adult Social',
      formatLabel: 'SOCIAL EVENT',
      sportName: 'Pickleball',
    })).toEqual(['Social Event']);
  });

  it('tags evergreen beginner and daily programs', () => {
    expect(inferAffiliateEventTagNames({
      title: "Jumbo's Pickleball Portland Beginner Programs",
      formatLabel: 'Beginner pickleball program',
      sportName: 'Pickleball',
    })).toEqual(['Clinic']);

    expect(inferAffiliateEventTagNames({
      title: "Jumbo's Pickleball Portland Daily Programs",
      formatLabel: 'Organized play',
      sportName: 'Pickleball',
    })).toEqual(['Open Play']);
  });

  it('tags doubles flights as league-style organized play', () => {
    expect(inferAffiliateEventTagNames({
      title: 'Cascade Gresham Tennis Doubles Flights',
      sportName: 'Tennis',
    })).toEqual(['League']);
  });

  it('keeps event type tags while adding source category tags', () => {
    expect(inferAffiliateEventTagNames({
      title: 'Adult House Team Registration',
      sportName: 'Indoor Soccer',
    }, { eventType: 'LEAGUE' })).toEqual(['League']);
  });

  it('does not infer the opposite event type tag when event type is authoritative', () => {
    expect(inferAffiliateEventTagNames({
      title: 'Summer Adult Basketball League',
      description: 'Page copy mentions tournament brackets and championships.',
      tags: ['Tournament'],
      sportName: 'Basketball',
    }, { eventType: 'LEAGUE' })).toEqual(['League']);
  });

  it('does not turn generic camp skill development copy into a clinic tag', () => {
    expect(inferAffiliateEventTagNames({
      title: 'Volleyball at Beaverton Family YMCA',
      formatLabel: 'Youth volleyball camp',
      skillLevel: 'All abilities, fundamental skill development',
      tags: ['Camp'],
    })).toEqual(['Camp']);
  });
});
