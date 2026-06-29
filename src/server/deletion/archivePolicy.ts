type PrismaLike = Record<string, any>;

export type DeleteOrArchiveAction = 'deleted' | 'archived' | 'deactivated';

export type DeleteOrArchiveReference = {
  type: string;
  count: number;
};

export type DeleteOrArchiveResult = {
  action: DeleteOrArchiveAction;
  entityType: 'event' | 'field' | 'timeSlot' | 'team' | 'product';
  entityId: string;
  references: DeleteOrArchiveReference[];
};

type EventDeleteInput = {
  client: PrismaLike;
  event: Record<string, any>;
  actorUserId: string;
  reason?: string;
};

type EntityDeleteInput = {
  client: PrismaLike;
  entity: Record<string, any>;
  actorUserId: string;
  reason?: string;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

const normalizeIdList = (value: unknown): string[] => (
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => normalizeId(entry))
            .filter((entry): entry is string => Boolean(entry)),
        ),
      )
    : []
);

const removeEntityIdFromList = (values: unknown, targetId: string): string[] => {
  const normalizedTargetId = normalizeId(targetId);
  if (!normalizedTargetId) {
    return normalizeIdList(values);
  }
  return normalizeIdList(values).filter((value) => value !== normalizedTargetId);
};

const countRows = async (
  delegate: any,
  where: Record<string, unknown>,
): Promise<number> => {
  if (!delegate) {
    return 0;
  }
  if (typeof delegate.count === 'function') {
    return delegate.count({ where });
  }
  if (typeof delegate.findMany === 'function') {
    const rows = await delegate.findMany({ where, select: { id: true } });
    return Array.isArray(rows) ? rows.length : 0;
  }
  return 0;
};

const collectEventBillIds = async (client: PrismaLike, eventId: string): Promise<string[]> => {
  return collectBillIds(client, { eventId });
};

const collectBillIdsBySlot = async (client: PrismaLike, slotId: string): Promise<string[]> => {
  return collectBillIds(client, { slotId });
};

const collectBillIdsByTeam = async (client: PrismaLike, teamId: string): Promise<string[]> => {
  return collectBillIds(client, { ownerType: 'TEAM', ownerId: teamId });
};

const collectBillIds = async (client: PrismaLike, where: Record<string, unknown>): Promise<string[]> => {
  const billsDelegate = client.bills;
  if (typeof billsDelegate?.findMany !== 'function') {
    return [];
  }

  const rootRows = await billsDelegate.findMany({
    where,
    select: { id: true },
  });
  const collected = new Set<string>(normalizeIdList((rootRows ?? []).map((row: { id: string }) => row.id)));
  let frontier = Array.from(collected);

  while (frontier.length > 0) {
    const childRows = await billsDelegate.findMany({
      where: { parentBillId: { in: frontier } },
      select: { id: true },
    });
    const nextFrontier: string[] = [];
    (childRows ?? []).forEach((row: { id: string }) => {
      const normalizedId = normalizeId(row.id);
      if (!normalizedId || collected.has(normalizedId)) {
        return;
      }
      collected.add(normalizedId);
      nextFrontier.push(normalizedId);
    });
    frontier = nextFrontier;
  }

  return Array.from(collected);
};

const reference = (type: string, count: number): DeleteOrArchiveReference | null => (
  count > 0 ? { type, count } : null
);

