import { databases } from '@/app/appwrite';
import { Event, LocationCoordinates, getCategoryFromEvent } from '@/types';
import { locationService } from './locationService';
import { Query } from 'appwrite';

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

class EventService {

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
}

export const eventService = new EventService();
