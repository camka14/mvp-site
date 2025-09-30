---
name: "TypeScript Next.js Appwrite Web App Guide"
description: "A comprehensive development guide for building a full-stack web application using TypeScript, Next.js 13, Mantine UI, and Appwrite for backend services"
category: "Web Development"
author: "Agents.md Collection"
authorUrl: "https://github.com/gakeez/agents_md_collection"
tags:
  - typescript
  - nextjs
  - mantine
  - appwrite
  - web-development
  - full-stack
  - react
  - saas
lastUpdated: "2025-09-29"
---

# TypeScript Next.js Appwrite Web App Guide

## Project Overview

This guide covers best practices for developing a **full-stack web application** with **Next.js 13** (React 18) as the front-end framework, **TypeScript** for type safety, **Mantine** as the UI component library, and **Appwrite** as the backend platform. The example project is a volleyball event platform (MVP-site) where users can sign up, create profiles, form teams, join events, chat with other players, and handle payments for event registrations. We emphasize a **modular architecture**: Next.js for routing and SSR, Mantine for cohesive UI components, and Appwrite for authentication, **TablesDB** (tables/rows + relationship columns), file storage for images, and cloud functions for advanced logic (like Stripe payments and notifications). By following this guide, you will learn how to structure a scalable Next.js project, use Mantine components effectively, and integrate Appwrite services (auth, tables/rows **with object-argument SDK calls**, storage, functions) properly for a robust, maintainable application.

> **What changed?** Appwrite’s modern SDKs use **Tables/Rows** (not collections/documents) and **object-style arguments** (not positional). This guide uses `TablesDB` and object arguments everywhere.

## Tech Stack

- **Framework**: Next.js 13 (React 18) using the App Router (files in `src/app`)
- **Language**: TypeScript 5.x for all front-end and back-end code
- **UI Library**: **Mantine** for React – modals, inputs, cards, Grid, Overlay, Drawer, Notifications, etc. with theming support
- **State Management**: React Hooks and Context API
- **Backend Platform**: Appwrite (Cloud or Self-hosted)  
  - **Authentication**: Appwrite **Account** (email-password, OAuth)
  - **Database**: **TablesDB** → **tables/rows** with **relationship columns**
  - **Storage**: Storage buckets for user-uploaded images (avatars, team logos, event images)
  - **Serverless Functions**: Appwrite Functions (Stripe integration, email/notifications, tournament ops)
- **Styling**: CSS Modules or Global CSS; Mantine components handle most styling
- **Forms & Validation**: Mantine inputs + simple client checks; schema enforced by Appwrite table columns
- **Payments**: Stripe API via Appwrite Functions
- **Real-time** *(optional)*: Appwrite Realtime and row subscriptions

## Development Environment Setup

### Installation Requirements

- **Node.js**: 18+
- **Package Manager**: npm or Yarn
- **Appwrite Instance**: Project with TablesDB, Storage bucket(s), and Functions
- **Environment Variables** (`.env.local`):
  - `NEXT_PUBLIC_APPWRITE_ENDPOINT`, `NEXT_PUBLIC_APPWRITE_PROJECT_ID`
  - `NEXT_PUBLIC_APPWRITE_DATABASE_ID`
  - Table IDs: `NEXT_PUBLIC_USERS_TABLE_ID`, `NEXT_PUBLIC_TEAMS_TABLE_ID`, `NEXT_PUBLIC_EVENTS_TABLE_ID`, etc.
  - Storage: `NEXT_PUBLIC_IMAGES_BUCKET_ID`
  - Functions: `NEXT_PUBLIC_BILLING_FUNCTION_ID`, `NEXT_PUBLIC_CHAT_FUNCTION_ID`, etc.

### Installation Steps

```bash
# 1. Clone the repository
git clone https://github.com/camka14/mvp-site.git
cd mvp-site

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Fill in endpoint, project id, database id, table ids, bucket ids, function ids

# 4. Run the development server
npm run dev

# 5. Open http://localhost:3000
```

## Project Structure

