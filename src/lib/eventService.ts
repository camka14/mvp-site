import { databases } from '@/app/appwrite';
import { Event, EventWithRelations, Tournament, PickupEvent, LocationCoordinates, getCategoryFromEvent, Division, Team, UserData, Field, Match } from '@/types';
import { locationService } from './locationService';
import { ID, Query } from 'appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const EVENTS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID!;

export interface EventFilters {
  category?: string;
  query?: string;
  maxDistance?: number;
  userLocation?: LocationCoordinates;
  dateFrom?: string;
  dateTo?: string;
  priceMax?: number;
  eventTypes?: ('pickup' | 'tournament')[];
  sports?: string[];
  divisions?: string[];
  fieldType?: string;
}

export interface CreateEventData {
  $id?: string;
  name?: string;
  description?: string;
  location?: string;
  lat?: number;
  long?: number;
  start?: string;
  end?: string;
  eventType?: 'pickup' | 'tournament';
  sport?: string;
  fieldType?: string;
  price?: number;
  maxParticipants?: number;
  teamSizeLimit?: number;
  teamSignup?: boolean;
  singleDivision?: boolean;
  divisions?: Division[];
  cancellationRefundHours?: number;
  registrationCutoffHours?: number;
  imageId?: string;
  seedColor?: number;
  waitListIds?: string[];
  freeAgentIds?: string[];
  playerIds?: string[];
  teamIds?: string[];
  hostId?: string;
  organization?: string;

  // Tournament-specific fields
  doubleElimination?: boolean;
  winnerSetCount?: number;
  loserSetCount?: number;
  winnerBracketPointsToVictory?: number[];
  loserBracketPointsToVictory?: number[];
  prize?: string;
  fieldCount?: number;
}

class EventService {
  /**
   * Get event with all relationships expanded (matching Python backend approach)
   * This fetches all related data in a single database call using Appwrite's relationship features
   */
  async getEventWithRelations(id: string): Promise<EventWithRelations | undefined> {
    try {
      // Use Query.select to expand all relationships like in Python backend
      const queries = [
        Query.select([
          '*',
          'matches.*',
          'matches.field.$id',
          'matches.team1.$id',
          'matches.team2.$id',
          'matches.referee.$id',
          'players.*',
          'teams.*',
          'teams.matches.$id',
          'fields.*',
          'fields.matches.$id',
        ])
      ];

      const response = await databases.getRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: id,
        queries
      });

