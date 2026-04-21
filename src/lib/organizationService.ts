'use client';

import { apiRequest } from '@/lib/apiClient';
import { createId } from '@/lib/id';
import {
  isOrganizationVerificationReviewStatus,
  resolveOrganizationVerificationStatus,
} from '@/lib/organizationVerification';
import type { Event, Field, Invite, Organization, Product, StaffMember, StaffMemberType, Team, UserData } from '@/types';
import { fieldService } from './fieldService';
import { eventService } from './eventService';
import { buildPayload } from './utils';
import { userService } from './userService';
import { productService } from './productService';
import { teamService } from './teamService';
import {
  deriveOrganizationRoleIds,
  deriveStaffInviteTypes,
  getBlockingStaffInvite,
  normalizeInviteStatus,
  normalizeInviteType,
  normalizeStaffMemberTypes,
} from './staff';

type AnyRow = Record<string, any> & { $id: string };
type OrganizationFetchMode = 'base' | 'eventForm' | 'full';
type CachedOrganizationEntry = {
  expiresAt: number;
  value: Organization;
};
export type PublicSlugCheckResult = {
  slug: string | null;
  available: boolean;
  valid: boolean;
  current: boolean;
  error?: string;
};

class OrganizationService {
  private readonly organizationCacheTtlMs = 5_000;

  private readonly organizationRequestCache = new Map<string, Promise<Organization | undefined>>();

  private readonly organizationValueCache = new Map<string, CachedOrganizationEntry>();

  private cloneValue<T>(value: T): T {
    const structuredCloneFn = (globalThis as { structuredClone?: <U>(input: U) => U }).structuredClone;
    if (structuredCloneFn) {
      return structuredCloneFn(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private getOrganizationCacheKey(id: string, mode: OrganizationFetchMode): string {
    return `${mode}:${id}`;
  }

  private invalidateOrganizationCache(id?: string): void {
    if (!id) {
      return;
    }
    Array.from(this.organizationValueCache.keys())
      .filter((key) => key.endsWith(`:${id}`))
      .forEach((key) => {
        this.organizationValueCache.delete(key);
      });
    Array.from(this.organizationRequestCache.keys())
      .filter((key) => key.endsWith(`:${id}`))
      .forEach((key) => {
        this.organizationRequestCache.delete(key);
      });
  }

  private async fetchOrganizationById(
    id: string,
    mode: OrganizationFetchMode,
  ): Promise<Organization | undefined> {
    const normalizedId = id.trim();
    if (!normalizedId) {
      return undefined;
    }

    const cacheKey = this.getOrganizationCacheKey(normalizedId, mode);
    const cached = this.organizationValueCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return this.cloneValue(cached.value);
    }

    const inFlight = this.organizationRequestCache.get(cacheKey);
    if (inFlight) {
      const result = await inFlight;
      return result ? this.cloneValue(result) : undefined;
    }

    const request = (async () => {
      try {
        const response = await apiRequest<any>(`/api/organizations/${normalizedId}`);
        const organization = this.mapRowToOrganization(response as AnyRow);
        let hydrated = organization;
        if (mode === 'full') {
          hydrated = await this.withRelations(organization);
        } else if (mode === 'eventForm') {
          hydrated = await this.withEventFormRelations(organization);
        }
        this.organizationValueCache.set(cacheKey, {
          value: this.cloneValue(hydrated),
          expiresAt: Date.now() + this.organizationCacheTtlMs,
        });
        return hydrated;
      } catch (e) {
        console.error('Failed to fetch organization:', e);
        return undefined;
      } finally {
        this.organizationRequestCache.delete(cacheKey);
      }
    })();

    this.organizationRequestCache.set(cacheKey, request);
    const result = await request;
    return result ? this.cloneValue(result) : undefined;
  }

  private mapInvite(row: Record<string, unknown>): Invite {
    return {
      $id: String(row.$id ?? row.id ?? ''),
      type: normalizeInviteType(row.type) ?? 'STAFF',
      email: typeof row.email === 'string' ? row.email : undefined,
      status: normalizeInviteStatus(row.status) ?? undefined,
      staffTypes: deriveStaffInviteTypes({ staffTypes: row.staffTypes as Invite['staffTypes'] }, typeof row.type === 'string' ? row.type : null),
      userId: typeof row.userId === 'string' ? row.userId : null,
      eventId: typeof row.eventId === 'string' ? row.eventId : null,
      organizationId: typeof row.organizationId === 'string' ? row.organizationId : null,
      teamId: typeof row.teamId === 'string' ? row.teamId : null,
      createdBy: typeof row.createdBy === 'string' ? row.createdBy : null,
      firstName: typeof row.firstName === 'string' ? row.firstName : undefined,
      lastName: typeof row.lastName === 'string' ? row.lastName : undefined,
      $createdAt: typeof row.$createdAt === 'string' ? row.$createdAt : undefined,
      $updatedAt: typeof row.$updatedAt === 'string' ? row.$updatedAt : undefined,
    };
  }

  private mapStaffMember(row: Record<string, unknown>): StaffMember {
    return {
      $id: String(row.$id ?? row.id ?? ''),
      organizationId: String(row.organizationId ?? ''),
      userId: String(row.userId ?? ''),
      types: normalizeStaffMemberTypes(row.types),
      $createdAt: typeof row.$createdAt === 'string' ? row.$createdAt : undefined,
      $updatedAt: typeof row.$updatedAt === 'string' ? row.$updatedAt : undefined,
    };
  }

  private resolveCoordinates(row: AnyRow): [number, number] | undefined {
    if (Array.isArray(row.coordinates) && row.coordinates.length >= 2) {
      const [lngRaw, latRaw] = row.coordinates;
      const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
      const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        return [lng, lat];
      }
    }

    const latRaw = row.lat ?? row.latitude;
    const lngRaw = row.long ?? row.longitude;
    const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
    const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lng, lat];
    }