```
mvp-site/
├── src/
│   ├── app/                       # Next.js 13 App Router
│   │   ├── layout.tsx             # MantineProvider + global providers
│   │   ├── page.tsx               # Home
│   │   ├── login/page.tsx         # Login
│   │   ├── register/page.tsx      # Registration
│   │   ├── events/
│   │   │   ├── page.tsx           # Events listing
│   │   │   ├── [eventId]/page.tsx # Event detail
│   │   │   └── components/        # Event modals & widgets
│   │   ├── teams/
│   │   │   ├── page.tsx           # Teams page
│   │   │   └── components/        # Team modals & widgets
│   │   └── ...                    # More routes (profile, etc.)
│   ├── components/
│   │   ├── ui/                    # Mantine-based reusable UI
│   │   │   ├── UserCard.tsx
│   │   │   ├── TeamCard.tsx
│   │   │   ├── ImageUploader.tsx
│   │   │   ├── ImageSelectionModal.tsx
│   │   │   └── ...
│   │   └── chat/
│   │       ├── ChatComponents.tsx
│   │       └── InviteUsersModal.tsx
│   ├── context/
│   │   ├── ChatContext.tsx
│   │   └── ChatUIContext.tsx
│   ├── lib/                       # Appwrite client + service modules
│   │   ├── appwrite.ts            # Client, Account, TablesDB, Storage, Functions
│   │   ├── auth.ts
│   │   ├── userService.ts
│   │   ├── teamService.ts
│   │   ├── eventService.ts
│   │   ├── tournamentService.ts
│   │   ├── chatService.ts
│   │   ├── paymentService.ts
│   │   └── fieldService.ts
│   ├── types/
│   │   └── index.ts               # UserData, Team, Event, etc.
│   └── globals.css
├── public/
│   └── favicon.ico
├── .env.example
├── package.json
└── ...
```

## Core Development Principles

### Code Style and Structure

- **Functional Components & Hooks**: Client interactivity lives in client components (`'use client'`). Server Components can pre-render public pages.
- **Separation of Concerns**: UI calls **service modules** in `lib/*Service.ts`. Services wrap Appwrite SDK calls so components don’t talk to SDKs directly.
- **Naming**: Booleans as `is*/has*`; service methods `createX/getX/updateX/deleteX`.
- **Types**: Strong interfaces for rows; extend with computed fields for UI.
- **Immutability**: Functional state updates; pure async service functions with `try/catch` + user feedback (Mantine Notifications/Loading overlays).

### Data Models (Tables/Rows)

```ts
// src/types/index.ts
export interface UserData {
  $id: string;
  firstName: string;
  lastName: string;
  userName: string;
  email?: string;
  teams?: Team[];           // relationship column when selected (see Query.select)
  teamIds?: string[];       // if you keep raw IDs for compatibility
  friends?: UserData[];     // self relation (many-to-many) when selected
  friendIds?: string[];     // optional raw ID array
  uploadedImages?: string[];
  profileImageId?: string;
  $createdAt?: string;
  $updatedAt?: string;
  // Computed
  fullName?: string;
  avatarUrl?: string;
}

export interface Team {
  $id: string;
  name: string;
  sport: string;
  division: string;
  players?: UserData[];     // relationship column (two-way to users)
  captain?: UserData | null;// many-to-one user
  pending?: UserData[];     // optional relation for invites
  teamSize: number;
  profileImageId?: string;
  wins: number;
  losses: number;
  $createdAt?: string;
  // Derived
  winRate?: number;
  isFull?: boolean;
}
```

> **Tip**: Prefer **relationship columns** like `players`, `teams`, `captain` instead of keeping only `playerIds`/`teamIds`. When you **select** relationships, SDK returns full related **rows** under those keys.

## Mantine UI (site-wide)

At `src/app/layout.tsx`, wrap the app with `MantineProvider` (and optionally `ModalsProvider`, `Notifications`). Keep UI consistent by using Mantine components for forms, overlays, dialogs, lists, and grids.

```tsx
// src/app/layout.tsx
'use client';

import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MantineProvider>
          <ModalsProvider>
            <Notifications />
            {children}
          </ModalsProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
```

