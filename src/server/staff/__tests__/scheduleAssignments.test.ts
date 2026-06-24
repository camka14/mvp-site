/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  createStaffScheduleAssignment,
  deleteStaffScheduleAssignment,
  updateStaffScheduleAssignment,
} from '@/server/staff/scheduleAssignments';

const baseStart = new Date(2026, 5, 22, 9, 0, 0, 0);
const baseEnd = new Date(2026, 5, 22, 11, 0, 0, 0);

const createClient = () => {
  const tx = {
    timeSlots: {
      create: jest.fn().mockImplementation(async ({ data }) => ({ ...data, id: 'timeslot_1' })),
      update: jest.fn().mockImplementation(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    staffScheduleAssignments: {
      create: jest.fn().mockImplementation(async ({ data }) => ({ ...data, id: 'assignment_1' })),
      update: jest.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        organizationId: 'org_1',
        timeSlotId: 'timeslot_1',
        assignmentKind: 'STAFF_SHIFT',
        status: 'PLANNED',
        ...data,
      })),
    },
  };
  return {
    organizations: {
      findUnique: jest.fn().mockResolvedValue({ id: 'org_1' }),
    },
    staffMembers: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'staff_1',
        userId: 'user_1',
        roleId: 'role_1',
        types: ['STAFF'],
      }),
    },
    fields: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    facilities: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffScheduleAssignments: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockImplementation(async ({ where, data }) => ({
        id: where.id,
        organizationId: 'org_1',
        timeSlotId: 'timeslot_1',
        assignmentKind: 'STAFF_SHIFT',
        status: 'PLANNED',
        ...data,
      })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    timeSlots: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([{
        id: 'timeslot_1',
        startDate: baseStart,
        endDate: baseEnd,
        repeating: false,
        daysOfWeek: [0],
        startTimeMinutes: 540,
        endTimeMinutes: 660,
      }]),
    },
    userData: {
      findMany: jest.fn().mockResolvedValue([{
        id: 'user_1',
        firstName: 'Sam',
        lastName: 'Staff',
        userName: 'samstaff',
      }]),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => callback(tx)),
    tx,
  };
};

