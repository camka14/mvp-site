import { Group, Participant, Resource, SchedulableEvent, MINUTE_MS } from './types';

const overlaps = (startA: Date, endA: Date, startB: Date, endB: Date): boolean => {
  return !(startA >= endB && endA > endB) && !(startA < startB && endA <= startB);
};

export class Schedule<E extends SchedulableEvent, R extends Resource, P extends Participant, G extends Group> {
  resources: Map<G, R[]>;
  participants: Map<G, P[]>;
  startTime: Date;
  currentTime: Date;
  endTime: Date;
  currentGroups: G[] = [];
  private globalSlots: Array<[Date, Date]> = [];
  private resourceSlots: Map<string, Array<[Date, Date]>> = new Map();
  private hasSlots = false;

  constructor(
    startTime: Date,
    resources: Record<string, R>,
    participants: Record<string, P>,
    groups: G[],
    currentTime?: Date,
    opts?: { endTime?: Date; timeSlots?: Iterable<any> },
  ) {
    this.resources = new Map();
    this.participants = new Map();
    for (const group of groups) {
      this.resources.set(
        group,
        Object.values(resources).filter((res) => res.getGroups().some((g) => g.id === group.id)),
      );
      this.participants.set(
        group,
        Object.values(participants).filter((par) => par.getGroups().some((g) => g.id === group.id)),
      );
    }

    this.startTime = startTime;
    this.currentTime = currentTime ?? startTime;
    this.endTime = opts?.endTime ?? new Date(startTime.getTime() + 30 * 24 * 60 * MINUTE_MS);
    if (opts?.timeSlots) {
      this.prepareTimeSlots(opts.timeSlots);
    }
    this.hasSlots = this.globalSlots.length > 0 || Array.from(this.resourceSlots.values()).some((slots) => slots.length);
  }

  getParticipantConflicts(): Map<P, E[]> {
    const conflicts = new Map<P, E[]>();
    for (const group of this.currentGroups) {
      const groupParticipants = this.participants.get(group) ?? [];
      for (const participant of groupParticipants) {
        const participantEvents = participant.getEvents() as E[];
        for (const event of participantEvents) {
          const currentEvents = this.currentEvents(event.start, event.end) as E[];
          for (const currentEvent of currentEvents) {
            if (participantEvents.includes(currentEvent) && currentEvent !== event) {
              const existing = conflicts.get(participant) ?? [];
              if (!existing.includes(currentEvent)) {
                existing.push(currentEvent);
                conflicts.set(participant, existing);
              }
            }
          }
        }
      }
    }
    return conflicts;
  }

  rescheduleFollowingEvents(event: E): void {
    const eventResource = event.getResource();
    if (!eventResource) return;
    const resourceEvents = eventResource.getEvents() as E[];
    const nextIndex = resourceEvents.indexOf(event) + 1;
    const nextEvent = nextIndex < resourceEvents.length ? resourceEvents[nextIndex] : null;
    const eventDependants = event.getDependants() as E[];
    let bufferMs = 0;
    if (nextEvent && eventDependants.includes(nextEvent)) {
      bufferMs = event.bufferMs;
    }
    if (nextEvent) {
      const desiredStart = new Date(event.end.getTime() + bufferMs);
      if (nextEvent.start.getTime() !== desiredStart.getTime()) {
        this.shiftTimes(nextEvent, desiredStart.getTime() - nextEvent.start.getTime());
      }
    }
    for (const dependant of eventDependants) {
      if (nextEvent && dependant === nextEvent) continue;
      const desiredStart = new Date(event.end.getTime() + event.bufferMs);
      if (dependant.start.getTime() !== desiredStart.getTime()) {
        this.shiftTimes(dependant, desiredStart.getTime() - dependant.start.getTime());
      }
    }
  }

  shiftTimes(event: E, shiftMs: number): void {
    const resource = event.getResource();
    if (!resource) return;
    const resourceEvents = resource.getEvents() as E[];
    const previousEvents = event.getDependencies() as E[];
    const nextEvents = event.getDependants() as E[];
    const startTimes: number[] = [];
    for (const prev of previousEvents) {
      startTimes.push(prev.end.getTime() + event.bufferMs);
    }
    const currentIndex = resourceEvents.indexOf(event);
    if (currentIndex > 0) {
      const prevResEvent = resourceEvents[currentIndex - 1];
      if (!previousEvents.includes(prevResEvent)) {
        previousEvents.push(prevResEvent);
        startTimes.push(prevResEvent.end.getTime());
      }
    }
    if (currentIndex < resourceEvents.length - 2) {
      const nextResEvent = resourceEvents[currentIndex + 1];
      if (!nextEvents.includes(nextResEvent)) {
        nextEvents.push(nextResEvent);
      }
    }
    const earliestStart = Math.max(...startTimes, event.start.getTime());
    const duration = event.end.getTime() - event.start.getTime();

    if (shiftMs < 0 && event.start.getTime() - earliestStart > 0) {
      event.start = new Date(earliestStart);
      event.end = new Date(earliestStart + duration);
      for (const nextEvent of nextEvents) {
        this.rescheduleFollowingEvents(nextEvent);
      }
    } else if (shiftMs > 0) {
      event.start = new Date(event.start.getTime() + shiftMs);
      event.end = new Date(event.start.getTime() + duration);
      for (const nextEvent of nextEvents) {
        this.rescheduleFollowingEvents(nextEvent);
      }
    }
  }