### Common Mantine Patterns

- `Card`, `Paper`, `Box`, `Group`, `Stack` for layout
- `TextInput`, `Select`, `NumberInput`, `Checkbox`, `Textarea` for forms
- `Modal`, `Drawer`, `Popover` for overlays
- `Button`, `ActionIcon`, `Badge`, `Avatar`, `Image`
- `useDisclosure` to control modal/drawer open state

## Appwrite Client (Web SDK) – **object arguments + tables/rows**

```ts
// src/lib/appwrite.ts
import { Client, Account, TablesDB, Storage, Functions, ID, Query } from 'appwrite';

export const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);

export const account = new Account(client);
export const tables = new TablesDB(client);
export const storage = new Storage(client);
export const functions = new Functions(client);

export { ID, Query };
```

### Auth helpers (email/password)

```ts
// src/lib/auth.ts
import { account, ID } from './appwrite';

export async function register(email: string, password: string, name?: string) {
  return account.create({ userId: ID.unique(), email, password, name });
}

export async function login(email: string, password: string) {
  return account.createEmailPasswordSession({ email, password });
}

export async function getCurrentUser() {
  return account.get();
}

export async function logout() {
  return account.deleteSession({ sessionId: 'current' });
}
```

## TablesDB — Relationships done right

### 1) Define relationship columns (one-time, in Console or Server SDK)

- **Users ↔ Teams**: two-way **many-to-many** via `users.teams` ↔ `teams.players`
- **Teams → captain**: **many-to-one** from teams to users via `teams.captain`
- **Events ↔ Teams/Users**: many-to-many depending on your participation model

> Create in Console (Databases → *your db* → Tables → *table* → Columns → **Relationship**), or via Server SDK (admin key):

```ts
// Server-side (Node) setup script – run once
import { Client, TablesDB, RelationshipType, RelationMutate } from 'node-appwrite';

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT!)
  .setProject(process.env.APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const tablesDB = new TablesDB(client);

// Teams.players ↔ Users.teams (two-way many)
await tablesDB.createRelationshipColumn({
  databaseId: process.env.APPWRITE_DB_ID!,
  tableId: process.env.TEAMS_TABLE_ID!,
  relatedTableId: process.env.USERS_TABLE_ID!,
  type: RelationshipType.OneToMany,   // one team -> many users
  twoWay: true,
  key: 'players',                     // on Teams
  twoWayKey: 'teams',                 // on Users
  onDelete: RelationMutate.Restrict,  // prevent deleting teams with members
});

// Teams.captain (many teams -> one user), optional two-way key "captainOf"
await tablesDB.createRelationshipColumn({
  databaseId: process.env.APPWRITE_DB_ID!,
  tableId: process.env.TEAMS_TABLE_ID!,
  relatedTableId: process.env.USERS_TABLE_ID!,
  type: RelationshipType.ManyToOne,   // many teams -> one user
  twoWay: true,
  key: 'captain',                     // on Teams
  twoWayKey: 'captainOf',             // on Users (array)
  onDelete: RelationMutate.SetNull,   // if captain deleted, null out on teams
});
```

### 2) Create rows (reference or nested)

**By reference (typical for MVP-site):**

```ts
// Create team with existing user members
import { tables, ID } from './appwrite';

export async function createTeam(data: {
  name: string;
  sport: string;
  division: string;
  playerIds?: string[]; // user row IDs
  captainId?: string;   // user row ID
  teamSize: number;
}) {
  return tables.createRow({
    databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
    tableId: process.env.NEXT_PUBLIC_TEAMS_TABLE_ID!,
    rowId: ID.unique(),
    data: {
      name: data.name,
      sport: data.sport,
      division: data.division,
      players: data.playerIds ?? [],
      captain: data.captainId ?? null,
      teamSize: data.teamSize,
    },
  });
}
```

**Nested (optional):** you can create parent + child rows together by **nesting** related row data in `data` (IDs auto-assigned when omitted). Prefer this when bootstrapping seed data.