    return undefined;
  }

  private mapRowToOrganization(row: AnyRow): Organization {
    const coordinates = this.resolveCoordinates(row);
    const officialIds = Array.isArray(row.officialIds)
      ? row.officialIds.map((value: unknown) => String(value))
      : undefined;
    const hostIds = Array.isArray(row.hostIds)
      ? row.hostIds.map((value: unknown) => String(value))
      : undefined;
    const productIds = Array.isArray(row.productIds)
      ? row.productIds.map((value: unknown) => String(value))
      : undefined;
    const sports = Array.isArray(row.sports)
      ? row.sports
        .filter((value: unknown): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
      : undefined;

    const staffInvites = Array.isArray(row.staffInvites)
      ? row.staffInvites.map((value: unknown) => this.mapInvite(value as Record<string, unknown>))
      : [];
    const staffMembers = Array.isArray(row.staffMembers)
      ? row.staffMembers.map((value: unknown) => this.mapStaffMember(value as Record<string, unknown>))
      : [];
    const derivedHostIds = deriveOrganizationRoleIds(staffMembers, staffInvites, 'HOST');
    const derivedOfficialIds = deriveOrganizationRoleIds(staffMembers, staffInvites, 'OFFICIAL');

    const organization: Organization = {
      $id: row.$id,
      name: row.name ?? '',
      description: row.description ?? undefined,
      website: row.website ?? undefined,
      sports,
      logoId: row.logoId ?? row.logo_id ?? undefined,
      location: row.location ?? undefined,
      address: row.address ?? undefined,
      coordinates: coordinates,
      ownerId: row.ownerId ?? row.owner_id ?? undefined,
      hostIds: staffMembers.length > 0 ? derivedHostIds : hostIds,
      hasStripeAccount: Boolean(row.hasStripeAccount),
      verificationStatus: resolveOrganizationVerificationStatus({
        verificationStatus: row.verificationStatus,
        hasStripeAccount: row.hasStripeAccount,
      }),
      verifiedAt: typeof row.verifiedAt === 'string'
        ? row.verifiedAt
        : row.verifiedAt instanceof Date
          ? row.verifiedAt.toISOString()
          : undefined,
      verificationReviewStatus: isOrganizationVerificationReviewStatus(row.verificationReviewStatus)
        ? row.verificationReviewStatus
        : undefined,
      verificationReviewNotes: typeof row.verificationReviewNotes === 'string'
        ? row.verificationReviewNotes
        : undefined,
      verificationReviewUpdatedAt: typeof row.verificationReviewUpdatedAt === 'string'
        ? row.verificationReviewUpdatedAt
        : row.verificationReviewUpdatedAt instanceof Date
          ? row.verificationReviewUpdatedAt.toISOString()
          : undefined,
      officialIds: staffMembers.length > 0 ? derivedOfficialIds : officialIds,
      staffMembers,
      staffInvites,
      staffEmailsByUserId: row.staffEmailsByUserId && typeof row.staffEmailsByUserId === 'object'
        ? Object.fromEntries(
          Object.entries(row.staffEmailsByUserId as Record<string, unknown>)
            .filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'),
        )
        : undefined,
      productIds,
      publicSlug: typeof row.publicSlug === 'string' ? row.publicSlug : null,
      publicPageEnabled: Boolean(row.publicPageEnabled),
      publicWidgetsEnabled: Boolean(row.publicWidgetsEnabled),
      brandPrimaryColor: typeof row.brandPrimaryColor === 'string' ? row.brandPrimaryColor : null,
      brandAccentColor: typeof row.brandAccentColor === 'string' ? row.brandAccentColor : null,
      publicHeadline: typeof row.publicHeadline === 'string' ? row.publicHeadline : null,
      publicIntroText: typeof row.publicIntroText === 'string' ? row.publicIntroText : null,
      embedAllowedDomains: Array.isArray(row.embedAllowedDomains)
        ? row.embedAllowedDomains
          .filter((value: unknown): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
        : [],
      publicCompletionRedirectUrl: typeof row.publicCompletionRedirectUrl === 'string'
        ? row.publicCompletionRedirectUrl
        : null,
      viewerCanManageOrganization: Boolean(row.viewerCanManageOrganization),
      viewerCanAccessUsers: Boolean(row.viewerCanAccessUsers),
      $createdAt: row.$createdAt,
      $updatedAt: row.$updatedAt,
      events: [],
      teams: [],
      fields: [],
      officials: [],
      hosts: [],
      products: [],
    };

    return organization;
  }

  async createOrganization(data: Partial<Organization> & { name: string; ownerId: string }): Promise<Organization> {
    const payload = buildPayload(data);

    if (data.officialIds !== undefined) {
      payload.officialIds = Array.isArray(data.officialIds) ? data.officialIds : [];
    }
    if (data.hostIds !== undefined) {
      payload.hostIds = Array.isArray(data.hostIds) ? data.hostIds : [];
    }
    if (data.sports !== undefined) {
      payload.sports = Array.isArray(data.sports) ? data.sports : [];
    }

    const response = await apiRequest<any>('/api/organizations', {
      method: 'POST',
      body: { ...payload, id: createId() },
    });
    return this.mapRowToOrganization(response as AnyRow);
  }

  async updateOrganization(id: string, data: Partial<Organization>): Promise<Organization> {
    const payload = buildPayload(data);
    delete (payload as Record<string, unknown>).id;
    delete (payload as Record<string, unknown>).$id;
    delete (payload as Record<string, unknown>).createdAt;
    delete (payload as Record<string, unknown>).$createdAt;
    delete (payload as Record<string, unknown>).updatedAt;
    delete (payload as Record<string, unknown>).$updatedAt;
    delete (payload as Record<string, unknown>).ownerId;
    delete (payload as Record<string, unknown>).events;
    delete (payload as Record<string, unknown>).teams;
    delete (payload as Record<string, unknown>).fields;
    delete (payload as Record<string, unknown>).officials;
    delete (payload as Record<string, unknown>).hosts;
    delete (payload as Record<string, unknown>).owner;
    delete (payload as Record<string, unknown>).staffMembers;
    delete (payload as Record<string, unknown>).staffInvites;
    delete (payload as Record<string, unknown>).staffEmailsByUserId;
    if (data.officialIds !== undefined) {
      payload.officialIds = Array.isArray(data.officialIds) ? data.officialIds : [];
    }
    if (data.hostIds !== undefined) {
      payload.hostIds = Array.isArray(data.hostIds) ? data.hostIds : [];
    }
    if (data.sports !== undefined) {
      payload.sports = Array.isArray(data.sports) ? data.sports : [];
    }
    const response = await apiRequest<any>(`/api/organizations/${id}`, {
      method: 'PATCH',
      body: { organization: payload },
    });
    this.invalidateOrganizationCache(id);
    return this.mapRowToOrganization(response as AnyRow);
  }

  async checkPublicSlug(
    slug: string,
    organizationId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<PublicSlugCheckResult> {
    const params = new URLSearchParams();
    params.set('slug', slug);
    if (organizationId) {
      params.set('organizationId', organizationId);
    }
    return apiRequest<PublicSlugCheckResult>(`/api/organizations/public-slug?${params.toString()}`, {
      signal: options.signal,
      timeoutMs: 5_000,
    });
  }

  async getOrganizationsByOwner(ownerId: string): Promise<Organization[]> {
    const params = new URLSearchParams();
    params.set('ownerId', ownerId);
    params.set('limit', '100');
    const response = await apiRequest<{ organizations?: AnyRow[] }>(`/api/organizations?${params.toString()}`);
    return (response.organizations ?? []).map((row) => this.mapRowToOrganization(row));
  }

  async getOrganizationsByUser(userId: string): Promise<Organization[]> {
    const params = new URLSearchParams();
    params.set('userId', userId);
    params.set('limit', '100');
    const response = await apiRequest<{ organizations?: AnyRow[] }>(`/api/organizations?${params.toString()}`);
    return (response.organizations ?? []).map((row) => this.mapRowToOrganization(row));
  }

  async updateStaffMemberTypes(organizationId: string, userId: string, types: StaffMemberType[]): Promise<StaffMember> {
    const response = await apiRequest<{ staffMember: Record<string, unknown> }>(`/api/organizations/${organizationId}/staff`, {
      method: 'PATCH',
      body: { userId, types },
    });
    this.invalidateOrganizationCache(organizationId);
    return this.mapStaffMember(response.staffMember);
  }

  async removeStaffMember(organizationId: string, userId: string): Promise<void> {
    await apiRequest(`/api/organizations/${organizationId}/staff`, {
      method: 'DELETE',
      body: { userId },
    });
    this.invalidateOrganizationCache(organizationId);
  }

  async inviteExistingStaff(
    organizationId: string,
    userId: string,
    staffTypes: StaffMemberType[],
  ): Promise<Invite> {
    const response = await apiRequest<{ invites?: Array<Record<string, unknown>> }>('/api/invites', {
      method: 'POST',
      body: {
        invites: [{
          type: 'STAFF',
          organizationId,
          userId,
          staffTypes,
          status: 'PENDING',
        }],
      },
    });
    const invite = response.invites?.[0];
    if (!invite) {
      throw new Error('Failed to create staff invite');
    }
    this.invalidateOrganizationCache(organizationId);
    return this.mapInvite(invite);
  }

  async getOrganizationsByIds(ids: string[]): Promise<Organization[]> {
    const organizationIds = ids.filter((id): id is string => typeof id === 'string' && Boolean(id));
    if (!organizationIds.length) return [];

    try {
      const params = new URLSearchParams();
      params.set('ids', organizationIds.join(','));
      const response = await apiRequest<{ organizations?: AnyRow[] }>(`/api/organizations?${params.toString()}`);
      const rows = Array.isArray(response.organizations) ? (response.organizations as AnyRow[]) : [];
      return rows.map((row) => this.mapRowToOrganization(row));
    } catch (error) {
      console.error('Failed to fetch organizations by ids:', error);
      return [];
    }
  }

  async getOrganizationById(id: string, includeRelations: boolean = true): Promise<Organization | undefined> {
    return this.fetchOrganizationById(id, includeRelations ? 'full' : 'base');
  }

  invalidateCachedOrganization(id?: string): void {
    this.invalidateOrganizationCache(id);
  }

  async getOrganizationByIdForEventForm(id: string): Promise<Organization | undefined> {
    return this.fetchOrganizationById(id, 'eventForm');
  }

  async listOrganizationsWithFields(limit: number = 100): Promise<Organization[]> {
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      const response = await apiRequest<{ organizations?: AnyRow[] }>(`/api/organizations?${params.toString()}`);
      const rows = Array.isArray(response.organizations) ? (response.organizations as AnyRow[]) : [];
      const organizations = rows.map((row) => this.mapRowToOrganization(row));
      return Promise.all(organizations.map((org) => this.withRelations(org)));
    } catch (error) {
      console.error('Failed to list organizations with fields:', error);
      return [];
    }
  }

  private async withEventFormRelations(organization: Organization): Promise<Organization> {
    const fieldsPromise = fieldService.listFields({ organizationId: organization.$id });
    const staffMembers = Array.isArray(organization.staffMembers) ? organization.staffMembers : [];
    const staffInvites = Array.isArray(organization.staffInvites) ? organization.staffInvites : [];
    const staffUserIds = Array.from(new Set(staffMembers.map((member) => member.userId).filter(Boolean)));
    const staffUsersPromise = staffUserIds.length ? userService.getUsersByIds(staffUserIds) : Promise.resolve<UserData[]>([]);
    const ownerPromise = organization.ownerId
      ? userService.getUserById(organization.ownerId)
      : Promise.resolve(undefined);

    const [fields, staffUsers, owner] = await Promise.all([
      fieldsPromise,
      staffUsersPromise,
      ownerPromise,
    ]);

    const staffUsersById = new Map(staffUsers.map((userEntry) => [userEntry.$id, userEntry] as const));
    const hydratedStaffMembers = staffMembers.map((staffMember) => {
      const userEntry = staffUsersById.get(staffMember.userId);
      const invite = getBlockingStaffInvite(staffInvites, staffMember.organizationId, staffMember.userId)
        ? staffInvites.find((entry) => entry.organizationId === staffMember.organizationId && entry.userId === staffMember.userId) ?? null
        : null;
      return {
        ...staffMember,
        user: userEntry,
        invite,
      };
    });
    const activeHostIds = deriveOrganizationRoleIds(hydratedStaffMembers, staffInvites, 'HOST');
    const activeOfficialIds = deriveOrganizationRoleIds(hydratedStaffMembers, staffInvites, 'OFFICIAL');

    organization.fields = fields;
    organization.staffMembers = hydratedStaffMembers;
    organization.hostIds = activeHostIds;
    organization.officialIds = activeOfficialIds;
    organization.officials = activeOfficialIds
      .map((userId) => staffUsersById.get(userId))
      .filter((entry): entry is UserData => Boolean(entry));
    organization.hosts = activeHostIds
      .map((userId) => staffUsersById.get(userId))
      .filter((entry): entry is UserData => Boolean(entry));
    organization.owner = owner;

    return organization;
  }

    private async withRelations(organization: Organization): Promise<Organization> {
      const fieldsPromise = fieldService.listFields({ organizationId: organization.$id });
      const staffMembers = Array.isArray(organization.staffMembers) ? organization.staffMembers : [];
      const staffInvites = Array.isArray(organization.staffInvites) ? organization.staffInvites : [];
      const staffUserIds = Array.from(new Set(staffMembers.map((member) => member.userId).filter(Boolean)));
      const staffUsersPromise = staffUserIds.length ? userService.getUsersByIds(staffUserIds) : Promise.resolve<UserData[]>([]);
      const ownerPromise = organization.ownerId
        ? userService.getUserById(organization.ownerId)
        : Promise.resolve(undefined);

      const productsPromise: Promise<Product[]> = productService.listProducts(organization.$id);
      const teamsPromise: Promise<Team[]> = teamService.getTeamsByOrganizationId(organization.$id, true);

      const [fields, events, staffUsers, owner, products, teams] = await Promise.all([
        fieldsPromise,
        this.fetchEventsByOrganization(organization.$id),
        staffUsersPromise,
        ownerPromise,
        productsPromise,
        teamsPromise,
      ]);

      const staffUsersById = new Map(staffUsers.map((userEntry) => [userEntry.$id, userEntry] as const));
      const hydratedStaffMembers = staffMembers.map((staffMember) => {
        const userEntry = staffUsersById.get(staffMember.userId);
        const invite = getBlockingStaffInvite(staffInvites, staffMember.organizationId, staffMember.userId)
          ? staffInvites.find((entry) => entry.organizationId === staffMember.organizationId && entry.userId === staffMember.userId) ?? null
          : null;
        return {
          ...staffMember,
          user: userEntry,
          invite,
        };
      });
      const activeHostIds = deriveOrganizationRoleIds(hydratedStaffMembers, staffInvites, 'HOST');
      const activeOfficialIds = deriveOrganizationRoleIds(hydratedStaffMembers, staffInvites, 'OFFICIAL');
      const activeHosts = activeHostIds
        .map((id) => staffUsersById.get(id))
        .filter((entry): entry is UserData => Boolean(entry));
      const activeOfficials = activeOfficialIds
        .map((id) => staffUsersById.get(id))
        .filter((entry): entry is UserData => Boolean(entry));

      organization.fields = fields;
      organization.events = events;
      organization.staffMembers = hydratedStaffMembers;
      organization.hostIds = activeHostIds;
      organization.officialIds = activeOfficialIds;
      organization.officials = activeOfficials;
      organization.hosts = activeHosts;
      organization.owner = owner;
      organization.products = products;
      organization.teams = teams;

      return organization;
    }

  private async fetchEventsByOrganization(organizationId: string): Promise<Event[]> {
    const params = new URLSearchParams();
    params.set('organizationId', organizationId);
    params.set('limit', '200');
    const response = await apiRequest<{ events?: any[] }>(`/api/events?${params.toString()}`);
    const rows = Array.isArray(response.events) ? response.events : [];
    const events = await Promise.all(
      rows.map((row: any) => eventService.mapRowFromDatabase(row, false)),
    );
    return events.filter((event): event is Event => Boolean(event));
  }
}

export const organizationService = new OrganizationService();