export const countEventReferences = async (
  client: PrismaLike,
  event: Record<string, any>,
): Promise<DeleteOrArchiveReference[]> => {
  const eventId = normalizeId(event.id);
  if (!eventId) {
    return [{ type: 'invalid_event_id', count: 1 }];
  }

  const billIds = await collectEventBillIds(client, eventId);
  const fieldIds = normalizeIdList(event.fieldIds);
  const timeSlotIds = normalizeIdList(event.timeSlotIds);
  const references = await Promise.all([
    reference('bills', billIds.length),
    reference('bill_payments', billIds.length
      ? await countRows(client.billPayments, { billId: { in: billIds } })
      : 0),
    reference('bill_payment_proofs', await countRows(client.billPaymentProofs, billIds.length
      ? { OR: [{ eventId }, { billId: { in: billIds } }] }
      : { eventId })),
    reference('refund_requests', await countRows(client.refundRequests, { eventId })),
    reference('signed_documents', await countRows(client.signedDocuments, { eventId })),
    reference('event_registrations', await countRows(client.eventRegistrations, { eventId })),
    reference('matches', await countRows(client.matches, { eventId })),
    reference('rental_bookings', await countRows(client.rentalBookings, { eventId })),
    reference('rental_booking_items', await countRows(client.rentalBookingItems, { eventId })),
    reference('payment_intents', await countRows(client.paymentIntents, { eventId })),
    reference('event_staff_assignments', await countRows(client.eventStaffAssignments, { eventId })),
    reference('event_officials', await countRows(client.eventOfficials, { eventId })),
    reference('child_events', await countRows(client.events, { parentEvent: eventId })),
    reference('time_slot_rental_items', timeSlotIds.length
      ? await countRows(client.rentalBookingItems, { eventTimeSlotId: { in: timeSlotIds } })
      : 0),
    reference('field_rental_items', fieldIds.length
      ? await countRows(client.rentalBookingItems, { fieldId: { in: fieldIds } })
      : 0),
  ]);

  return references.filter((entry): entry is DeleteOrArchiveReference => Boolean(entry));
};

export const countFieldReferences = async (
  client: PrismaLike,
  field: Record<string, any>,
): Promise<DeleteOrArchiveReference[]> => {
  const fieldId = normalizeId(field.id);
  if (!fieldId) {
    return [{ type: 'invalid_field_id', count: 1 }];
  }

  const references = await Promise.all([
    reference('events', await countRows(client.events, { fieldIds: { has: fieldId } })),
    reference('time_slots', await countRows(client.timeSlots, {
      OR: [
        { scheduledFieldId: fieldId },
        { scheduledFieldIds: { has: fieldId } },
      ],
    })),
    reference('rental_booking_items', await countRows(client.rentalBookingItems, { fieldId })),
    reference('staff_schedule_assignments', await countRows(client.staffScheduleAssignments, { fieldId })),
    reference('event_officials', await countRows(client.eventOfficials, { fieldIds: { has: fieldId } })),
  ]);

  return references.filter((entry): entry is DeleteOrArchiveReference => Boolean(entry));
};

export const countTimeSlotReferences = async (
  client: PrismaLike,
  timeSlot: Record<string, any>,
): Promise<DeleteOrArchiveReference[]> => {
  const timeSlotId = normalizeId(timeSlot.id);
  if (!timeSlotId) {
    return [{ type: 'invalid_time_slot_id', count: 1 }];
  }

  const billIds = await collectBillIdsBySlot(client, timeSlotId);
  const references = await Promise.all([
    reference('events', await countRows(client.events, { timeSlotIds: { has: timeSlotId } })),
    reference('bills', billIds.length),
    reference('bill_payments', billIds.length
      ? await countRows(client.billPayments, { billId: { in: billIds } })
      : 0),
    reference('bill_payment_proofs', billIds.length
      ? await countRows(client.billPaymentProofs, { billId: { in: billIds } })
      : 0),
    reference('rental_booking_items', await countRows(client.rentalBookingItems, {
      OR: [
        { availabilitySlotId: timeSlotId },
        { eventTimeSlotId: timeSlotId },
      ],
    })),
    reference('staff_schedule_assignments', await countRows(client.staffScheduleAssignments, { timeSlotId })),
  ]);

  return references.filter((entry): entry is DeleteOrArchiveReference => Boolean(entry));
};

export const countProductReferences = async (
  client: PrismaLike,
  product: Record<string, any>,
): Promise<DeleteOrArchiveReference[]> => {
  const productId = normalizeId(product.id);
  if (!productId) {
    return [{ type: 'invalid_product_id', count: 1 }];
  }

  const references = await Promise.all([
    reference('subscriptions', await countRows(client.subscriptions, { productId })),
    reference('discounts', await countRows(client.discounts, { targetType: 'PRODUCT', targetId: productId })),
    reference('discount_code_redemptions', await countRows(client.discountCodeRedemptions, {
      OR: [
        { productId },
        { purchaseType: 'PRODUCT', purchaseTargetId: productId },
      ],
    })),
    reference('discount_code_reservations', await countRows(client.discountCodeReservations, {
      OR: [
        { productId },
        { purchaseType: 'PRODUCT', purchaseTargetId: productId },
      ],
    })),
  ]);

  return references.filter((entry): entry is DeleteOrArchiveReference => Boolean(entry));
};

