/** @jest-environment node */

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  createStaffScheduleAssignment,
} from '@/server/staff/scheduleAssignments';

const baseStart = new Date(2026, 5, 22, 9, 0, 0, 0);
const baseEnd = new Date(2026, 5, 22, 11, 0, 0, 0);

const createClient = () => {
  const tx = {
    timeSlots: {
      create: jest.fn().mockImplementation(async ({ data }) => ({ ...data, id: 'timeslot_1' })),
    },
    staffScheduleAssignments: {
      create: jest.fn().mockImplementation(async ({ data }) => ({ ...data, id: 'assignment_1' })),
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
