import { databases } from '@/app/appwrite';
import { Event, LocationCoordinates, getCategoryFromEvent, isTournament, PickupEvent, Tournament } from '@/types';
import { locationService } from './locationService';
import { Query } from 'appwrite';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const EVENTS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID!;

export interface EventFilters {
  category?: string;
  query?: string;
  maxDistance?: number; // in kilometers
  userLocation?: LocationCoordinates;
  dateFrom?: string;
  dateTo?: string;
  priceMax?: number;
  eventTypes?: ('pickup' | 'tournament')[];
  sports?: string[];
  divisions?: string[];
  fieldType?: string;
}

class EventService {

  // Get all events from the unified table
  async getAllEvents(): Promise<Event[]> {
    try {
      const response = await databases.listRows(
        DATABASE_ID,
        EVENTS_TABLE_ID,
        [
          Query.orderDesc('$createdAt'),
          Query.limit(100)
        ]
      );

      return response.rows.map(row => this.mapRowToEvent(row));
    } catch (error) {
      console.error('Failed to fetch events:', error);
      throw new Error('Failed to load events');
    }
  }

  // Get events with filters
  async getFilteredEvents(filters: EventFilters): Promise<Event[]> {
    try {
      const queries: string[] = [
        Query.orderDesc('$createdAt'),
        Query.limit(100)
      ];

      // Add eventType filter
      if (filters.eventTypes && filters.eventTypes.length > 0 && filters.eventTypes.length < 2) {
        queries.push(Query.equal('eventType', filters.eventTypes));
      }

      // Add sports filter
      if (filters.sports && filters.sports.length > 0) {
        queries.push(Query.equal('sport', filters.sports));
      }

      // Add divisions filter
      if (filters.divisions && filters.divisions.length > 0) {
        queries.push(Query.contains('divisions', filters.divisions));
      }

      // Add fieldType filter
      if (filters.fieldType) {
        queries.push(Query.equal('fieldType', filters.fieldType));
      }

      // Add date filters
      if (filters.dateFrom) {
        queries.push(Query.greaterThanEqual('start', filters.dateFrom));
      }
      if (filters.dateTo) {
        queries.push(Query.lessThanEqual('end', filters.dateTo));
      }

      // Add price filter
      if (filters.priceMax !== undefined) {
        queries.push(Query.lessThanEqual('price', filters.priceMax));
      }

      const response = await databases.listRows(
        DATABASE_ID,
        EVENTS_TABLE_ID,
        queries
      );

      let events = response.rows.map(row => this.mapRowToEvent(row));

      // Apply text search filter (client-side since Appwrite search requires indexes)
      if (filters.query) {
        const searchTerm = filters.query.toLowerCase();
        events = events.filter(event =>
          event.name.toLowerCase().includes(searchTerm) ||
          event.description.toLowerCase().includes(searchTerm) ||
          event.location.toLowerCase().includes(searchTerm) ||
          event.sport.toLowerCase().includes(searchTerm)
        );
      }

      // Apply category filter (derived from sport)
      if (filters.category && filters.category !== 'All') {
        events = events.filter(event => {
          const eventCategory = getCategoryFromEvent(event);
          return eventCategory === filters.category;
        });
      }

      // Apply location-based filtering
      if (filters.userLocation && filters.maxDistance) {
        events = events.filter(event => {
          const distance = locationService.calculateDistance(
            filters.userLocation!.lat,
            filters.userLocation!.lng,
            event.lat,
            event.long
          );

          return distance <= filters.maxDistance!;
        });

        // Sort by distance
        events.sort((a, b) => {
          const distanceA = locationService.calculateDistance(
            filters.userLocation!.lat,
            filters.userLocation!.lng,
            a.lat,
            a.long
          );
          const distanceB = locationService.calculateDistance(
            filters.userLocation!.lat,
            filters.userLocation!.lng,
            b.lat,
            b.long
          );
          return distanceA - distanceB;
        });
      } else {
        // Sort by start date if no location sorting
        events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      }

      return events;
    } catch (error) {
      console.error('Failed to fetch filtered events:', error);
      throw new Error('Failed to load events');
    }
  }