export const countCanonicalTeamReferences = async (
  client: PrismaLike,
  team: Record<string, any>,
): Promise<DeleteOrArchiveReference[]> => {
  const teamId = normalizeId(team.id);
  if (!teamId) {
    return [{ type: 'invalid_team_id', count: 1 }];
  }

  const billIds = await collectBillIdsByTeam(client, teamId);
  const references = await Promise.all([
    reference('bills', billIds.length),
    reference('bill_payments', billIds.length
      ? await countRows(client.billPayments, { billId: { in: billIds } })
      : 0),
    reference('bill_payment_proofs', billIds.length
      ? await countRows(client.billPaymentProofs, { billId: { in: billIds } })
      : 0),
    reference('team_registrations', await countRows(client.teamRegistrations, { teamId })),
    reference('team_staff_assignments', await countRows(client.teamStaffAssignments, { teamId })),
    reference('team_join_requests', await countRows(client.teamJoinRequests, { teamId })),
    reference('event_team_snapshots', await countRows(client.teams, { parentTeamId: teamId })),
    reference('event_registrations', await countRows(client.eventRegistrations, {
      OR: [
        { registrantId: teamId },
        { eventTeamId: teamId },
      ],
    })),
    reference('signed_documents', await countRows(client.signedDocuments, { teamId })),
    reference('boldsign_operations', await countRows(client.boldSignSyncOperations, { teamId })),
    reference('discounts', await countRows(client.discounts, { targetId: teamId })),
    reference('discount_code_redemptions', await countRows(client.discountCodeRedemptions, {
      OR: [
        { productId: teamId },
        { purchaseTargetId: teamId },
      ],
    })),
    reference('discount_code_reservations', await countRows(client.discountCodeReservations, {
      OR: [
        { productId: teamId },
        { purchaseTargetId: teamId },
      ],
    })),
    reference('team_chat_groups', await countRows(client.chatGroup, {
      OR: [
        { id: `team:${teamId}` },
        { teamId },
      ],
    })),
  ]);

  return references.filter((entry): entry is DeleteOrArchiveReference => Boolean(entry));
};

export const countEventTeamReferences = async (
  client: PrismaLike,
  team: Record<string, any>,
): Promise<DeleteOrArchiveReference[]> => {
  const teamId = normalizeId(team.id);
  if (!teamId) {
    return [{ type: 'invalid_team_id', count: 1 }];
  }

  const billIds = await collectBillIdsByTeam(client, teamId);
  const references = await Promise.all([
    reference('bills', billIds.length),
    reference('bill_payments', billIds.length
      ? await countRows(client.billPayments, { billId: { in: billIds } })
      : 0),
    reference('bill_payment_proofs', billIds.length
      ? await countRows(client.billPaymentProofs, { billId: { in: billIds } })
      : 0),
    reference('event_registrations', await countRows(client.eventRegistrations, {
      OR: [
        { registrantId: teamId },
        { eventTeamId: teamId },
      ],
    })),
    reference('matches', await countRows(client.matches, {
      OR: [
        { team1Id: teamId },
        { team2Id: teamId },
        { teamOfficialId: teamId },
        { winnerEventTeamId: teamId },
      ],
    })),
    reference('match_segments', await countRows(client.matchSegments, { winnerEventTeamId: teamId })),
    reference('match_incidents', await countRows(client.matchIncidents, { eventTeamId: teamId })),
    reference('refund_requests', await countRows(client.refundRequests, { teamId })),
    reference('signed_documents', await countRows(client.signedDocuments, { teamId })),
    reference('event_team_staff_assignments', await countRows(client.eventTeamStaffAssignments, { eventTeamId: teamId })),
    reference('boldsign_operations', await countRows(client.boldSignSyncOperations, { teamId })),
    reference('events', await countRows(client.events, { teamIds: { has: teamId } })),
    reference('divisions', await countRows(client.divisions, { teamIds: { has: teamId } })),
    reference('team_chat_groups', await countRows(client.chatGroup, {
      OR: [
        { id: `team:${teamId}` },
        { teamId },
      ],
    })),
  ]);

  return references.filter((entry): entry is DeleteOrArchiveReference => Boolean(entry));
};

