'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Navigation from '@/components/layout/Navigation';
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Modal,
  Paper,
  Table,
  Tabs,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { formatDisplayDateTime } from '@/lib/dateUtils';

type ConstantKind = 'sports' | 'divisions' | 'leagueScoringConfigs';

type ConstantRecord = {
  $id?: string;
  id?: string;
  name?: string;
  key?: string | null;
  $updatedAt?: string | null;
  [key: string]: unknown;
};

type ConstantsPayload = {
  sports: ConstantRecord[];
  divisions: ConstantRecord[];
  leagueScoringConfigs: ConstantRecord[];
  editableFields: Record<ConstantKind, string[]>;
  adminEmail?: string;
};

const API_KIND_BY_UI_KIND: Record<ConstantKind, string> = {
  sports: 'sports',
  divisions: 'divisions',
  leagueScoringConfigs: 'league-scoring-configs',
};

const TABLE_TITLE_BY_KIND: Record<ConstantKind, string> = {
  sports: 'Sports',
  divisions: 'Divisions',
  leagueScoringConfigs: 'League Configs',
};

const getRecordId = (record: ConstantRecord): string => (
  String(record.$id ?? record.id ?? '')
);

const getPrimaryLabel = (kind: ConstantKind, record: ConstantRecord): string => {
  if (kind === 'sports') {
    return String(record.name ?? 'Unnamed sport');
  }
  if (kind === 'divisions') {
    const name = String(record.name ?? 'Unnamed division');
    const key = typeof record.key === 'string' && record.key.trim().length > 0 ? ` (${record.key})` : '';
    return `${name}${key}`;
  }
  return String(record.id ?? record.$id ?? 'League config');
};

const getSecondaryLabel = (kind: ConstantKind, record: ConstantRecord): string => {
  if (kind === 'sports') {
    return `ID: ${getRecordId(record)}`;
  }
  if (kind === 'divisions') {
    const sportId = typeof record.sportId === 'string' ? record.sportId : 'n/a';
    return `Sport: ${sportId}`;
  }
  return `Point precision: ${String(record.pointPrecision ?? 'n/a')}`;
};

type AdminConstantsClientProps = {
  initialAdminEmail: string;
};

