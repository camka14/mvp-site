import type { Event, EventTag } from '@/types';

type EventTypeTag = EventTag & {
    name: string;
    slug: string;
};

const EVENT_TYPE_TAGS_BY_TYPE: Record<string, EventTypeTag> = {
    LEAGUE: { name: 'League', slug: 'league' },
    TOURNAMENT: { name: 'Tournament', slug: 'tournament' },
};

const EVENT_TYPE_TAG_SLUGS = new Set(
    Object.values(EVENT_TYPE_TAGS_BY_TYPE).map((tag) => tag.slug),
);

export const slugifyEventTagName = (value: string): string => (
    value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
);

export const getEventTagIdentity = (tag: Pick<EventTag, 'name' | 'slug'>): string => (
    typeof tag.slug === 'string' && tag.slug.trim()
        ? slugifyEventTagName(tag.slug)
        : slugifyEventTagName(tag.name)
);

export const getEventTypeTagForEventType = (eventType: Event['eventType'] | null | undefined): EventTypeTag | null => {
    const normalizedEventType = String(eventType ?? '').trim().toUpperCase() as Event['eventType'];
    return EVENT_TYPE_TAGS_BY_TYPE[normalizedEventType] ?? null;
};

export const getLockedEventTypeTagSlugs = (eventType: Event['eventType'] | null | undefined): string[] => {
    const tag = getEventTypeTagForEventType(eventType);
    return tag ? [tag.slug] : [];
};

export const isEventTypeTag = (tag: Pick<EventTag, 'name' | 'slug'>): boolean => (
    EVENT_TYPE_TAG_SLUGS.has(getEventTagIdentity(tag))
);

export const syncEventTypeTagsForEventType = (
    tags: EventTag[] | null | undefined,
    eventType: Event['eventType'] | null | undefined,
): EventTag[] => {
    const nextTypeTag = getEventTypeTagForEventType(eventType);
    const retainedTags = (Array.isArray(tags) ? tags : []).filter((tag) => !isEventTypeTag(tag));
    return nextTypeTag ? [...retainedTags, nextTypeTag] : retainedTags;
};
