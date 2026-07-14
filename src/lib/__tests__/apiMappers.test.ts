import {
  normalizeApiEntity,
  normalizeApiEvent,
  normalizeApiField,
  normalizeApiMatch,
  normalizeApiTeam,
} from '@/lib/apiMappers';
import type { Event, Field, Match, Team } from '@/types';

describe('canonical API response adapters', () => {
  it('uses canonical identity and timestamps as the internal UI source of truth', () => {
    const normalized = normalizeApiEntity({
      id: 'canonical_id',
      $id: 'obsolete_id',
      createdAt: '2026-07-14T10:00:00.000Z',
      $createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2026-07-14T10:05:00.000Z',
      $updatedAt: '2020-01-01T00:05:00.000Z',
    });

    expect(normalized).toEqual(expect.objectContaining({
      $id: 'canonical_id',
      $createdAt: '2026-07-14T10:00:00.000Z',
      $updatedAt: '2026-07-14T10:05:00.000Z',
    }));
  });

  it('adapts canonical-only event relationship trees without changing nullable endings', () => {
    const event = normalizeApiEvent({
      id: 'event_1',
      name: 'Open-ended tournament',
      end: null,
      noFixedEndDateTime: true,
      sport: { id: 'sport_1', name: 'Volleyball' },
      organization: { id: 'org_1', name: 'River City Sports Club' },
      fields: [{ id: 'field_1', name: 'Court 1' }],
      teams: [{ id: 'team_1', name: 'Cascade Crew' }],
      matches: [{
        id: 'match_1',
        segments: [{ id: 'segment_1', scores: {} }],
        incidents: [{ id: 'incident_1' }],
      }],
    } as unknown as Event);

    expect(event).toEqual(expect.objectContaining({
      $id: 'event_1',
      end: null,
      sport: expect.objectContaining({ $id: 'sport_1' }),
      organization: expect.objectContaining({ $id: 'org_1' }),
    }));
    expect(event?.fields?.[0].$id).toBe('field_1');
    expect(event?.teams?.[0].$id).toBe('team_1');
    expect(event?.matches?.[0].$id).toBe('match_1');
    expect(event?.matches?.[0].segments?.[0].$id).toBe('segment_1');
    expect(event?.matches?.[0].incidents?.[0].$id).toBe('incident_1');
  });

  it('adapts canonical-only standalone fields, teams, and matches', () => {
    expect(normalizeApiField({ id: 'field_1' } as unknown as Field).$id).toBe('field_1');
    expect(normalizeApiTeam({ id: 'team_1' } as unknown as Team).$id).toBe('team_1');
    expect(normalizeApiMatch({ id: 'match_1' } as unknown as Match).$id).toBe('match_1');
  });
});
