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
  teamIds: string[];        // persisted IDs (hydrate manually)
  teams?: Team[];           // hydrated in services
  friendIds: string[];      // persisted IDs for social graph
  friends?: UserData[];     // hydrated in services
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
  playerIds: string[];      // persisted IDs
  players?: UserData[];     // hydrated in services
  captainId?: string | null;
  captain?: UserData | null;
  pending: string[];        // persisted invite IDs
  pendingPlayers?: UserData[];
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

> **Tip**: Persist ID arrays (`playerIds`, `teamIds`, `friendIds`) and let service modules hydrate them on demand. This keeps writes simple and makes it obvious which additional reads are required.

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

## TablesDB — ID-centric modeling

We no longer rely on Appwrite relationship columns. Every association is stored explicitly through string ID columns (for example `sportId`, `teamIds`, `fieldIds`). Service modules must hydrate these IDs into full domain models before returning data to UI components.

### Modeling rules

- Keep schema aligned with `/database/appwrite.config.json`; add `<name>Id` or `<name>Ids` columns for each link.
- Persist raw string IDs when creating or updating rows. Do not send nested objects to TablesDB APIs.
- Hydrate inside service modules by fetching the base row first, then issuing follow-up `getRow`/`listRows` calls using `Query.equal('$id', ids)` (chunk to ≤100) or `Query.contains('fieldIds', someId)` for array membership.
- Throw when a referenced ID cannot be resolved so data issues surface early.
- Cache selectively (for example sports metadata) to avoid redundant reads.

### Hydration pattern

```ts
import { databases, Query } from '@/app/appwrite';

async function listByIds(tableId: string, ids: string[]) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return [];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += 100) {
    batches.push(unique.slice(i, i + 100));
  }
  const responses = await Promise.all(
    batches.map(batch =>
      databases.listRows({
        databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
        tableId,
        queries: [Query.equal('$id', batch)],
      })
    ),
  );
  return responses.flatMap(res => res.rows ?? []);
}

export async function getEvent(eventId: string) {
  const base = await databases.getRow({
    databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
    tableId: process.env.NEXT_PUBLIC_APPWRITE_EVENTS_TABLE_ID!,
    rowId: eventId,
  });

  const event = mapRowToEvent(base); // converts primitives, enums, coordinates

  const [teams, matches, fields] = await Promise.all([
    listByIds(process.env.NEXT_PUBLIC_APPWRITE_TEAMS_TABLE_ID!, event.teamIds ?? []),
    databases.listRows({
      databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
      tableId: process.env.NEXT_PUBLIC_MATCHES_TABLE_ID!,
      queries: [Query.equal('eventId', event.$id)],
    }).then(res => res.rows ?? []),
    listByIds(process.env.NEXT_PUBLIC_APPWRITE_FIELDS_TABLE_ID!, event.fieldIds ?? []),
  ]);

  const teamsById = new Map(teams.map(row => [row.$id, mapRowToTeam(row)]));
  const fieldsById = new Map(fields.map(row => [row.$id, mapRowToField(row)]));

  event.teams = [...teamsById.values()];
  event.matches = matches.map(row => {
    const match = mapRowToMatch(row);
    match.team1 = match.team1Id ? teamsById.get(match.team1Id) : undefined;
    match.team2 = match.team2Id ? teamsById.get(match.team2Id) : undefined;
    match.field = match.fieldId ? fieldsById.get(match.fieldId) : undefined;
    return match;
  });
  event.fields = [...fieldsById.values()];

  return event;
}
```

### Query helpers

- `Query.equal('$id', ids)` – fetch rows whose primary key is in `ids`.
- `Query.contains('teamIds', [teamId])` – array membership when performing reverse lookups.
- `Query.greaterThanEqual('end', startIso)` / `Query.lessThanEqual('start', endIso)` – date windows.

### Testing expectations

- Service tests mock Appwrite responses and assert that hydration issues follow-up queries for every referenced ID.
- Regression tests must ensure missing IDs surface as thrown errors rather than silent omissions.
- UI-level tests continue to rely on fully hydrated domain objects; keep the runtime shape identical to `src/types/index.ts`.

> **Reminder:** The persistence layer now saves IDs only. Any time the UI or downstream service needs related data, load it explicitly in the service layer before returning.

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
// src/app/discover/components/__tests__/LeagueFields.test.tsx
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