  freeParticipants(group: G, start: Date, end: Date): P[] {
    let freeParticipants = this.participants.get(group) ?? [];
    const groupResources = this.resources.get(group) ?? [];
    for (const resource of groupResources) {
      for (const event of resource.getEvents()) {
        if (overlaps(event.start, event.end, start, end)) {
          freeParticipants = freeParticipants.filter((participant) => !event.getParticipants().includes(participant));
        }
      }
    }
    return freeParticipants;
  }

  scheduleEvent(event: E, durationMs: number): void {
    this.currentGroups = event.getGroups() as G[];
    let earliestStart = this.getEarliestStartTime(event);
    earliestStart = this.nextValidStartTime(earliestStart, durationMs);

    while (true) {
      const adjustedStart = this.nextValidStartTime(earliestStart, durationMs);
      if (adjustedStart.getTime() > earliestStart.getTime()) {
        earliestStart = adjustedStart;
      }
      if (this.checkAvailabilityOfParticipants(earliestStart, new Date(earliestStart.getTime() + durationMs), event.getParticipants().length)) {
        const resource = this.findAvailableResource(earliestStart, durationMs);
        if (resource) {
          event.setResource(resource);
          event.start = earliestStart;
          event.end = new Date(earliestStart.getTime() + durationMs);
          resource.addEvent(event);
          return;
        }
      }
      earliestStart = new Date(earliestStart.getTime() + 5 * MINUTE_MS);
    }
  }

  advanceTo(newTime: Date): void {
    if (newTime.getTime() <= this.currentTime.getTime()) return;
    this.currentTime = this.roundToNextFiveMinutes(newTime);
  }

  private getEarliestStartTime(event: E): Date {
    let earliest = this.startTime.getTime() > this.currentTime.getTime() ? this.startTime : this.currentTime;
    for (const dependency of event.getDependencies() as E[]) {
      const end = new Date(dependency.end.getTime() + event.bufferMs);
      if (end.getTime() > earliest.getTime()) {
        earliest = end;
      }
    }
    return this.roundToNextFiveMinutes(earliest);
  }

  private checkAvailabilityOfParticipants(start: Date, end: Date, minParticipants: number): boolean {
    const currentEvents = this.currentEvents(start, end);
    let totalParticipants = 0;
    for (const group of this.currentGroups) {
      totalParticipants += (this.participants.get(group) ?? []).length;
    }
    for (const event of currentEvents) {
      totalParticipants -= event.getParticipants().length;
    }
    return totalParticipants >= minParticipants;
  }

  private findAvailableResource(start: Date, durationMs: number): R | null {
    let freeResource: R | null = null;
    const resources: R[] = [];
    for (const group of this.currentGroups) {
      resources.push(...(this.resources.get(group) ?? []));
    }
    resources.sort((a, b) => a.getEvents().length - b.getEvents().length);

    for (const resource of resources) {
      if (!this.resourceSupportsTime(resource, start, durationMs)) continue;
      const usingEvent = this.resourceEventAvailable(resource, start, durationMs);
      if (!usingEvent) {
        freeResource = resource;
        break;
      }
    }
    return freeResource;
  }

  currentEvents(start: Date, end: Date): SchedulableEvent[] {
    const events: SchedulableEvent[] = [];
    for (const group of this.currentGroups) {
      for (const resource of this.resources.get(group) ?? []) {
        for (const event of resource.getEvents()) {
          if (overlaps(event.start, event.end, start, end)) {
            events.push(event);
          }
        }
      }
    }
    return events;
  }

  private resourceEventAvailable(resource: R, start: Date, durationMs: number): E | null {
    const end = new Date(start.getTime() + durationMs);
    const resourceEvents = resource.getEvents() as E[];
    for (const event of resourceEvents) {
      if (overlaps(event.start, event.end, start, end)) {
        return resourceEvents[resourceEvents.length - 1] ?? event;
      }
    }
    return null;
  }