export default function AdminConstantsClient({ initialAdminEmail }: AdminConstantsClientProps) {
  const [constants, setConstants] = useState<ConstantsPayload>({
    sports: [],
    divisions: [],
    leagueScoringConfigs: [],
    editableFields: {
      sports: [],
      divisions: [],
      leagueScoringConfigs: [],
    },
    adminEmail: initialAdminEmail,
  });
  const [activeTab, setActiveTab] = useState<ConstantKind>('sports');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState<ConstantKind | null>(null);
  const [editingRecord, setEditingRecord] = useState<ConstantRecord | null>(null);
  const [editorValue, setEditorValue] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadConstants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/constants', {
        method: 'GET',
        credentials: 'include',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to load constants.');
      }
      setConstants({
        sports: Array.isArray(payload.sports) ? payload.sports : [],
        divisions: Array.isArray(payload.divisions) ? payload.divisions : [],
        leagueScoringConfigs: Array.isArray(payload.leagueScoringConfigs) ? payload.leagueScoringConfigs : [],
        editableFields: payload.editableFields ?? {
          sports: [],
          divisions: [],
          leagueScoringConfigs: [],
        },
        adminEmail: typeof payload.adminEmail === 'string' ? payload.adminEmail : initialAdminEmail,
      });
    } catch (loadErr) {
      const message = loadErr instanceof Error ? loadErr.message : 'Failed to load constants.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [initialAdminEmail]);

  useEffect(() => {
    void loadConstants();
  }, [loadConstants]);

  const tableRecords = constants[activeTab] ?? [];

  const openEditor = useCallback((kind: ConstantKind, record: ConstantRecord) => {
    const editableFields = constants.editableFields[kind] ?? [];
    const patchSeed = Object.fromEntries(
      editableFields.map((field) => [field, record[field] ?? null]),
    );
    setEditingKind(kind);
    setEditingRecord(record);
    setEditorValue(JSON.stringify(patchSeed, null, 2));
    setSaveError(null);
  }, [constants.editableFields]);

  const closeEditor = useCallback(() => {
    setEditingKind(null);
    setEditingRecord(null);
    setEditorValue('');
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingKind || !editingRecord) return;
    const recordId = getRecordId(editingRecord);
    if (!recordId) {
      setSaveError('Missing record id.');
      return;
    }

    let parsedPatch: unknown;
    try {
      parsedPatch = JSON.parse(editorValue);
    } catch {
      setSaveError('Patch must be valid JSON.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/admin/constants/${API_KIND_BY_UI_KIND[editingKind]}/${encodeURIComponent(recordId)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patch: parsedPatch }),
        },
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to update record.');
      }
      const updatedRecord = payload?.record as ConstantRecord | undefined;
      if (!updatedRecord) {
        throw new Error('Server did not return an updated record.');
      }

      setConstants((prev) => ({
        ...prev,
        [editingKind]: (prev[editingKind] ?? []).map((row) => (
          getRecordId(row) === getRecordId(updatedRecord) ? updatedRecord : row
        )),
      }));
      notifications.show({ color: 'green', message: 'Constant updated.' });
      closeEditor();
    } catch (saveErr) {
      setSaveError(saveErr instanceof Error ? saveErr.message : 'Failed to update record.');
    } finally {
      setSaving(false);
    }
  }, [closeEditor, editingKind, editingRecord, editorValue]);

  const modalTitle = useMemo(() => {
    if (!editingKind || !editingRecord) return 'Edit constant';
    return `Edit ${TABLE_TITLE_BY_KIND[editingKind]}: ${getPrimaryLabel(editingKind, editingRecord)}`;
  }, [editingKind, editingRecord]);

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gray-50 py-8">
        <Container size="xl">
          <Paper radius="lg" shadow="md" withBorder p="lg">
            <Group justify="space-between" align="flex-end" mb="sm">
              <div>
                <Title order={2}>Admin Constants</Title>
                <Text size="sm" c="dimmed">
                  Secure constants editor for verified Razumly administrators.
                </Text>
              </div>
              <Button variant="light" onClick={() => { void loadConstants(); }} loading={loading}>
                Refresh
              </Button>
            </Group>

            <Group gap="xs" mb="md">
              <Badge color="blue" variant="light">Admin</Badge>
              <Text size="sm" c="dimmed">Signed in as {constants.adminEmail || initialAdminEmail}</Text>
            </Group>

            {error && (
              <Alert color="red" mb="md">
                {error}
              </Alert>
            )}

            {loading ? (
              <Group justify="center" py="xl">
                <Loader />
              </Group>
            ) : (
              <Tabs value={activeTab} onChange={(value) => setActiveTab((value as ConstantKind) || 'sports')}>
                <Tabs.List mb="md">
                  <Tabs.Tab value="sports">Sports ({constants.sports.length})</Tabs.Tab>
                  <Tabs.Tab value="divisions">Divisions ({constants.divisions.length})</Tabs.Tab>
                  <Tabs.Tab value="leagueScoringConfigs">
                    League Configs ({constants.leagueScoringConfigs.length})
                  </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value={activeTab}>
                  {tableRecords.length === 0 ? (
                    <Text c="dimmed">No records found for this constant type.</Text>
                  ) : (
                    <Table striped highlightOnHover withTableBorder withColumnBorders>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Constant</Table.Th>
                          <Table.Th>Details</Table.Th>
                          <Table.Th>Updated</Table.Th>
                          <Table.Th style={{ width: 140 }}>Actions</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {tableRecords.map((record) => (
                          <Table.Tr key={getRecordId(record)}>
                            <Table.Td>{getPrimaryLabel(activeTab, record)}</Table.Td>
                            <Table.Td>{getSecondaryLabel(activeTab, record)}</Table.Td>
                            <Table.Td>{record.$updatedAt ? formatDisplayDateTime(record.$updatedAt) : 'Unknown'}</Table.Td>
                            <Table.Td>
                              <Button size="xs" variant="light" onClick={() => openEditor(activeTab, record)}>
                                Edit JSON
                              </Button>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  )}
                </Tabs.Panel>
              </Tabs>
            )}
          </Paper>
        </Container>
      </div>

      <Modal
        opened={Boolean(editingKind && editingRecord)}
        onClose={closeEditor}
        title={modalTitle}
        size="lg"
      >
        <Text size="sm" c="dimmed" mb="sm">
          Update editable fields as JSON and save.
        </Text>
        <Textarea
          value={editorValue}
          onChange={(event) => setEditorValue(event.currentTarget.value)}
          minRows={16}
          autosize
          styles={{ input: { fontFamily: 'monospace' } }}
        />
        {saveError && (
          <Alert color="red" mt="md">
            {saveError}
          </Alert>
        )}
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closeEditor} disabled={saving}>Cancel</Button>
          <Button onClick={() => { void handleSave(); }} loading={saving}>
            Save
          </Button>
        </Group>
      </Modal>
    </>
  );
}