describe('createStaffScheduleAssignment', () => {
  it('creates an open parent coverage assignment without a staff member', async () => {
    const client = createClient();

    const assignment = await createStaffScheduleAssignment({
      organizationId: 'org_1',
      assignmentKind: 'OFFICIAL_SHIFT',
      timeSlot: {
        startDate: baseStart,
        endDate: baseEnd,
        repeating: false,
      },
      actingUserId: 'manager_1',
    }, client);

    expect(client.staffMembers.findUnique).not.toHaveBeenCalled();
    expect(client.tx.staffScheduleAssignments.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: 'org_1',
        parentAssignmentId: null,
        staffMemberId: null,
        userId: null,
        assignmentKind: 'OFFICIAL_SHIFT',
        timeSlotId: 'timeslot_1',
      }),
    }));
    expect(assignment).toEqual(expect.objectContaining({
      id: 'assignment_1',
      userName: 'Open official shift',
      isOpen: true,
      isChildAssignment: false,
    }));
  });

  it('creates an organization schedule assignment backed by a timeslot', async () => {
    const client = createClient();

    const assignment = await createStaffScheduleAssignment({
      organizationId: 'org_1',
      userId: 'user_1',
      timeSlot: {
        startDate: baseStart,
        endDate: baseEnd,
        repeating: false,
      },
      actingUserId: 'manager_1',
    }, client);

    expect(client.tx.timeSlots.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sourceType: 'STAFF_SCHEDULE_ASSIGNMENT',
        scheduledFieldId: null,
        scheduledFieldIds: [],
        repeating: false,
        startTimeMinutes: 540,
        endTimeMinutes: 660,
      }),
    }));
    expect(client.tx.staffScheduleAssignments.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organizationId: 'org_1',
        parentAssignmentId: null,
        staffMemberId: 'staff_1',
        userId: 'user_1',
        assignmentKind: 'STAFF_SHIFT',
        timeSlotId: 'timeslot_1',
        plannedMinutes: 120,
        rateOverrideType: null,
        rateOverrideCents: null,
      }),
    }));
    expect(assignment).toEqual(expect.objectContaining({
      id: 'assignment_1',
      userName: 'Sam Staff',
      timeSlotId: 'timeslot_1',
    }));
  });

  it('creates a repeating parent coverage assignment backed by a repeating timeslot', async () => {
    const client = createClient();
    const repeatEnd = new Date(2026, 6, 31, 23, 59, 59, 999);

    await createStaffScheduleAssignment({
      organizationId: 'org_1',
      assignmentKind: 'STAFF_SHIFT',
      timeSlot: {
        startDate: baseStart,
        endDate: repeatEnd,
        repeating: true,
        daysOfWeek: [0, 2],
        startTimeMinutes: 540,
        endTimeMinutes: 660,
      },
      actingUserId: 'manager_1',
    }, client);

    expect(client.tx.timeSlots.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sourceType: 'STAFF_SCHEDULE_ASSIGNMENT',
        repeating: true,
        daysOfWeek: [0, 2],
        startTimeMinutes: 540,
        endTimeMinutes: 660,
        endDate: repeatEnd,
      }),
    }));
    expect(client.tx.staffScheduleAssignments.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        assignmentKind: 'STAFF_SHIFT',
        plannedMinutes: 120,
        plannedStart: baseStart,
        plannedEnd: baseEnd,
      }),
    }));
  });

  it('creates an assigned child coverage assignment for a parent occurrence', async () => {
    const client = createClient();
    client.staffScheduleAssignments.findFirst.mockResolvedValue({
      id: 'parent_1',
      organizationId: 'org_1',
      parentAssignmentId: null,
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_1',
      fieldId: 'field_1',
      timeSlotId: 'parent_timeslot_1',
      status: 'PLANNED',
    });
    client.timeSlots.findUnique.mockResolvedValue({
      id: 'parent_timeslot_1',
      startDate: baseStart,
      endDate: new Date(2026, 6, 31, 23, 59, 0, 0),
      repeating: true,
      daysOfWeek: [0],
      startTimeMinutes: 540,
      endTimeMinutes: 660,
    });
    client.fields.findFirst.mockResolvedValue({ id: 'field_1', facilityId: 'facility_1' });
    client.facilities.findFirst.mockResolvedValue({ id: 'facility_1', timeZone: 'America/Los_Angeles' });

    await createStaffScheduleAssignment({
      organizationId: 'org_1',
      parentAssignmentId: 'parent_1',
      userId: 'user_1',
      timeSlot: {
        startDate: baseStart,
        endDate: baseEnd,
        repeating: false,
      },
      actingUserId: 'manager_1',
    }, client);

    expect(client.tx.staffScheduleAssignments.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        parentAssignmentId: 'parent_1',
        staffMemberId: 'staff_1',
        userId: 'user_1',
        assignmentKind: 'STAFF_SHIFT',
        facilityId: 'facility_1',
        fieldId: 'field_1',
      }),
    }));
  });

  it('rejects assigning coverage under a child assignment', async () => {
    const client = createClient();
    client.staffScheduleAssignments.findFirst.mockResolvedValue({
      id: 'child_1',
      organizationId: 'org_1',
      parentAssignmentId: 'parent_1',
      assignmentKind: 'STAFF_SHIFT',
      timeSlotId: 'child_timeslot_1',
      status: 'PLANNED',
    });

    await expect(createStaffScheduleAssignment({
      organizationId: 'org_1',
      parentAssignmentId: 'child_1',
      userId: 'user_1',
      timeSlot: {
        startDate: baseStart,
        endDate: baseEnd,
        repeating: false,
      },
      actingUserId: 'manager_1',
    }, client)).rejects.toMatchObject({
      status: 400,
      message: 'Child staff assignments cannot have children.',
    });
  });

  it('rejects assigning coverage under an assigned parent shift', async () => {
    const client = createClient();
    client.staffScheduleAssignments.findFirst.mockResolvedValue({
      id: 'parent_1',
      organizationId: 'org_1',
      parentAssignmentId: null,
      staffMemberId: 'staff_parent',
      userId: 'parent_user',
      assignmentKind: 'STAFF_SHIFT',
      timeSlotId: 'parent_timeslot_1',
      status: 'PLANNED',
    });

    await expect(createStaffScheduleAssignment({
      organizationId: 'org_1',
      parentAssignmentId: 'parent_1',
      userId: 'user_1',
      timeSlot: {
        startDate: baseStart,
        endDate: baseEnd,
        repeating: false,
      },
      actingUserId: 'manager_1',
    }, client)).rejects.toMatchObject({
      status: 400,
      message: 'Assigning occurrences under an already assigned parent shift is not supported yet.',
    });
  });

  it('rejects assigning the same parent occurrence twice', async () => {
    const client = createClient();
    client.staffScheduleAssignments.findFirst.mockResolvedValue({
      id: 'parent_1',
      organizationId: 'org_1',
      parentAssignmentId: null,
      staffMemberId: null,
      userId: null,
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_1',
      fieldId: 'field_1',
      timeSlotId: 'parent_timeslot_1',
      status: 'PLANNED',
    });
    client.staffScheduleAssignments.findMany.mockResolvedValue([{
      id: 'child_1',
      organizationId: 'org_1',
      parentAssignmentId: 'parent_1',
      staffMemberId: 'staff_2',
      userId: 'user_2',
      timeSlotId: 'child_timeslot_1',
      plannedStart: baseStart,
      plannedEnd: baseEnd,
      plannedMinutes: 120,
      status: 'PLANNED',
    }]);
    client.timeSlots.findUnique.mockResolvedValue({
      id: 'parent_timeslot_1',
      startDate: baseStart,
      endDate: new Date(2026, 6, 31, 23, 59, 0, 0),
      repeating: true,
      daysOfWeek: [0],
      startTimeMinutes: 540,
      endTimeMinutes: 660,
    });
    client.timeSlots.findMany.mockResolvedValue([{
      id: 'child_timeslot_1',
      startDate: baseStart,
      endDate: baseEnd,
      repeating: false,
      daysOfWeek: [0],
      startTimeMinutes: 540,
      endTimeMinutes: 660,
    }]);
    client.fields.findFirst.mockResolvedValue({ id: 'field_1', facilityId: 'facility_1' });
    client.facilities.findFirst.mockResolvedValue({ id: 'facility_1', timeZone: 'America/Los_Angeles' });

    await expect(createStaffScheduleAssignment({
      organizationId: 'org_1',
      parentAssignmentId: 'parent_1',
      userId: 'user_1',
      timeSlot: {
        startDate: baseStart,
        endDate: baseEnd,
        repeating: false,
      },
      actingUserId: 'manager_1',
    }, client)).rejects.toMatchObject({
      status: 409,
      message: 'This parent occurrence already has assigned coverage.',
    });
  });

  it('rejects official assignments for staff members without the official type', async () => {
    const client = createClient();

    await expect(createStaffScheduleAssignment({
      organizationId: 'org_1',
      userId: 'user_1',
      assignmentKind: 'OFFICIAL_SHIFT',
      timeSlot: {
        startDate: baseStart,
        endDate: baseEnd,
        repeating: false,
      },
      actingUserId: 'manager_1',
    }, client)).rejects.toMatchObject({
      status: 400,
      message: 'Official assignment requires an official staff member.',
    });
  });
});