### 3) Read rows with related data (opt-in selection)

By default, you get only the row’s own columns. To load related rows, **select them explicitly**:

```ts
// Get a team WITH players and captain
import { tables, Query } from './appwrite';

export async function getTeam(teamId: string, withRelations = true) {
  const queries = withRelations ? [Query.select(['*', 'players.*', 'captain.*'])] : [];
  return tables.getRow({
    databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
    tableId: process.env.NEXT_PUBLIC_TEAMS_TABLE_ID!,
    rowId: teamId,
    queries,
  });
}

// List teams for a given user
export async function listTeamsForUser(userId: string) {
  return tables.listRows({
    databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
    tableId: process.env.NEXT_PUBLIC_TEAMS_TABLE_ID!,
    queries: [
      // array-contains works on relationship columns
      Query.contains('players', userId),
      Query.limit(50),
      Query.select(['*', 'players.*', 'captain.*']),
    ],
  });
}
```

### 4) Update / unlink relationships

Relationships are updated by changing the relationship **column**:

```ts
// Add a player to a team
export async function addPlayer(teamId: string, userId: string) {
  const team = await tables.getRow({
    databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
    tableId: process.env.NEXT_PUBLIC_TEAMS_TABLE_ID!,
    rowId: teamId,
  });

  const players: string[] = Array.isArray((team as any).players) ? (team as any).players : [];
  const next = Array.from(new Set([...players, userId]));

  return tables.updateRow({
    databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
    tableId: process.env.NEXT_PUBLIC_TEAMS_TABLE_ID!,
    rowId: teamId,
    data: { players: next },
  });
}

// Remove a player (unlink)
export async function removePlayer(teamId: string, userId: string) {
  const team = await tables.getRow({
    databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
    tableId: process.env.NEXT_PUBLIC_TEAMS_TABLE_ID!,
    rowId: teamId,
  });

  const players: string[] = Array.isArray((team as any).players) ? (team as any).players : [];
  const next = players.filter((id) => id !== userId);

  return tables.updateRow({
    databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
    tableId: process.env.NEXT_PUBLIC_TEAMS_TABLE_ID!,
    rowId: teamId,
    data: { players: next },
  });
}

// Clear a one-to-one relation: set column to null
export async function clearCaptain(teamId: string) {
  return tables.updateRow({
    databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
    tableId: process.env.NEXT_PUBLIC_TEAMS_TABLE_ID!,
    rowId: teamId,
    data: { captain: null },
  });
}
```

> **On delete**: behavior follows your relationship `onDelete` setting (`restrict`, `cascade`, `setNull`). For example, deleting a user with `setNull` on `teams.captain` will null-out the captain column on related teams.

### 5) Permissions

- To access related rows, the user must have permission on both the parent and child rows.
- When creating nested rows, child rows **inherit** permissions from the parent unless overridden.
- Use document security (row-level) with roles like `user:$id` and Teams.

## Storage — images & avatars (object arguments)

```ts
// Upload
export async function uploadImage(file: File) {
  return storage.createFile({
    bucketId: process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!,
    fileId: ID.unique(),
    file,
    // permissions: ['read("any")'] // optionally make public
  });
}

// Preview URL (avatar)
export function getFilePreviewUrl(fileId: string, w = 64, h = 64) {
  return storage.getFilePreview({
    bucketId: process.env.NEXT_PUBLIC_IMAGES_BUCKET_ID!,
    fileId,
    width: w,
    height: h,
  }).href;
}
```

### Mantine UI snippet (Image/Avatar)

```tsx
import { Avatar, Image } from '@mantine/core';
// Avatar
<Avatar src={user.profileImageId ? getFilePreviewUrl(user.profileImageId, 64, 64) : undefined} radius="xl" />

// Image
<Image src={team.profileImageId ? getFilePreviewUrl(team.profileImageId, 320, 180) : undefined} radius="md" />
```

## Functions — Stripe & notifications (object arguments)

