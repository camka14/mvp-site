'use client';

import { databases } from '@/app/appwrite';
import { ID, Query } from 'appwrite';
import type { Event, Field, Organization, OrganizationDetail, Team } from '@/types';
import { getCategoryFromEvent } from '@/types';

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
const ORGANIZATIONS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_ORGANIZATIONS_TABLE_ID!;
const FIELDS_TABLE_ID = process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID!;

type AnyRow = Record<string, any> & { $id: string };

class OrganizationService {
  private mapRowToEvent(row: AnyRow): Event {
    return {
      ...(row as any),
      attendees: row.teamSignup ? (row.teamIds || []).length : (row.playerIds || []).length,
      coordinates: { lat: row.lat, lng: row.long },
      category: getCategoryFromEvent({ sport: row.sport } as Event),
    } as Event;
  }

  private mapRowToTeam(row: AnyRow): Team {
    const currentSize = (row.playerIds || []).length;
    const maxPlayers = row.teamSize;
    return {
      ...(row as any),
      profileImageId: row.profileImage || row.profileImageId || row.profileImageID,
      currentSize,
      isFull: currentSize >= maxPlayers,
      winRate: Math.round(((row.wins || 0) / Math.max(1, (row.wins || 0) + (row.losses || 0))) * 100),
      avatarUrl: '',
    } as Team;
  }
  private mapRowToOrganization(row: AnyRow): Organization {
    return {
      ...row,
    } as Organization;
  }

  async createOrganization(data: Partial<Organization> & { name: string; ownerId: string }): Promise<Organization> {
    const response = await databases.createRow({
      databaseId: DATABASE_ID,
      tableId: ORGANIZATIONS_TABLE_ID,
      rowId: ID.unique(),
      data,
    });
    return this.mapRowToOrganization(response as AnyRow);
  }

  async getOrganizationsByOwner(ownerId: string): Promise<Organization[]> {
    const response = await databases.listRows({
      databaseId: DATABASE_ID,
      tableId: ORGANIZATIONS_TABLE_ID,
      queries: [Query.equal('ownerId', ownerId), Query.orderDesc('$createdAt'), Query.limit(100)],
    });
    return (response.rows as AnyRow[]).map(this.mapRowToOrganization);
  }

  async getOrganizationById(id: string, includeRelations: boolean = true): Promise<OrganizationDetail | undefined> {
    try {
      const response = await databases.getRow({
        databaseId: DATABASE_ID,
        tableId: ORGANIZATIONS_TABLE_ID,
        rowId: id,
      });
      const base = this.mapRowToOrganization(response as AnyRow);

      if (!includeRelations) return base;

      // Try to use expanded relations if present on the row (Appwrite Tables relations)
      const relEvents = (response as AnyRow).events as AnyRow[] | undefined;
      const relTeams = (response as AnyRow).teams as AnyRow[] | undefined;
      const relFields = (response as AnyRow).fields as AnyRow[] | undefined;

      let events: Event[] = [];
      let teams: Team[] = [];
      let fields: Field[] = [];

      if (Array.isArray(relEvents)) {
        events = relEvents.map((r) => this.mapRowToEvent(r));
      }
      if (Array.isArray(relTeams)) {
        teams = relTeams.map((r) => this.mapRowToTeam(r));
      }
      if (Array.isArray(relFields)) {
        fields = relFields as Field[];
      }

      // Fallback: if not expanded, try fetching by foreign key conventions
      if (events.length === 0) {
        try {
          const list = await databases.listRows({
            databaseId: DATABASE_ID,
            tableId: process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID!,
            queries: [Query.equal('organizationId', id), Query.limit(100)],
          });
          events = (list.rows as AnyRow[]).map((r) => this.mapRowToEvent(r));
        } catch {}
      }
      if (teams.length === 0) {
        try {
          const list = await databases.listRows({
            databaseId: DATABASE_ID,
            tableId: process.env.NEXT_PUBLIC_APPWRITE_TEAMS_TABLE_ID!,
            queries: [Query.equal('organizationId', id), Query.limit(100)],
          });
          teams = (list.rows as AnyRow[]).map((r) => this.mapRowToTeam(r));
        } catch {}
      }
      if (fields.length === 0 && FIELDS_TABLE_ID) {
        try {
          const list = await databases.listRows({
            databaseId: DATABASE_ID,
            tableId: FIELDS_TABLE_ID,
            queries: [Query.equal('organizationId', id), Query.limit(100)],
          });
          fields = (list.rows as AnyRow[]) as unknown as Field[];
        } catch {}
      }

      return {
        ...base,
        events,
        teams,
        fields,
      } as OrganizationDetail;
    } catch (e) {
      console.error('Failed to fetch organization:', e);
      return undefined;
    }
  }
}

export const organizationService = new OrganizationService();
