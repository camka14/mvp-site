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
      if (!includeRelations) {
        const response = await databases.getRow({
          databaseId: DATABASE_ID,
          tableId: ORGANIZATIONS_TABLE_ID,
          rowId: id,
        });
        return this.mapRowToOrganization(response as AnyRow) as OrganizationDetail;
      } else {
        const response = await databases.getRow({
          databaseId: DATABASE_ID,
          tableId: ORGANIZATIONS_TABLE_ID,
          rowId: id,
          queries: [Query.select(['fields.*', 'teams.*', 'events.*'])],
        });
      return this.mapRowToOrganization(response as AnyRow) as OrganizationDetail;
      }
    } catch (e) {
      console.error('Failed to fetch organization:', e);
      return undefined;
    }
  }
}

export const organizationService = new OrganizationService();