describe('updateStaffScheduleAssignment', () => {
  it('lets child coverage update only its pay override', async () => {
    const client = createClient();
    const childAssignment = {
      id: 'child_1',
      organizationId: 'org_1',
      parentAssignmentId: 'parent_1',
      staffMemberId: 'staff_1',
      userId: 'user_1',
      assignmentKind: 'STAFF_SHIFT',
      timeSlotId: 'timeslot_1',
      status: 'PLANNED',
    };
    client.staffScheduleAssignments.findFirst.mockResolvedValue(childAssignment);
    client.staffScheduleAssignments.update.mockImplementation(async ({ data }) => ({
      ...childAssignment,
      ...data,
    }));

    const assignment = await updateStaffScheduleAssignment({
      organizationId: 'org_1',
      assignmentId: 'child_1',
      rateOverrideType: 'HOURLY',
      rateOverrideCents: 2750,
      actingUserId: 'manager_1',
    }, client);

    expect(client.tx.staffScheduleAssignments.update).toHaveBeenCalledWith({
      where: { id: 'child_1' },
      data: {
        rateOverrideType: 'HOURLY',
        rateOverrideCents: 2750,
        updatedBy: 'manager_1',
      },
    });
    expect(assignment).toEqual(expect.objectContaining({
      id: 'child_1',
      rateOverrideCents: 2750,
    }));
  });

  it('rejects changing the staff member on child coverage', async () => {
    const client = createClient();
    client.staffScheduleAssignments.findFirst.mockResolvedValue({
      id: 'child_1',
      organizationId: 'org_1',
      parentAssignmentId: 'parent_1',
      staffMemberId: 'staff_1',
      userId: 'user_1',
      assignmentKind: 'STAFF_SHIFT',
      timeSlotId: 'timeslot_1',
      status: 'PLANNED',
    });

    await expect(updateStaffScheduleAssignment({
      organizationId: 'org_1',
      assignmentId: 'child_1',
      userId: 'user_2',
      rateOverrideType: null,
      rateOverrideCents: null,
      actingUserId: 'manager_1',
    }, client)).rejects.toMatchObject({
      status: 400,
      message: 'Child coverage can only be unassigned or have its pay override changed.',
    });
    expect(client.staffScheduleAssignments.update).not.toHaveBeenCalled();
  });

  it('unassigns child coverage by cancelling the child row', async () => {
    const client = createClient();
    const childAssignment = {
      id: 'child_1',
      organizationId: 'org_1',
      parentAssignmentId: 'parent_1',
      staffMemberId: 'staff_1',
      userId: 'user_1',
      assignmentKind: 'STAFF_SHIFT',
      timeSlotId: 'timeslot_1',
      status: 'PLANNED',
    };
    client.staffScheduleAssignments.findFirst.mockResolvedValue(childAssignment);
    client.staffScheduleAssignments.update.mockImplementation(async ({ data }) => ({
      ...childAssignment,
      ...data,
    }));

    await updateStaffScheduleAssignment({
      organizationId: 'org_1',
      assignmentId: 'child_1',
      action: 'UNASSIGN',
      actingUserId: 'manager_1',
    }, client);

    expect(client.staffScheduleAssignments.update).toHaveBeenCalledWith({
      where: { id: 'child_1' },
      data: {
        status: 'CANCELLED',
        updatedBy: 'manager_1',
      },
    });
  });

  it('updates a parent assignment resource and its linked timeslot fields', async () => {
    const client = createClient();
    const parentAssignment = {
      id: 'parent_1',
      organizationId: 'org_1',
      parentAssignmentId: null,
      staffMemberId: null,
      userId: null,
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_1',
      fieldId: 'field_1',
      timeSlotId: 'timeslot_1',
      status: 'PLANNED',
    };
    client.staffScheduleAssignments.findFirst.mockResolvedValue(parentAssignment);
    client.fields.findFirst.mockResolvedValue({
      id: 'field_2',
      facilityId: 'facility_1',
    });
    client.facilities.findFirst.mockResolvedValue({ id: 'facility_1' });
    client.staffScheduleAssignments.count.mockResolvedValue(0);

    const assignment = await updateStaffScheduleAssignment({
      organizationId: 'org_1',
      assignmentId: 'parent_1',
      facilityId: 'facility_1',
      fieldId: 'field_2',
      actingUserId: 'manager_1',
    }, client);

    expect(client.fields.findFirst).toHaveBeenCalledWith({
      where: { id: 'field_2', organizationId: 'org_1' },
      select: { id: true, facilityId: true },
    });
    expect(client.staffScheduleAssignments.count).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        parentAssignmentId: 'parent_1',
        status: { not: 'CANCELLED' },
      },
    });
    expect(client.tx.timeSlots.update).toHaveBeenCalledWith({
      where: { id: 'timeslot_1' },
      data: expect.objectContaining({
        scheduledFieldId: 'field_2',
        scheduledFieldIds: ['field_2'],
      }),
    });
    expect(client.tx.staffScheduleAssignments.update).toHaveBeenCalledWith({
      where: { id: 'parent_1' },
      data: expect.objectContaining({
        facilityId: 'facility_1',
        fieldId: 'field_2',
        updatedBy: 'manager_1',
      }),
    });
    expect(assignment).toEqual(expect.objectContaining({
      id: 'parent_1',
      fieldId: 'field_2',
      facilityId: 'facility_1',
    }));
  });

  it('updates a parent assignment timeslot and planned range', async () => {
    const client = createClient();
    const parentAssignment = {
      id: 'parent_1',
      organizationId: 'org_1',
      parentAssignmentId: null,
      staffMemberId: null,
      userId: null,
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_1',
      fieldId: 'field_1',
      timeSlotId: 'timeslot_1',
      status: 'PLANNED',
    };
    const nextStart = new Date(2026, 5, 23, 12, 0, 0, 0);
    const nextEnd = new Date(2026, 5, 23, 14, 0, 0, 0);
    client.staffScheduleAssignments.findFirst.mockResolvedValue(parentAssignment);
    client.staffScheduleAssignments.findMany.mockResolvedValue([]);

    await updateStaffScheduleAssignment({
      organizationId: 'org_1',
      assignmentId: 'parent_1',
      timeSlot: {
        startDate: nextStart,
        endDate: nextEnd,
        repeating: false,
        daysOfWeek: [1],
        startTimeMinutes: 720,
        endTimeMinutes: 840,
      },
      actingUserId: 'manager_1',
    }, client);

    expect(client.staffScheduleAssignments.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        parentAssignmentId: 'parent_1',
        status: { not: 'CANCELLED' },
      },
    });
    expect(client.tx.timeSlots.update).toHaveBeenCalledWith({
      where: { id: 'timeslot_1' },
      data: expect.objectContaining({
        startDate: nextStart,
        endDate: nextEnd,
        repeating: false,
        daysOfWeek: [1],
        startTimeMinutes: 720,
        endTimeMinutes: 840,
      }),
    });
    expect(client.tx.staffScheduleAssignments.update).toHaveBeenCalledWith({
      where: { id: 'parent_1' },
      data: expect.objectContaining({
        plannedStart: nextStart,
        plannedEnd: nextEnd,
        plannedMinutes: 120,
        updatedBy: 'manager_1',
      }),
    });
  });

  it('allows shortening a parent repeating assignment when active child coverage still fits', async () => {
    const client = createClient();
    const parentAssignment = {
      id: 'parent_1',
      organizationId: 'org_1',
      parentAssignmentId: null,
      staffMemberId: null,
      userId: null,
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_1',
      fieldId: 'field_1',
      timeSlotId: 'parent_timeslot_1',
      status: 'PLANNED',
    };
    const childAssignment = {
      id: 'child_1',
      organizationId: 'org_1',
      parentAssignmentId: 'parent_1',
      staffMemberId: 'staff_1',
      userId: 'user_1',
      assignmentKind: 'STAFF_SHIFT',
      timeSlotId: 'child_timeslot_1',
      status: 'PLANNED',
    };
    const parentStart = new Date(2026, 6, 14, 14, 0, 0, 0);
    const parentEnd = new Date(2026, 6, 14, 23, 59, 59, 999);
    const childStart = new Date(2026, 6, 14, 14, 0, 0, 0);
    const childEnd = new Date(2026, 6, 14, 15, 0, 0, 0);
    client.staffScheduleAssignments.findFirst.mockResolvedValue(parentAssignment);
    client.staffScheduleAssignments.findMany.mockResolvedValue([childAssignment]);
    client.timeSlots.findMany.mockResolvedValue([{
      id: 'child_timeslot_1',
      startDate: childStart,
      endDate: childEnd,
      repeating: false,
      daysOfWeek: [1],
      startTimeMinutes: 840,
      endTimeMinutes: 900,
    }]);

    await updateStaffScheduleAssignment({
      organizationId: 'org_1',
      assignmentId: 'parent_1',
      timeSlot: {
        startDate: parentStart,
        endDate: parentEnd,
        repeating: true,
        daysOfWeek: [1],
        startTimeMinutes: 840,
        endTimeMinutes: 900,
      },
      actingUserId: 'manager_1',
    }, client);

    expect(client.timeSlots.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['child_timeslot_1'] } },
    });
    expect(client.tx.timeSlots.update).toHaveBeenCalledWith({
      where: { id: 'parent_timeslot_1' },
      data: expect.objectContaining({
        endDate: parentEnd,
        repeating: true,
      }),
    });
  });

  it('rejects shortening a parent repeating assignment past active child coverage', async () => {
    const client = createClient();
    const parentAssignment = {
      id: 'parent_1',
      organizationId: 'org_1',
      parentAssignmentId: null,
      staffMemberId: null,
      userId: null,
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_1',
      fieldId: 'field_1',
      timeSlotId: 'parent_timeslot_1',
      status: 'PLANNED',
    };
    const childAssignment = {
      id: 'child_1',
      organizationId: 'org_1',
      parentAssignmentId: 'parent_1',
      staffMemberId: 'staff_1',
      userId: 'user_1',
      assignmentKind: 'STAFF_SHIFT',
      timeSlotId: 'child_timeslot_1',
      status: 'PLANNED',
    };
    client.staffScheduleAssignments.findFirst.mockResolvedValue(parentAssignment);
    client.staffScheduleAssignments.findMany.mockResolvedValue([childAssignment]);
    client.timeSlots.findMany.mockResolvedValue([{
      id: 'child_timeslot_1',
      startDate: new Date(2026, 6, 21, 14, 0, 0, 0),
      endDate: new Date(2026, 6, 21, 15, 0, 0, 0),
      repeating: false,
      daysOfWeek: [1],
      startTimeMinutes: 840,
      endTimeMinutes: 900,
    }]);

    await expect(updateStaffScheduleAssignment({
      organizationId: 'org_1',
      assignmentId: 'parent_1',
      timeSlot: {
        startDate: new Date(2026, 6, 14, 14, 0, 0, 0),
        endDate: new Date(2026, 6, 14, 23, 59, 59, 999),
        repeating: true,
        daysOfWeek: [1],
        startTimeMinutes: 840,
        endTimeMinutes: 900,
      },
      actingUserId: 'manager_1',
    }, client)).rejects.toMatchObject({
      status: 400,
      message: 'Assigned coverage must end within the parent assignment range.',
    });

    expect(client.tx.timeSlots.update).not.toHaveBeenCalled();
    expect(client.tx.staffScheduleAssignments.update).not.toHaveBeenCalled();
  });

  it('updates a child assignment timeslot within the parent coverage window', async () => {
    const client = createClient();
    const childAssignment = {
      id: 'child_1',
      organizationId: 'org_1',
      parentAssignmentId: 'parent_1',
      staffMemberId: 'staff_1',
      userId: 'user_1',
      assignmentKind: 'STAFF_SHIFT',
      timeSlotId: 'child_timeslot_1',
      status: 'PLANNED',
    };
    const parentAssignment = {
      id: 'parent_1',
      organizationId: 'org_1',
      parentAssignmentId: null,
      assignmentKind: 'STAFF_SHIFT',
      timeSlotId: 'parent_timeslot_1',
      status: 'PLANNED',
    };
    const parentTimeSlot = {
      id: 'parent_timeslot_1',
      startDate: baseStart,
      endDate: baseEnd,
      repeating: false,
      daysOfWeek: [0],
      startTimeMinutes: 540,
      endTimeMinutes: 660,
    };
    const nextStart = new Date(2026, 5, 22, 9, 30, 0, 0);
    const nextEnd = new Date(2026, 5, 22, 10, 30, 0, 0);
    client.staffScheduleAssignments.findFirst
      .mockResolvedValueOnce(childAssignment)
      .mockResolvedValueOnce(parentAssignment);
    client.timeSlots.findUnique.mockResolvedValue(parentTimeSlot);

    await updateStaffScheduleAssignment({
      organizationId: 'org_1',
      assignmentId: 'child_1',
      timeSlot: {
        startDate: nextStart,
        endDate: nextEnd,
        repeating: false,
        daysOfWeek: [0],
        startTimeMinutes: 570,
        endTimeMinutes: 630,
      },
      actingUserId: 'manager_1',
    }, client);

    expect(client.staffScheduleAssignments.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        parentAssignmentId: 'parent_1',
        status: { not: 'CANCELLED' },
      },
    });
    expect(client.tx.timeSlots.update).toHaveBeenCalledWith({
      where: { id: 'child_timeslot_1' },
      data: expect.objectContaining({
        startDate: nextStart,
        endDate: nextEnd,
        startTimeMinutes: 570,
        endTimeMinutes: 630,
      }),
    });
    expect(client.tx.staffScheduleAssignments.update).toHaveBeenCalledWith({
      where: { id: 'child_1' },
      data: expect.objectContaining({
        plannedStart: nextStart,
        plannedEnd: nextEnd,
        plannedMinutes: 60,
        updatedBy: 'manager_1',
      }),
    });
  });

  it('rejects child assignment timeslot updates outside the parent coverage window', async () => {
    const client = createClient();
    const childAssignment = {
      id: 'child_1',
      organizationId: 'org_1',
      parentAssignmentId: 'parent_1',
      staffMemberId: 'staff_1',
      userId: 'user_1',
      assignmentKind: 'STAFF_SHIFT',
      timeSlotId: 'child_timeslot_1',
      status: 'PLANNED',
    };
    const parentAssignment = {
      id: 'parent_1',
      organizationId: 'org_1',
      parentAssignmentId: null,
      assignmentKind: 'STAFF_SHIFT',
      timeSlotId: 'parent_timeslot_1',
      status: 'PLANNED',
    };
    const parentTimeSlot = {
      id: 'parent_timeslot_1',
      startDate: baseStart,
      endDate: baseEnd,
      repeating: false,
      daysOfWeek: [0],
      startTimeMinutes: 540,
      endTimeMinutes: 660,
    };
    client.staffScheduleAssignments.findFirst
      .mockResolvedValueOnce(childAssignment)
      .mockResolvedValueOnce(parentAssignment);
    client.timeSlots.findUnique.mockResolvedValue(parentTimeSlot);

    await expect(updateStaffScheduleAssignment({
      organizationId: 'org_1',
      assignmentId: 'child_1',
      timeSlot: {
        startDate: new Date(2026, 5, 22, 8, 30, 0, 0),
        endDate: new Date(2026, 5, 22, 10, 30, 0, 0),
        repeating: false,
        daysOfWeek: [0],
        startTimeMinutes: 510,
        endTimeMinutes: 630,
      },
      actingUserId: 'manager_1',
    }, client)).rejects.toMatchObject({
      status: 400,
      message: 'Assigned coverage must stay within the parent assignment time.',
    });

    expect(client.tx.timeSlots.update).not.toHaveBeenCalled();
    expect(client.tx.staffScheduleAssignments.update).not.toHaveBeenCalled();
  });

  it('rejects changing resources on child coverage', async () => {
    const client = createClient();
    client.staffScheduleAssignments.findFirst.mockResolvedValue({
      id: 'child_1',
      organizationId: 'org_1',
      parentAssignmentId: 'parent_1',
      staffMemberId: 'staff_1',
      userId: 'user_1',
      assignmentKind: 'STAFF_SHIFT',
      facilityId: 'facility_1',
      fieldId: 'field_1',
      timeSlotId: 'timeslot_1',
      status: 'PLANNED',
    });

    await expect(updateStaffScheduleAssignment({
      organizationId: 'org_1',
      assignmentId: 'child_1',
      facilityId: 'facility_1',
      fieldId: 'field_2',
      actingUserId: 'manager_1',
    }, client)).rejects.toMatchObject({
      status: 400,
      message: 'Child coverage inherits resource assignment from its parent.',
    });
    expect(client.tx.staffScheduleAssignments.update).not.toHaveBeenCalled();
  });
});