```ts
// Example: create payment intent via Appwrite Function
export async function createPaymentIntent(payload: {
  amount: number; currency: string; userId: string; eventId: string;
}) {
  const exec = await functions.createExecution({
    functionId: process.env.NEXT_PUBLIC_BILLING_FUNCTION_ID!,
    body: JSON.stringify({ command: 'create_payment_intent', ...payload }),
    async: false,           // wait for result in responseBody
    method: 'POST',
    path: '/payments',
  });

  const result = JSON.parse(exec.responseBody ?? '{}');
  if (result.error) throw new Error(result.error);
  return result;
}
```

## Example: Team screen (Mantine + TablesDB)

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Group, Text, Modal, TextInput, Select, NumberInput } from '@mantine/core';
import { createTeam, listTeamsForUser } from '@/src/lib/teamService';
import { useDisclosure } from '@mantine/hooks';

export default function TeamsPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [opened, { open, close }] = useDisclosure(false);
  const [form, setForm] = useState({ name: '', sport: '', division: '', teamSize: 6 });

  useEffect(() => {
    // Load current user's teams (replace with real userId)
    const userId = 'current-user-row-id';
    listTeamsForUser(userId).then((res) => setTeams(res.rows ?? (res as any).documents ?? []));
  }, []);

  return (
    <>
      <Group justify="space-between" mb="lg">
        <Text fw={700} size="lg">Your teams</Text>
        <Button onClick={open}>Create team</Button>
      </Group>

      <Group align="stretch">
        {teams.map((t) => (
          <Card key={t.$id} withBorder>
            <Text fw={600}>{t.name}</Text>
            <Text size="sm" c="dimmed">{t.sport} · {t.division}</Text>
          </Card>
        ))}
      </Group>

      <Modal opened={opened} onClose={close} title="Create New Team" centered>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await createTeam({ ...form });
            close();
          }}
        >
          <Stack>
            <TextInput label="Team name" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.currentTarget.value }))} />
            <Select label="Sport" data={['Volleyball']} value={form.sport} onChange={(v) => setForm((p) => ({ ...p, sport: v || '' }))} />
            <Select label="Division" data={['A', 'B', 'C']} value={form.division} onChange={(v) => setForm((p) => ({ ...p, division: v || '' }))} />
            <NumberInput label="Team size" min={2} max={12} value={form.teamSize} onChange={(v) => setForm((p) => ({ ...p, teamSize: Number(v) }))} />
            <Group justify="flex-end" mt="md">
              <Button type="submit">Create</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
```

## Query cheat‑sheet (TablesDB)

- **Select columns** (including relationships): `Query.select(['*', 'players.*', 'captain.*'])`
- **Filter by equality**: `Query.equal('sport', ['volleyball'])`
- **Array contains** (IDs in relation arrays): `Query.contains('players', userId)`
- **Pagination**: `Query.limit(50)`, `Query.cursorAfter('rowId')`
- **Ordering**: `Query.orderAsc('name')`, `Query.orderDesc('$createdAt')`

## Testing & Quality Assurance

### Tooling & Commands

- **Test runner**: Jest with `ts-jest` presets. Keep the config in `jest.config.ts` (or extend `package.json` if preferred).
- **Run quickly during development**: `npx jest --watch` scoped to changed files. For CI-quality checks use `npm run test -- --runInBand` to avoid concurrency issues with Appwrite mocks.
- **Type safety first**: always pair `npx tsc --noEmit` with Jest to surface type regressions alongside behavioural ones.

```ts
// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};