  private prepareTimeSlots(timeSlots: Iterable<any>): void {
    const reference = this.startTime;
    let weeks = 0;
    while (reference.getTime() + weeks * 7 * 24 * 60 * MINUTE_MS <= this.endTime.getTime()) {
      const weekReference = new Date(reference.getTime() + weeks * 7 * 24 * 60 * MINUTE_MS);
      for (const slot of timeSlots) {
        for (const [slotStart, slotEnd] of this.slotRanges(slot, weekReference)) {
          if (slotEnd.getTime() <= this.startTime.getTime() || slotStart.getTime() >= this.endTime.getTime()) {
            continue;
          }
          const boundedStart = slotStart.getTime() < this.startTime.getTime() ? this.startTime : slotStart;
          const boundedEnd = slotEnd.getTime() > this.endTime.getTime() ? this.endTime : slotEnd;
          if (boundedEnd.getTime() <= boundedStart.getTime()) continue;
          const fieldId = slot.field ?? slot.scheduledFieldId;
          if (fieldId) {
            const existing = this.resourceSlots.get(fieldId) ?? [];
            existing.push([boundedStart, boundedEnd]);
            this.resourceSlots.set(fieldId, existing);
          } else {
            this.globalSlots.push([boundedStart, boundedEnd]);
          }
        }
      }
      weeks += 1;
    }
    for (const slots of this.resourceSlots.values()) {
      slots.sort((a, b) => a[0].getTime() - b[0].getTime());
    }
    this.globalSlots.sort((a, b) => a[0].getTime() - b[0].getTime());
  }

  private slotRanges(slot: any, reference: Date): Array<[Date, Date]> {
    const normalizedDays = Array.from(
      new Set(
        (Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
          ? slot.daysOfWeek
          : slot.dayOfWeek !== undefined
            ? [slot.dayOfWeek]
            : slot.day_of_week !== undefined
              ? [slot.day_of_week]
              : [0]
        )
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value >= 0 && value <= 6),
      ),
    );
    const startMinutes = slot.startTimeMinutes ?? slot.start_time_minutes ?? 0;
    const endMinutes = slot.endTimeMinutes ?? slot.end_time_minutes ?? 0;
    return normalizedDays.map((dayOfWeek) => {
      const daysAhead = (dayOfWeek - reference.getDay() + 7) % 7;
      const slotDate = new Date(reference);
      slotDate.setHours(0, 0, 0, 0);
      slotDate.setDate(slotDate.getDate() + daysAhead);
      const start = new Date(slotDate.getTime() + startMinutes * MINUTE_MS);
      const end = new Date(slotDate.getTime() + endMinutes * MINUTE_MS);
      return [start, end];
    });
  }

  private nextValidStartTime(candidate: Date, durationMs: number): Date {
    if (!this.hasSlots) return candidate;
    const resources: R[] = [];
    for (const group of this.currentGroups) {
      resources.push(...(this.resources.get(group) ?? []));
    }
    if (!resources.length) {
      const groupIds = this.currentGroups
        .map((group) => (group as any)?.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      const suffix = groupIds.length ? ` for divisions: ${groupIds.join(', ')}` : '';
      // Include "no fields" so callers can treat this as a configuration error.
      throw new Error(`Unable to schedule event because no fields are available${suffix}.`);
    }
    let unlimitedResource = false;
    let bestFuture: Date | null = null;
    let hasCandidate = false;

    for (const resource of resources) {
      const slots = this.slotsForResource(resource);
      if (!slots.length) {
        unlimitedResource = true;
        continue;
      }
      const slotStart = this.alignStartToSlots(slots, candidate, durationMs);
      if (!slotStart) continue;
      hasCandidate = true;
      if (slotStart.getTime() > candidate.getTime()) {
        if (!bestFuture || slotStart.getTime() < bestFuture.getTime()) {
          bestFuture = slotStart;
        }
      }
    }
    if (unlimitedResource) return candidate;
    if (hasCandidate) return bestFuture ?? candidate;
    throw new Error('No available time slots remaining for scheduling');
  }

  private slotsForResource(resource: R): Array<[Date, Date]> {
    const resourceId = resource.id;
    const specific = resourceId ? this.resourceSlots.get(resourceId) ?? [] : [];
    if (specific.length && this.globalSlots.length) {
      return [...specific, ...this.globalSlots].sort((a, b) => a[0].getTime() - b[0].getTime());
    }
    if (specific.length) return specific;
    return this.globalSlots;
  }

  private alignStartToSlots(slots: Array<[Date, Date]>, candidate: Date, durationMs: number): Date | null {
    for (const [start, end] of slots) {
      if (end.getTime() - start.getTime() < durationMs) continue;
      if (start.getTime() <= candidate.getTime() && end.getTime() >= candidate.getTime() + durationMs) {
        return candidate;
      }
      if (start.getTime() > candidate.getTime() && end.getTime() >= start.getTime() + durationMs) {
        return start;
      }
    }
    return null;
  }

  private resourceSupportsTime(resource: R, start: Date, durationMs: number): boolean {
    if (!this.hasSlots) return true;
    const slots = this.slotsForResource(resource);
    if (!slots.length) return true;
    const aligned = this.alignStartToSlots(slots, start, durationMs);
    return aligned?.getTime() === start.getTime();
  }

  private roundToNextFiveMinutes(date: Date): Date {
    if (date.getMinutes() % 5 === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0) {
      return new Date(date);
    }
    const minutesToAdd = 5 - (date.getMinutes() % 5);
    const rounded = new Date(date);
    rounded.setSeconds(0, 0);
    rounded.setMinutes(rounded.getMinutes() + minutesToAdd);
    return rounded;
  }
}