const archiveEvent = async ({
  client,
  event,
  actorUserId,
  reason,
  references,
}: EventDeleteInput & { references: DeleteOrArchiveReference[] }): Promise<DeleteOrArchiveResult> => {
  const eventId = String(event.id);
  const now = new Date();
  const data: Record<string, unknown> = {
    updatedAt: now,
    archivedAt: event.archivedAt ?? now,
    archivedByUserId: event.archivedByUserId ?? actorUserId,
    archiveReason: event.archiveReason ?? reason ?? 'delete_requested_with_references',
  };

  await client.events.update({
    where: { id: eventId },
    data,
  });

  return {
    action: 'archived',
    entityType: 'event',
    entityId: eventId,
    references,
  };
};

const hardDeleteUnreferencedEvent = async ({
  client,
  event,
}: EventDeleteInput): Promise<DeleteOrArchiveResult> => {
  const eventId = String(event.id);
  const eventState = typeof event.state === 'string' ? event.state.toUpperCase() : '';
  const eventFieldIds = normalizeIdList(event.fieldIds);
  const eventTimeSlotIds = normalizeIdList(event.timeSlotIds);
  const leagueScoringConfigId = normalizeId(event.leagueScoringConfigId);

  await client.$transaction(async (tx: PrismaLike) => {
    if (eventState === 'TEMPLATE') {
      const [eventsUsingTemplate, timeSlotsUsingTemplate] = await Promise.all([
        tx.events.findMany({
          where: {
            id: { not: eventId },
            requiredTemplateIds: { has: eventId },
          },
          select: {
            id: true,
            requiredTemplateIds: true,
          },
        }),
        tx.timeSlots.findMany({
          where: {
            OR: [
              { requiredTemplateIds: { has: eventId } },
              { hostRequiredTemplateIds: { has: eventId } },
            ],
          },
          select: {
            id: true,
            requiredTemplateIds: true,
            hostRequiredTemplateIds: true,
          },
        }),
      ]);

      for (const linkedEvent of eventsUsingTemplate ?? []) {
        await tx.events.update({
          where: { id: linkedEvent.id },
          data: {
            requiredTemplateIds: removeEntityIdFromList(linkedEvent.requiredTemplateIds, eventId),
            updatedAt: new Date(),
          },
        });
      }

      for (const linkedSlot of timeSlotsUsingTemplate ?? []) {
        await tx.timeSlots.update({
          where: { id: linkedSlot.id },
          data: {
            requiredTemplateIds: removeEntityIdFromList(linkedSlot.requiredTemplateIds, eventId),
            hostRequiredTemplateIds: removeEntityIdFromList(linkedSlot.hostRequiredTemplateIds, eventId),
            updatedAt: new Date(),
          },
        });
      }
    }

    const localFieldIds = eventFieldIds.length > 0
      ? (await tx.fields.findMany({
          where: {
            id: { in: eventFieldIds },
            organizationId: null,
          },
          select: { id: true },
        })).map((row: { id: string }) => row.id)
      : [];

    await tx.matches.deleteMany({ where: { eventId } });
    await tx.divisions.deleteMany({ where: { eventId } });
    await tx.eventRegistrations.deleteMany({ where: { eventId } });
    await tx.refundRequests.deleteMany({ where: { eventId } });
    await tx.signedDocuments.deleteMany({ where: { eventId } });
    await tx.invites.deleteMany({ where: { eventId } });
    await tx.paymentIntents.deleteMany({ where: { eventId } });
    await tx.templateDocuments.deleteMany({ where: { templateId: eventId } });
    await tx.eventTagAssignments?.deleteMany?.({ where: { eventId } });
    await tx.eventOfficials?.deleteMany?.({ where: { eventId } });
    await tx.eventStaffAssignments?.deleteMany?.({ where: { eventId } });

    if (eventTimeSlotIds.length > 0) {
      await tx.timeSlots.deleteMany({
        where: {
          id: { in: eventTimeSlotIds },
        },
      });
    }

    if (localFieldIds.length > 0) {
      await tx.fields.deleteMany({
        where: {
          id: { in: localFieldIds },
          organizationId: null,
        },
      });
    }

    await tx.events.delete({ where: { id: eventId } });

    if (leagueScoringConfigId) {
      const remainingEventsUsingConfig = await tx.events.count({
        where: { leagueScoringConfigId },
      });
      if (remainingEventsUsingConfig === 0) {
        await tx.leagueScoringConfigs.deleteMany({
          where: { id: leagueScoringConfigId },
        });
      }
    }
  });

  return {
    action: 'deleted',
    entityType: 'event',
    entityId: eventId,
    references: [],
  };
};