  // Get single event by ID
  async getEventById(id: string): Promise<Event | null> {
    try {
      const response = await databases.getRow(
        DATABASE_ID,
        EVENTS_TABLE_ID,
        id
      );

      return this.mapRowToEvent(response);
    } catch (error) {
      console.error('Failed to fetch event:', error);
      return null;
    }
  }

  // Get events by sport
  async getEventsBySport(sport: string): Promise<Event[]> {
    try {
      const response = await databases.listRows(
        DATABASE_ID,
        EVENTS_TABLE_ID,
        [
          Query.equal('sport', sport),
          Query.orderDesc('$createdAt'),
          Query.limit(100)
        ]
      );

      return response.rows.map(row => this.mapRowToEvent(row));
    } catch (error) {
      console.error('Failed to fetch events by sport:', error);
      throw new Error('Failed to load events');
    }
  }

  // Get pickup events only
  async getPickupEvents(): Promise<PickupEvent[]> {
    try {
      const response = await databases.listRows(
        DATABASE_ID,
        EVENTS_TABLE_ID,
        [
          Query.equal('eventType', 'pickup'),
          Query.orderDesc('$createdAt'),
          Query.limit(100)
        ]
      );

      return response.rows.map(row => this.mapRowToEvent(row)) as PickupEvent[];
    } catch (error) {
      console.error('Failed to fetch pickup events:', error);
      throw new Error('Failed to load pickup events');
    }
  }

  // Get tournaments only
  async getTournaments(): Promise<Tournament[]> {
    try {
      const response = await databases.listRows(
        DATABASE_ID,
        EVENTS_TABLE_ID,
        [
          Query.equal('eventType', 'tournament'),
          Query.orderDesc('$createdAt'),
          Query.limit(100)
        ]
      );

      return response.rows.map(row => this.mapRowToEvent(row)) as Tournament[];
    } catch (error) {
      console.error('Failed to fetch tournaments:', error);
      throw new Error('Failed to load tournaments');
    }
  }

  // Map Appwrite row to Event (unified mapping)
  private mapRowToEvent(row: any): Event {
    const baseEvent: Event = {
      id: row.$id,
      name: row.name,
      description: row.description,
      start: row.start,
      end: row.end,
      location: row.location,
      lat: row.lat,
      long: row.long,
      divisions: row.divisions || [],
      fieldType: row.fieldType,
      price: row.price || 0,
      rating: row.rating,
      imageUrl: row.imageUrl || '',
      hostId: row.hostId,
      maxParticipants: row.maxParticipants || 0,
      teamSizeLimit: row.teamSizeLimit || 0,
      teamSignup: row.teamSignup || false,
      singleDivision: row.singleDivision || false,
      waitList: row.waitList || [],
      freeAgents: row.freeAgents || [],
      playerIds: row.playerIds || [],
      teamIds: row.teamIds || [],
      cancellationRefundHours: row.cancellationRefundHours || 0,
      registrationCutoffHours: row.registrationCutoffHours || 0,
      seedColor: row.seedColor || 0,
      isTaxed: row.isTaxed || false,
      createdAt: row.$createdAt,
      updatedAt: row.$updatedAt,

      // New unified table columns
      eventType: row.eventType as 'pickup' | 'tournament',
      sport: row.sport,

      // Computed properties
      attendees: (row.playerIds || []).length,
      coordinates: { lat: row.lat, lng: row.long },
      category: getCategoryFromEvent({ sport: row.sport } as Event)
    };

    // Add tournament-specific fields if it's a tournament
    if (row.eventType === 'tournament') {
      baseEvent.doubleElimination = row.doubleElimination || false;
      baseEvent.winnerSetCount = row.winnerSetCount || 0;
      baseEvent.loserSetCount = row.loserSetCount || 0;
      baseEvent.winnerBracketPointsToVictory = row.winnerBracketPointsToVictory || [];
      baseEvent.loserBracketPointsToVictory = row.loserBracketPointsToVictory || [];
      baseEvent.winnerScoreLimitsPerSet = row.winnerScoreLimitsPerSet || [];
      baseEvent.loserScoreLimitsPerSet = row.loserScoreLimitsPerSet || [];
      baseEvent.prize = row.prize || '';
    }

    return baseEvent;
  }
}

export const eventService = new EventService();