describe('deleteStaffScheduleAssignment', () => {
  it('rejects deleting child coverage', async () => {
    const client = createClient();
    client.staffScheduleAssignments.findFirst.mockResolvedValue({
      id: 'child_1',
      organizationId: 'org_1',
      parentAssignmentId: 'parent_1',
      assignmentKind: 'STAFF_SHIFT',
      timeSlotId: 'timeslot_1',
      status: 'PLANNED',
    });

    await expect(deleteStaffScheduleAssignment({
      organizationId: 'org_1',
      assignmentId: 'child_1',
      actingUserId: 'manager_1',
    }, client)).rejects.toMatchObject({
      status: 400,
      message: 'Child coverage cannot be deleted. Unassign the staff member instead.',
    });
    expect(client.staffScheduleAssignments.updateMany).not.toHaveBeenCalled();
  });

  it('cancels a parent assignment and its child coverage when deleted', async () => {
    const client = createClient();
    client.staffScheduleAssignments.findFirst.mockResolvedValue({
      id: 'parent_1',
      organizationId: 'org_1',
      parentAssignmentId: null,
      assignmentKind: 'STAFF_SHIFT',
      timeSlotId: 'timeslot_1',
      status: 'PLANNED',
    });

    const result = await deleteStaffScheduleAssignment({
      organizationId: 'org_1',
      assignmentId: 'parent_1',
      actingUserId: 'manager_1',
    }, client);

    expect(client.staffScheduleAssignments.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        OR: [
          { id: 'parent_1' },
          { parentAssignmentId: 'parent_1' },
        ],
      },
      data: {
        status: 'CANCELLED',
        updatedBy: 'manager_1',
      },
    });
    expect(result).toEqual({ id: 'parent_1', deleted: true });
  });
});