export const deleteOrArchiveEvent = async (input: EventDeleteInput): Promise<DeleteOrArchiveResult> => {
  const references = await countEventReferences(input.client, input.event);
  if (references.length > 0 || input.event.archivedAt) {
    return archiveEvent({ ...input, references });
  }

  return hardDeleteUnreferencedEvent(input);
};

export const deleteOrArchiveField = async (input: EntityDeleteInput): Promise<DeleteOrArchiveResult> => {
  const fieldId = normalizeId(input.entity.id);
  if (!fieldId) {
    return {
      action: 'archived',
      entityType: 'field',
      entityId: '',
      references: [{ type: 'invalid_field_id', count: 1 }],
    };
  }

  const references = await countFieldReferences(input.client, input.entity);
  if (references.length > 0 || input.entity.archivedAt) {
    const now = new Date();
    await input.client.fields.update({
      where: { id: fieldId },
      data: {
        archivedAt: input.entity.archivedAt ?? now,
        archivedByUserId: input.entity.archivedByUserId ?? input.actorUserId,
        archiveReason: input.entity.archiveReason ?? input.reason ?? 'delete_requested',
        updatedAt: now,
      },
    });
    return {
      action: 'archived',
      entityType: 'field',
      entityId: fieldId,
      references,
    };
  }

  await input.client.fields.delete({ where: { id: fieldId } });
  return {
    action: 'deleted',
    entityType: 'field',
    entityId: fieldId,
    references: [],
  };
};

export const deleteOrArchiveTimeSlot = async (input: EntityDeleteInput): Promise<DeleteOrArchiveResult> => {
  const timeSlotId = normalizeId(input.entity.id);
  if (!timeSlotId) {
    return {
      action: 'archived',
      entityType: 'timeSlot',
      entityId: '',
      references: [{ type: 'invalid_time_slot_id', count: 1 }],
    };
  }

  const references = await countTimeSlotReferences(input.client, input.entity);
  if (references.length > 0 || input.entity.archivedAt) {
    const now = new Date();
    await input.client.timeSlots.update({
      where: { id: timeSlotId },
      data: {
        archivedAt: input.entity.archivedAt ?? now,
        archivedByUserId: input.entity.archivedByUserId ?? input.actorUserId,
        archiveReason: input.entity.archiveReason ?? input.reason ?? 'delete_requested',
        updatedAt: now,
      },
    });
    return {
      action: 'archived',
      entityType: 'timeSlot',
      entityId: timeSlotId,
      references,
    };
  }

  await input.client.$transaction(async (tx: PrismaLike) => {
    const fieldsWithSlot = typeof tx.fields?.findMany === 'function'
      ? await tx.fields.findMany({
          where: { rentalSlotIds: { has: timeSlotId } },
          select: { id: true, rentalSlotIds: true },
        })
      : [];

    for (const field of fieldsWithSlot) {
      await tx.fields.update({
        where: { id: field.id },
        data: {
          rentalSlotIds: removeEntityIdFromList(field.rentalSlotIds, timeSlotId),
          updatedAt: new Date(),
        },
      });
    }

    await tx.timeSlots.delete({ where: { id: timeSlotId } });
  });

  return {
    action: 'deleted',
    entityType: 'timeSlot',
    entityId: timeSlotId,
    references: [],
  };
};

export const deleteOrDeactivateProduct = async (input: EntityDeleteInput): Promise<DeleteOrArchiveResult> => {
  const productId = normalizeId(input.entity.id);
  if (!productId) {
    return {
      action: 'deactivated',
      entityType: 'product',
      entityId: '',
      references: [{ type: 'invalid_product_id', count: 1 }],
    };
  }

  const references = await countProductReferences(input.client, input.entity);
  if (references.length > 0) {
    await input.client.products.update({
      where: { id: productId },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });
    return {
      action: 'deactivated',
      entityType: 'product',
      entityId: productId,
      references,
    };
  }

  await input.client.products.delete({ where: { id: productId } });
  return {
    action: 'deleted',
    entityType: 'product',
    entityId: productId,
    references: [],
  };
};

