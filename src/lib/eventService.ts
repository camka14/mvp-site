import { databases } from '@/app/appwrite';
import { Event, LocationCoordinates, getCategoryFromEvent } from '@/types';
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

export interface Division {
  id: string;
  name: string;
  skillLevel: string;
  minRating?: number;
  maxRating?: number;
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
  divisions?: Division[]; // ✅ CHANGED FROM string[] TO Division[]
  cancellationRefundHours?: number;
  registrationCutoffHours?: number;
  imageId?: string;
  seedColor?: number;
  waitList?: string[];
  freeAgents?: string[];
  playerIds?: string[];
  teamIds?: string[];
  hostId?: string;

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
  private getLatLngBounds(center: LocationCoordinates, distanceKm: number) {
    // Rough bounding box calculation
    const latDelta = distanceKm / 111; // degrees per km
    const lngDelta = distanceKm / (111 * Math.cos(center.lat * Math.PI / 180));
    return {
      minLat: center.lat - latDelta,
      maxLat: center.lat + latDelta,
      minLng: center.lng - lngDelta,
      maxLng: center.lng + lngDelta
    };
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

  // Add this method to your EventService class
  async updateEventParticipants(eventId: string, updates: { playerIds: string[], teamIds: string[] }): Promise<Event | undefined> {
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
      const response = await databases.updateRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: eventId,
        data: eventData
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


  async addFreeAgent(eventId: string, userId: string): Promise<Event | undefined> {
    try {
      const existing = await this.getEventById(eventId);
      if (!existing) return undefined;
      const freeAgents = Array.from(new Set([...(existing.freeAgents || []), userId]));
      const response = await databases.updateRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: eventId,
        data: { freeAgents }
      });
      return this.mapRowToEvent(response);
    } catch (error) {
      console.error('Failed to add free agent:', error);
      throw error;
    }
  }

  async addToWaitlist(eventId: string, entryId: string): Promise<Event | undefined> {
    try {
      const existing = await this.getEventById(eventId);
      if (!existing) return undefined;
      const waitList = Array.from(new Set([...(existing.waitList || []), entryId]));
      const response = await databases.updateRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: eventId,
        data: { waitList }
      });
      return this.mapRowToEvent(response);
    } catch (error) {
      console.error('Failed to add to waitlist:', error);
      throw error;
    }
  }

  async removeFreeAgent(eventId: string, userId: string): Promise<Event | undefined> {
    try {
      const existing = await this.getEventById(eventId);
      if (!existing) return undefined;
      const freeAgents = (existing.freeAgents || []).filter(id => id !== userId);
      const response = await databases.updateRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: eventId,
        data: { freeAgents }
      });
      return this.mapRowToEvent(response);
    } catch (error) {
      console.error('Failed to remove free agent:', error);
      throw error;
    }
  }


  async getFilteredEvents(filters: EventFilters): Promise<Event[]> {
    try {
      const queries: string[] = [
        Query.orderDesc('$createdAt'),
        Query.limit(100)
      ];

      if (filters.eventTypes && filters.eventTypes.length > 0 && filters.eventTypes.length < 2) {
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

      const response = await databases.listRows({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        queries
      });

      let events = response.rows.map(row => this.mapRowToEvent(row));

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
        events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      }

      return events;
    } catch (error) {
      console.error('Failed to fetch filtered events:', error);
      throw new Error('Failed to load events');
    }
  }

  async getEventsPaginated(filters: EventFilters, limit: number = 18, offset: number = 0): Promise<Event[]> {
    try {
      const queries: string[] = [];

      // Ordering for stable pagination (by start date asc)
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

      // If location is provided, narrow by bounding box around location
      if (filters.userLocation && filters.maxDistance) {
        const bounds = this.getLatLngBounds(filters.userLocation, filters.maxDistance);
        queries.push(Query.greaterThanEqual('lat', bounds.minLat));
        queries.push(Query.lessThanEqual('lat', bounds.maxLat));
        queries.push(Query.greaterThanEqual('long', bounds.minLng));
        queries.push(Query.lessThanEqual('long', bounds.maxLng));
      }

      const response = await databases.listRows({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        queries
      });

      let events = response.rows.map(row => this.mapRowToEvent(row));

      // Apply text query filtering client-side for now
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

      // If we used a bounding box, we can still enforce exact distance filtering
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
      }

      return events;
    } catch (error) {
      console.error('Failed to fetch paginated events:', error);
      throw new Error('Failed to load events');
    }
  }

  async getEventById(id: string): Promise<Event | undefined> {
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

  // Map Appwrite row to Event using spread operator
  private mapRowToEvent(row: any): Event {
    return {
      ...row, // Spread all fields from Appwrite row
      // Only define computed properties
      attendees: row.teamSignup ? (row.teamIds || []).length : (row.playerIds || []).length,
      coordinates: { lat: row.lat, lng: row.long },
      category: getCategoryFromEvent({ sport: row.sport } as Event)
    };
  }

  async createEvent(newEvent: Partial<CreateEventData>): Promise<Event> {
    try {
      const response = await databases.createRow({
        databaseId: DATABASE_ID,
        tableId: EVENTS_TABLE_ID,
        rowId: ID.unique(),
        data: newEvent
      });
      if (newEvent.fieldCount) {
        for (const field in Array.from(Array(newEvent.fieldCount + 1)).keys()) {
          if (field === '0') continue;
          await databases.createRow({
            databaseId: DATABASE_ID,
            tableId: process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID!,
            rowId: ID.unique(),
            data: {
              eventIds: [response.$id],
              fieldNumber: field,
              divisions: ["OPEN"],
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

}

export const eventService = new EventService();
