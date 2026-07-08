import React from 'react';
import { render, screen } from '@testing-library/react';
import AdminUserProfilePage from '../page';
import { prisma } from '@/lib/prisma';

const cookiesMock = jest.fn();
const redirectMock = jest.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const notFoundMock = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
const resolveRazumlyAdminFromTokenMock = jest.fn();

jest.mock('next/headers', () => ({
  cookies: () => cookiesMock(),
}));

jest.mock('next/navigation', () => ({
  redirect: (path: string) => redirectMock(path),
  notFound: () => notFoundMock(),
}));

jest.mock('@/server/razumlyAdmin', () => ({
  resolveRazumlyAdminFromToken: (...args: unknown[]) => resolveRazumlyAdminFromTokenMock(...args),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    userData: { findUnique: jest.fn() },
    authUser: { findUnique: jest.fn() },
    sensitiveUserData: { findFirst: jest.fn() },
    staffMembers: { findMany: jest.fn() },
    events: { findMany: jest.fn() },
    teamRegistrations: { findMany: jest.fn() },
    teamStaffAssignments: { findMany: jest.fn() },
    organizations: { findMany: jest.fn() },
    canonicalTeams: { findMany: jest.fn() },
  },
}));

jest.mock('@/components/layout/Navigation', () => ({
  __esModule: true,
  default: () => <nav data-testid="navigation" />,
}));

jest.mock('@mantine/core', () => {
  const makeComponent = (tag: keyof JSX.IntrinsicElements) => {
    const Component = ({ children }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement(tag, {}, children);
    Component.displayName = `Mock${String(tag)}`;
    return Component;
  };

  const Button = ({
    children,
    component: Component = 'button',
    ...props
  }: React.PropsWithChildren<{ component?: React.ElementType } & Record<string, unknown>>) => {
    if (typeof Component === 'function') {
      throw new Error('Button component prop must be serializable from the server page');
    }
    return React.createElement(Component, props, children);
  };

  const Table = makeComponent('table') as React.FC<React.PropsWithChildren> & {
    Tbody: React.FC<React.PropsWithChildren>;
    Td: React.FC<React.PropsWithChildren<Record<string, unknown>>>;
    Th: React.FC<React.PropsWithChildren>;
    Thead: React.FC<React.PropsWithChildren>;
    Tr: React.FC<React.PropsWithChildren>;
  };
  Table.Tbody = makeComponent('tbody');
  Table.Td = makeComponent('td');
  Table.Th = makeComponent('th');
  Table.Thead = makeComponent('thead');
  Table.Tr = makeComponent('tr');

  return {
    Badge: makeComponent('span'),
    Button,
    Container: makeComponent('div'),
    Group: makeComponent('div'),
    Paper: makeComponent('section'),
    SimpleGrid: makeComponent('div'),
    Table,
    Text: makeComponent('p'),
    Title: makeComponent('h2'),
  };
});

const mockPrisma = prisma as unknown as {
  userData: { findUnique: jest.Mock };
  authUser: { findUnique: jest.Mock };
  sensitiveUserData: { findFirst: jest.Mock };
  staffMembers: { findMany: jest.Mock };
  events: { findMany: jest.Mock };
  teamRegistrations: { findMany: jest.Mock };
  teamStaffAssignments: { findMany: jest.Mock };
  organizations: { findMany: jest.Mock };
  canonicalTeams: { findMany: jest.Mock };
};

describe('Admin user profile page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cookiesMock.mockResolvedValue({
      get: () => ({ value: 'admin-token' }),
    });
    resolveRazumlyAdminFromTokenMock.mockResolvedValue({
      session: { userId: 'admin-user', sessionVersion: 1 },
      status: { allowed: true, email: 'samuel@razumly.com', verified: true },
    });
    mockPrisma.userData.findUnique.mockResolvedValue({
      id: 'user-1',
      firstName: 'Marc',
      lastName: 'Berezhnoy',
      userName: 'berezhnoymarc',
      createdAt: new Date('2026-07-08T12:33:07.000Z'),
      updatedAt: new Date('2026-07-08T12:33:24.000Z'),
    });
    mockPrisma.authUser.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'berezhnoymarc@gmail.com',
      emailVerifiedAt: new Date('2026-07-08T12:33:24.000Z'),
      disabledAt: null,
      disabledReason: null,
      createdAt: new Date('2026-07-08T12:33:07.000Z'),
      updatedAt: new Date('2026-07-08T12:33:24.000Z'),
    });
    mockPrisma.sensitiveUserData.findFirst.mockResolvedValue({
      email: 'berezhnoymarc@gmail.com',
      billingCity: null,
      billingState: null,
      billingCountryCode: null,
    });
    mockPrisma.staffMembers.findMany.mockResolvedValue([]);
    mockPrisma.events.findMany.mockResolvedValue([]);
    mockPrisma.teamRegistrations.findMany.mockResolvedValue([]);
    mockPrisma.teamStaffAssignments.findMany.mockResolvedValue([]);
    mockPrisma.organizations.findMany.mockResolvedValue([]);
    mockPrisma.canonicalTeams.findMany.mockResolvedValue([]);
  });

  it('renders the admin user profile without passing a function component through Mantine Button', async () => {
    const view = await AdminUserProfilePage({ params: Promise.resolve({ id: 'user-1' }) });

    render(view);

    expect(screen.getByText('Marc Berezhnoy')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to admin' })).toHaveAttribute('href', '/admin');
  });
});