const runTransaction = async <T>(
  client: PrismaLike,
  operation: (tx: PrismaLike) => Promise<T>,
): Promise<T> => {
  if (typeof client.$transaction === 'function') {
    return client.$transaction(operation);
  }
  return operation(client);
};

const archiveTeamChatGroups = async (
  client: PrismaLike,
  teamId: string,
  actorUserId: string,
  reason: string,
  now: Date,
): Promise<void> => {
  if (typeof client.chatGroup?.updateMany !== 'function') {
    return;
  }
  await client.chatGroup.updateMany({
    where: {
      OR: [
        { id: `team:${teamId}` },
        { teamId },
      ],
    },
    data: {
      archivedAt: now,
      archivedByUserId: actorUserId,
      archivedReason: reason,
      updatedAt: now,
    },
  });
};

export const deleteOrArchiveCanonicalTeam = async (input: EntityDeleteInput): Promise<DeleteOrArchiveResult> => {
  const teamId = normalizeId(input.entity.id);
  if (!teamId) {
    return {
      action: 'archived',
      entityType: 'team',
      entityId: '',
      references: [{ type: 'invalid_team_id', count: 1 }],
    };
  }

  const references = await countCanonicalTeamReferences(input.client, input.entity);
  if (references.length > 0 || input.entity.archivedAt) {
    const now = new Date();
    const reason = input.entity.archiveReason ?? input.reason ?? 'delete_requested';
    await runTransaction(input.client, async (tx) => {
      await tx.canonicalTeams.update({
        where: { id: teamId },
        data: {
          archivedAt: input.entity.archivedAt ?? now,
          archivedByUserId: input.entity.archivedByUserId ?? input.actorUserId,
          archiveReason: reason,
          updatedAt: now,
        },
      });
      await tx.teamRegistrations?.updateMany?.({
        where: { teamId },
        data: {
          status: 'REMOVED',
          updatedAt: now,
        },
      });
      await tx.teamStaffAssignments?.updateMany?.({
        where: { teamId },
        data: {
          status: 'REMOVED',
          updatedAt: now,
        },
      });
      await archiveTeamChatGroups(tx, teamId, input.actorUserId, reason, now);
    });

    return {
      action: 'archived',
      entityType: 'team',
      entityId: teamId,
      references,
    };
  }

  await input.client.canonicalTeams.delete({ where: { id: teamId } });
  return {
    action: 'deleted',
    entityType: 'team',
    entityId: teamId,
    references: [],
  };
};

export const deleteOrArchiveEventTeam = async (input: EntityDeleteInput): Promise<DeleteOrArchiveResult> => {
  const teamId = normalizeId(input.entity.id);
  if (!teamId) {
    return {
      action: 'archived',
      entityType: 'team',
      entityId: '',
      references: [{ type: 'invalid_team_id', count: 1 }],
    };
  }

  const references = await countEventTeamReferences(input.client, input.entity);
  const teamsDelegate = input.client.teams ?? input.client.volleyBallTeams;
  if (references.length > 0 || input.entity.archivedAt) {
    const now = new Date();
    const reason = input.entity.archiveReason ?? input.reason ?? 'delete_requested';
    await runTransaction(input.client, async (tx) => {
      const txTeams = tx.teams ?? tx.volleyBallTeams;
      await txTeams.update({
        where: { id: teamId },
        data: {
          archivedAt: input.entity.archivedAt ?? now,
          archivedByUserId: input.entity.archivedByUserId ?? input.actorUserId,
          archiveReason: reason,
          updatedAt: now,
        },
      });
      await tx.eventTeamStaffAssignments?.updateMany?.({
        where: { eventTeamId: teamId },
        data: {
          status: 'CANCELLED',
          updatedAt: now,
        },
      });
      await archiveTeamChatGroups(tx, teamId, input.actorUserId, reason, now);
    });

    return {
      action: 'archived',
      entityType: 'team',
      entityId: teamId,
      references,
    };
  }

  await teamsDelegate.delete({ where: { id: teamId } });
  return {
    action: 'deleted',
    entityType: 'team',
    entityId: teamId,
    references: [],
  };
};

export const toDeleteOrArchiveResponse = (result: DeleteOrArchiveResult) => ({
  deleted: result.action === 'deleted',
  archived: result.action === 'archived',
  deactivated: result.action === 'deactivated',
  action: result.action,
  entityType: result.entityType,
  entityId: result.entityId,
  references: result.references,
});