      return this.mapRowToEventWithRelations(response);
    } catch (error) {
      console.error('Failed to fetch event with relations:', error);
      return undefined;
    }
  }

  /**
   * Get basic event without expanded relationships (for list views)
   */
  async getEvent(id: string): Promise<Event | undefined> {
    try {
      const response = await databases.getRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: id
      });

      return this.mapRowToEvent(response);
    } catch (error) {
      console.error('Failed to fetch event:', error);
      return undefined;
    }
  }

  async getAllEvents(): Promise<Event[]> {
    try {
      const response = await databases.listRows({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        queries: [
          Query.orderDesc('$createdAt'),
          Query.limit(100)
        ]
      });

      return response.rows.map(row => this.mapRowToEvent(row));
    } catch (error) {
      console.error('Failed to fetch events:', error);
      throw new Error('Failed to load events');
    }
  }

  async updateEventParticipants(eventId: string, updates: { playerIds: string[], teamIds: string[] }): Promise<Event> {
    try {
      const response = await databases.updateRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: eventId,
        data: updates
      });

      return this.mapRowToEvent(response);
    } catch (error) {
      console.error('Failed to update event participants:', error);
      throw error;
    }
  }

  async updateEvent(eventId: string, eventData: Partial<CreateEventData>): Promise<Event> {
    try {
      const payload = {
        ...eventData,
        ...(eventData?.lat !== undefined && eventData?.long !== undefined
          ? { coordinates: [eventData.long, eventData.lat] as [number, number] }
          : {}),
      };

      const response = await databases.updateRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: eventId,
        data: payload
      });

      return this.mapRowToEvent(response);
    } catch (error) {
      console.error('Failed to update event:', error);
      throw error;
    }
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      await databases.deleteRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: eventId
      });
      return true;
    } catch (error) {
      console.error('Failed to delete event:', error);
      return false;
    }
  }

  async createEvent(newEvent: Partial<CreateEventData>): Promise<Event> {
    try {
      const payload = {
        ...newEvent,
        ...(newEvent?.lat !== undefined && newEvent?.long !== undefined
          ? { coordinates: [newEvent.long, newEvent.lat] as [number, number] }
          : {}),
      };

      const response = await databases.createRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: ID.unique(),
        data: payload
      });

      // Create fields if this is a tournament
      if (newEvent.fieldCount && newEvent.fieldCount > 0) {
        for (let fieldNum = 1; fieldNum <= newEvent.fieldCount; fieldNum++) {
          await databases.createRow({
            databaseId: DATABASE_ID,
            tableId: process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID!,
            rowId: ID.unique(),
            data: {
              eventId: response.$id,
              fieldNumber: fieldNum,
              divisions: ["OPEN"], // Default division
            }
          });
        }
      }

      return this.mapRowToEvent(response);
    } catch (error) {
      console.error('Failed to create event:', error);
      throw error;
    }
  }

  private mapRowToEvent(row: any): Event {
    return {
      ...row,
      // Computed properties
      attendees: row.teamSignup ? (row.teamIds || []).length : (row.playerIds || []).length,
      coordinates: [row.long, row.lat],
      category: getCategoryFromEvent({ sport: row.sport } as Event),
      // Ensure divisions is always an array
      divisions: Array.isArray(row.divisions) ? row.divisions : []
    };
  }

  private mapRowToEventWithRelations(row: any): EventWithRelations {
    const baseEvent = this.mapRowToEvent(row);

    // Setup default divisions
    const divisions: Division[] = [{ id: "OPEN", name: "OPEN" }];

    // Process expanded teams
    const teams: { [key: string]: Team } = {};
    if (row.teams && Array.isArray(row.teams)) {
      row.teams.forEach((teamData: any) => {
        const team: Team = {
          ...teamData,
          division: divisions[0], // Default division
          winRate: this.calculateWinRate(teamData.wins || 0, teamData.losses || 0),
          currentSize: (teamData.playerIds || []).length,
          isFull: (teamData.playerIds || []).length >= (teamData.teamSize || 6),
          avatarUrl: '' // Will be computed by helper function
        };
        teams[team.$id] = team;
      });
    }

    // Process expanded players
    const players: UserData[] = [];
    if (row.players && Array.isArray(row.players)) {
      row.players.forEach((playerData: any) => {
        const player: UserData = {
          ...playerData,
          fullName: `${playerData.firstName || ''} ${playerData.lastName || ''}`.trim(),
          avatarUrl: '' // Will be computed by helper function
        };
        players.push(player);
      });
    }

    // Process fields (for tournaments)
    const fields: { [key: string]: Field } = {};
    if (row.fields && Array.isArray(row.fields)) {
      row.fields.forEach((fieldData: any) => {
        const field: Field = {
          ...fieldData,
          divisions: divisions
        };
        fields[field.$id] = field;
      });
    }

    // Process matches (for tournaments)
    const matches: { [key: string]: Match } = {};
    if (row.matches && Array.isArray(row.matches)) {
      row.matches.forEach((matchData: any) => {
        const match: Match = {
          ...matchData,
          division: divisions[0],
          team1: matchData.team1 ? teams[this.extractId(matchData.team1)] : undefined,
          team2: matchData.team2 ? teams[this.extractId(matchData.team2)] : undefined,
          referee: matchData.referee ? teams[this.extractId(matchData.referee)] : undefined,
          fieldId: matchData.field ? fields[this.extractId(matchData.field)] : undefined,
        };
        matches[match.$id] = match;
      });
    }

    const eventWithRelations: EventWithRelations = {
      ...baseEvent,
      teams,
      players,
      divisions,
      fields: Object.keys(fields).length > 0 ? fields : undefined,
      matches: Object.keys(matches).length > 0 ? matches : undefined,
    };

    return eventWithRelations;
  }

  private extractId(value: any): string {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && value.$id) return value.$id;
    return '';
  }

  private calculateWinRate(wins: number, losses: number): number {
    const totalGames = wins + losses;
    if (totalGames === 0) return 0;
    return Math.round((wins / totalGames) * 100);
  }

  // Pagination methods remain largely the same but updated to use new types
  async getEventsPaginated(filters: EventFilters, limit: number = 18, offset: number = 0): Promise<Event[]> {
    try {
      const queries: string[] = [];

      queries.push(Query.orderAsc('start'));
      queries.push(Query.limit(limit));
      if (offset > 0) queries.push(Query.offset(offset));

      if (filters.eventTypes && filters.eventTypes.length > 0 && filters.eventTypes.length !== 2) {
        queries.push(Query.equal('eventType', filters.eventTypes));
      }

      if (filters.sports && filters.sports.length > 0) {
        queries.push(Query.equal('sport', filters.sports));
      }

      if (filters.divisions && filters.divisions.length > 0) {
        queries.push(Query.contains('divisions', filters.divisions));
      }

      if (filters.fieldType) {
        queries.push(Query.equal('fieldType', filters.fieldType));
      }

      if (filters.dateFrom) {
        queries.push(Query.greaterThanEqual('start', filters.dateFrom));
      }

      if (filters.dateTo) {
        queries.push(Query.lessThanEqual('end', filters.dateTo));
      }

      if (filters.priceMax !== undefined) {
        queries.push(Query.lessThanEqual('price', filters.priceMax));
      }

      if (filters.userLocation && filters.maxDistance) {
        queries.push(
          Query.distanceLessThan(
            'coordinates',
            [filters.userLocation.lng, filters.userLocation.lat],
            Math.round(filters.maxDistance * 1000)
          )
        );
      }

      const response = await databases.listRows({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        queries
      });

      let events = response.rows.map(row => this.mapRowToEvent(row));

      // Apply client-side filtering
      if (filters.query) {
        const searchTerm = filters.query.toLowerCase();
        events = events.filter(event =>
          event.name.toLowerCase().includes(searchTerm) ||
          event.description.toLowerCase().includes(searchTerm) ||
          event.location.toLowerCase().includes(searchTerm) ||
          event.sport.toLowerCase().includes(searchTerm)
        );
      }

      if (filters.category && filters.category !== 'All') {
        events = events.filter(event => {
          const eventCategory = getCategoryFromEvent(event);
          return eventCategory === filters.category;
        });
      }

      return events;
    } catch (error) {
      console.error('Failed to fetch paginated events:', error);
      throw new Error('Failed to load events');
    }
  }
}

export const eventService = new EventService();
