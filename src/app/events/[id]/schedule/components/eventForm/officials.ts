import type {
    EventOfficial,
    EventOfficialPosition,
    OfficialSchedulingMode,
    SportOfficialPositionTemplate,
} from '@/types';
import { createClientId } from '@/lib/clientId';

export const normalizeOfficialSchedulingMode = (value: unknown): OfficialSchedulingMode => {
    if (value === 'NONE') {
        return 'OFF';
    }
    if (value === 'STAFFING' || value === 'TEAM_STAFFING' || value === 'SCHEDULE' || value === 'OFF') {
        return value;
    }
    return 'SCHEDULE';
};

export const normalizeSportOfficialPositionTemplates = (value: unknown): SportOfficialPositionTemplate[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }
            const row = entry as Record<string, unknown>;
            const name = String(row.name ?? '').trim();
            if (!name) {
                return null;
            }
            const count = Number(row.count);
            return {
                name,
                count: Number.isFinite(count) ? Math.max(1, Math.trunc(count)) : 1,
            } satisfies SportOfficialPositionTemplate;
        })
        .filter((entry): entry is SportOfficialPositionTemplate => Boolean(entry));
};

export const buildOfficialPositionsFromTemplates = (
    templates: SportOfficialPositionTemplate[],
): EventOfficialPosition[] => templates.map((template, index) => ({
    id: createClientId(),
    name: template.name,
    count: Math.max(1, Math.trunc(template.count || 1)),
    order: index,
}));

export const normalizeEventOfficialPositions = (
    value: unknown,
    fallbackTemplates: SportOfficialPositionTemplate[] = [],
): EventOfficialPosition[] => {
    if (!Array.isArray(value) || value.length === 0) {
        return buildOfficialPositionsFromTemplates(fallbackTemplates);
    }

    const normalized = value
        .map((entry, index) => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }
            const row = entry as Record<string, unknown>;
            const name = String(row.name ?? '').trim();
            if (!name) {
                return null;
            }
            const id = String(row.id ?? '').trim() || createClientId();
            const count = Number(row.count);
            const order = Number(row.order);
            return {
                id,
                name,
                count: Number.isFinite(count) ? Math.max(1, Math.trunc(count)) : 1,
                order: Number.isFinite(order) ? Math.max(0, Math.trunc(order)) : index,
            } satisfies EventOfficialPosition;
        })
        .filter((entry): entry is EventOfficialPosition => Boolean(entry))
        .sort((left, right) => left.order - right.order);

    return normalized.map((entry, index) => ({
        ...entry,
        order: index,
    }));
};

export const normalizeEventOfficials = (
    value: unknown,
    officialIds: string[],
    positions: EventOfficialPosition[],
): EventOfficial[] => {
    const normalizedOfficialIds = Array.isArray(value)
        ? Array.from(
            new Set(
                value
                    .map((entry) => (
                        entry && typeof entry === 'object'
                            ? String((entry as Record<string, unknown>).userId ?? '').trim()
                            : ''
                    ))
                    .filter((id) => id.length > 0),
            ),
        )
        : Array.from(
            new Set(
                officialIds
                    .map((id) => String(id).trim())
                    .filter((id) => id.length > 0),
            ),
        );
    const allowedOfficialIdSet = new Set(normalizedOfficialIds);
    const positionIds = positions.map((position) => position.id);
    const positionIdSet = new Set(positionIds);

    const byUserId = new Map<string, EventOfficial>();
    if (Array.isArray(value)) {
        value.forEach((entry) => {
            if (!entry || typeof entry !== 'object') {
                return;
            }
            const row = entry as Record<string, unknown>;
            const userId = String(row.userId ?? '').trim();
            if (!userId || !allowedOfficialIdSet.has(userId)) {
                return;
            }
            const positionIdsForOfficial = Array.isArray(row.positionIds)
                ? Array.from(
                    new Set(
                        row.positionIds
                            .map((positionId) => String(positionId).trim())
                            .filter((positionId) => positionId.length > 0 && positionIdSet.has(positionId)),
                    ),
                )
                : [];
            byUserId.set(userId, {
                id: String(row.id ?? '').trim() || createClientId(),
                userId,
                positionIds: positionIdsForOfficial.length ? positionIdsForOfficial : [...positionIds],
                fieldIds: Array.isArray(row.fieldIds)
                    ? Array.from(
                        new Set(
                            row.fieldIds
                                .map((fieldId) => String(fieldId).trim())
                                .filter((fieldId) => fieldId.length > 0),
                        ),
                    )
                    : [],
                isActive: row.isActive === undefined ? true : Boolean(row.isActive),
            });
        });
    }

    return normalizedOfficialIds.map((userId) => {
        const existing = byUserId.get(userId);
        if (existing) {
            return existing;
        }
        return {
            id: createClientId(),
            userId,
            positionIds: [...positionIds],
            fieldIds: [],
            isActive: true,
        } satisfies EventOfficial;
    });
};

export const getEventOfficialUserIds = (eventOfficials: unknown): string[] => (
    Array.isArray(eventOfficials)
        ? Array.from(
            new Set(
                eventOfficials
                    .map((entry) => (
                        entry && typeof entry === 'object'
                            ? String((entry as Record<string, unknown>).userId ?? '').trim()
                            : ''
                    ))
                    .filter((id) => id.length > 0),
            ),
        )
        : []
);