export default config;
```

### When to Write Tests

- **Every new function or feature** ships with at least one Jest test that proves the primary behaviour (happy-path) and a failure mode. Service-layer additions should cover Appwrite SDK usage via mocks.
- **Bug fixes** include a regression test first, demonstrating the failing case before applying the patch.
- **UI components** that contain business logic (form validation, derived state, conditional rendering) get component tests using `@testing-library/react` with Jest DOM matchers.

> **Rule of thumb**: if code is complex enough to require a comment, it is complex enough to need a Jest test.

### Structuring Tests

- Co-locate unit tests beside the implementation: `yourFunction.test.ts` next to `yourFunction.ts`, or use `__tests__` folders for higher-level scenarios. Keep mocks under `test/mocks/*` so they can be reused.
- Prefer deterministic inputs—mock time (`jest.useFakeTimers()`), network responses, and Appwrite clients to keep tests fast and hermetic. Avoid hitting real Appwrite instances.
- Use factory helpers (`buildEvent()`, `buildTeam()`) in `test/factories.ts` to reduce duplication when creating domain objects for assertions.

### Examples

**Service function map test**

```ts
// src/lib/__tests__/eventService.test.ts
import { eventService } from '@/lib/eventService';
import { tables } from '@/app/appwrite';

jest.mock('@/app/appwrite', () => ({
  tables: { getRow: jest.fn() },
}));

describe('eventService.getEventWithRelations', () => {
  it('hydrates time slots with relationship data', async () => {
    (tables.getRow as jest.Mock).mockResolvedValue({
      $id: 'evt_123',
      weeklySchedules: [{
        $id: 'ts_1',
        dayOfWeek: 1,
        startTime: 540,
        endTime: 600,
        timezone: 'America/Denver',
        field: { $id: 'fld_1', name: 'Court A' },
      }],
    });

    const result = await eventService.getEventWithRelations('evt_123');

    expect(result?.timeSlots?.[0]).toMatchObject({
      startTime: 540,
      field: expect.objectContaining({ name: 'Court A' }),
    });
  });
});
```

**Component interaction test**

```tsx
// src/app/events/components/__tests__/LeagueFields.test.tsx
import { render, fireEvent } from '@testing-library/react';
import LeagueFields from '../LeagueFields';

const noop = () => {};

it('converts time input into minutes before invoking onUpdateSlot', () => {
  const onUpdateSlot = jest.fn();

  const { getByLabelText } = render(
    <LeagueFields
      leagueData={{ gamesPerOpponent: 1, includePlayoffs: false, usesSets: false, matchDurationMinutes: 60 }}
      onLeagueDataChange={noop}
      slots={[{
        key: 'slot-1',
        fieldId: 'fld_1',
        dayOfWeek: 1,
        startTime: 540,
        endTime: 600,
        timezone: 'UTC',
        conflicts: [],
        checking: false,
      }]}
      onAddSlot={noop}
      onUpdateSlot={onUpdateSlot}
      onRemoveSlot={noop}
      fields={[]}
      fieldsLoading={false}
    />
  );

  fireEvent.change(getByLabelText(/Start Time/i), { target: { value: '10:00' } });

  expect(onUpdateSlot).toHaveBeenCalledWith(0, expect.objectContaining({ startTime: 600 }));
});
```

### Test Review Checklist

- Does the change include Jest coverage for new/modified logic?
- Are mocks and spies reset with `afterEach(jest.clearAllMocks)` to avoid test bleed?
- Are asynchronous tests using `await`/`findBy*` rather than timers? Prefer `waitFor` for retry logic.
- Is coverage meaningful (asserting on outputs and side-effects) rather than implementation details?

## Security & Permissions

- Authenticate with `Account` (email/password, OAuth) and protect pages.
- Use **row-level permissions** and Teams in TablesDB; ensure users can only see rows they should.
- For nested creation, child rows inherit parent permissions unless overridden.
- Avoid client secrets in `NEXT_PUBLIC_*`; use Functions or server routes for sensitive logic.

## Upgrade notes (from collections/documents)

- **Databases → TablesDB**: collections → **tables**, documents → **rows**, attributes → **columns**
- **SDK calls**: object arguments (e.g., `tables.createRow({ ... })`, `storage.createFile({ ... })`, `functions.createExecution({ ... })`, `account.createEmailPasswordSession({ email, password })`)
- **Relationships**: define **relationship columns**; load related data with `Query.select`.

---

By adopting **Tables/Rows** and **object-argument SDK calls**, MVP-site stays aligned with the latest Appwrite APIs. Mantine provides a cohesive, accessible UI layer, while TablesDB relationships give you consistent, denormalized reads without extra client joins when you opt-in via `Query.select`.
