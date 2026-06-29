import { useEffect, useState, type ReactNode, type Ref } from 'react';
import {
  Alert,
  Button,
  Container,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';

import Navigation from '@/components/layout/Navigation';
import Loading from '@/components/ui/Loading';
import { parseLocalDateTime } from '@/lib/dateUtils';
import type { Event, Organization, UserData } from '@/types';

import EventForm, { type EventFormHandle, type EventFormProps } from '../components/EventForm';
import EventSchedulePendingChangesPopover from './EventSchedulePendingChangesPopover';
import RentalCheckoutModals, { type RentalCheckoutModalsProps } from './RentalCheckoutModals';
import type { PendingSaveChangeItem } from './helpers';
import type { TemplateRentalResourcePrompt } from './useCreateEventFlow';

type TemplateSelectItem = {
  value: string;
  label: string;
};

type CreateEventScheduleViewProps = {
  termsModal: ReactNode;
  pendingChangesOpen: boolean;
  pendingSaveChanges: PendingSaveChangeItem[];
  onPendingChangesOpenChange: (opened: boolean) => void;
  hasPendingUnsavedChanges: boolean;
  onDiscardChanges: () => void;
  publishing: boolean;
  reschedulingMatches: boolean;
  cancelling: boolean;
  createButtonLabel: string;
  cancelButtonLabel: string;
  onPublish: () => void;
  onCancel: () => void;
  submitError: string | null;
  error: string | null;
  warningMessage: string | null;
  infoMessage: string | null;
  templateRentalResourcePrompt: TemplateRentalResourcePrompt | null;
  onSubmitErrorClose: () => void;
  onErrorClose: () => void;
  onWarningMessageClose: () => void;
  onInfoMessageClose: () => void;
  onTemplateRentalResourcePromptClose: () => void;
  templatePromptOpen: boolean;
  onCloseTemplatePrompt: () => void;
  isMobile: boolean;
  applyingTemplate: boolean;
  templatesError: string | null;
  actionError: string | null;
  templatesLoading: boolean;
  templateSelectData: TemplateSelectItem[];
  selectedTemplateId: string | null;
  selectedTemplateStartDate: Date | null;
  onSelectedTemplateIdChange: (templateId: string | null) => void;
  onSelectedTemplateStartDateChange: (startDate: Date | null) => void;
  onApplyTemplate: () => void | Promise<boolean | void>;
  user: UserData | null;
  event: Event | null;
  templateSeedKey: number;
  eventFormRef: Ref<EventFormHandle>;
  onEventFormClose: () => void;
  onDirtyStateChange: (hasChanges: boolean) => void;
  organization: Organization | null;
  defaultLocation: EventFormProps['defaultLocation'];
  immutableDefaults: EventFormProps['immutableDefaults'];
  rentalPurchase: EventFormProps['rentalPurchase'];
  templateOrganizationId?: string;
  formId: string;
  rentalCheckout: RentalCheckoutModalsProps;
};

export default function CreateEventScheduleView({
  termsModal,
  pendingChangesOpen,
  pendingSaveChanges,
  onPendingChangesOpenChange,
  hasPendingUnsavedChanges,
  onDiscardChanges,
  publishing,
  reschedulingMatches,
  cancelling,
  createButtonLabel,
  cancelButtonLabel,
  onPublish,
  onCancel,
  submitError,
  error,
  warningMessage,
  infoMessage,
  templateRentalResourcePrompt,
  onSubmitErrorClose,
  onErrorClose,
  onWarningMessageClose,
  onInfoMessageClose,
  onTemplateRentalResourcePromptClose,
  templatePromptOpen,
  onCloseTemplatePrompt,
  isMobile,
  applyingTemplate,
  templatesError,
  actionError,
  templatesLoading,
  templateSelectData,
  selectedTemplateId,
  selectedTemplateStartDate,
  onSelectedTemplateIdChange,
  onSelectedTemplateStartDateChange,
  onApplyTemplate,
  user,
  event,
  templateSeedKey,
  eventFormRef,
  onEventFormClose,
  onDirtyStateChange,
  organization,
  defaultLocation,
  immutableDefaults,
  rentalPurchase,
  templateOrganizationId,
  formId,
  rentalCheckout,
}: CreateEventScheduleViewProps) {
  const [directTemplateId, setDirectTemplateId] = useState<string | null>(null);
  const [dismissedDirectTemplateId, setDismissedDirectTemplateId] = useState<string | null>(null);
  useEffect(() => {
    const nextTemplateId = new URLSearchParams(window.location.search).get('templateId')?.trim() || null;
    setDirectTemplateId(nextTemplateId);
    setDismissedDirectTemplateId((current) => (
      current && current !== nextTemplateId ? null : current
    ));
  }, []);
  useEffect(() => {
    if (directTemplateId && !selectedTemplateId) {
      onSelectedTemplateIdChange(directTemplateId);
    }
  }, [directTemplateId, onSelectedTemplateIdChange, selectedTemplateId]);
  const effectiveTemplatePromptOpen = templatePromptOpen || Boolean(
    directTemplateId && dismissedDirectTemplateId !== directTemplateId,
  );
  const handleCloseTemplatePrompt = () => {
    if (directTemplateId) {
      setDismissedDirectTemplateId(directTemplateId);
    }
    onCloseTemplatePrompt();
  };
  const handleApplyTemplate = async () => {
    const applied = await onApplyTemplate();
    if (applied !== false && directTemplateId) {
      setDismissedDirectTemplateId(directTemplateId);
    }
  };
  return (
    <>
      <Navigation />
      {termsModal}
      <Container fluid py="xl">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={2}>Create Event</Title>
            <Group gap="sm">
              <EventSchedulePendingChangesPopover
                opened={pendingChangesOpen}
                changes={pendingSaveChanges}
                onOpenedChange={onPendingChangesOpenChange}
              />
              {hasPendingUnsavedChanges && (
                <Button
                  variant="default"
                  onClick={onDiscardChanges}
                  disabled={publishing || reschedulingMatches || cancelling}
                >
                  Discard Changes
                </Button>
              )}
              <Button
                color="green"
                onClick={onPublish}
                loading={publishing}
                disabled={reschedulingMatches || cancelling}
              >
                {createButtonLabel}
              </Button>
              <Button
                variant="default"
                onClick={onCancel}
                loading={cancelling}
                disabled={publishing || reschedulingMatches}
              >
                {cancelButtonLabel}
              </Button>
            </Group>
          </Group>

          {directTemplateId && dismissedDirectTemplateId !== directTemplateId && (
            <Alert color="blue" radius="md" title="Start from template">
              <Stack gap="sm">
                <Text size="sm">
                  Choose the new event start date before applying this template.
                </Text>
                <Group align="end" gap="sm" wrap="wrap">
                  <Select
                    label="Template"
                    placeholder={templatesLoading ? 'Loading templates...' : 'Select a template'}
                    data={templateSelectData.length > 0 ? templateSelectData : [{ value: directTemplateId, label: 'Selected template' }]}
                    value={selectedTemplateId ?? directTemplateId}
                    onChange={onSelectedTemplateIdChange}
                    searchable
                    disabled={templatesLoading || applyingTemplate}
                    nothingFoundMessage="No templates found"
                    style={{ minWidth: 240 }}
                  />
                  <DatePickerInput
                    label="New event start date"
                    valueFormat="MM/DD/YYYY"
                    value={selectedTemplateStartDate}
                    onChange={(value) => onSelectedTemplateStartDateChange(parseLocalDateTime(value))}
                    minDate={new Date()}
                    disabled={applyingTemplate}
                    style={{ minWidth: 220 }}
                  />
                  <Button
                    onClick={handleApplyTemplate}
                    loading={applyingTemplate}
                    disabled={!(selectedTemplateId ?? directTemplateId) || !selectedTemplateStartDate}
                  >
                    Use Template
                  </Button>
                  <Button
                    variant="default"
                    onClick={handleCloseTemplatePrompt}
                    disabled={applyingTemplate}
                  >
                    Start Blank
                  </Button>
                </Group>
              </Stack>
            </Alert>
          )}

          {submitError && (
            <Alert color="red" radius="md" onClose={onSubmitErrorClose} withCloseButton>
              {submitError}
            </Alert>
          )}
          {error && (
            <Alert color="red" radius="md" onClose={onErrorClose} withCloseButton>
              {error}
            </Alert>
          )}
          {warningMessage && (
            <Alert color="yellow" radius="md" onClose={onWarningMessageClose} withCloseButton>
              {warningMessage}
            </Alert>
          )}
          {infoMessage && (
            <Alert color="green" radius="md" onClose={onInfoMessageClose} withCloseButton>
              {infoMessage}
            </Alert>
          )}
          {templateRentalResourcePrompt && (
            <Alert color="blue" radius="md" onClose={onTemplateRentalResourcePromptClose} withCloseButton>
              <Group justify="space-between" align="center" gap="sm">
                <Text size="sm">{templateRentalResourcePrompt.message}</Text>
                {templateRentalResourcePrompt.href && (
                  <Button
                    component="a"
                    href={templateRentalResourcePrompt.href}
                    size="xs"
                    variant="light"
                  >
                    Open Rentals
                  </Button>
                )}
              </Group>
            </Alert>
          )}

          <Modal
            opened={effectiveTemplatePromptOpen}
            onClose={handleCloseTemplatePrompt}
            title="Start from a template?"
            centered
            size="lg"
            fullScreen={isMobile}
            closeOnClickOutside={!applyingTemplate}
            closeOnEscape={!applyingTemplate}
            withCloseButton={!applyingTemplate}
          >
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                Pick a template to prefill this event. Matches are not copied; event settings and time slots are.
              </Text>
              {templatesError && (
                <Alert color="red" radius="md">
                  {templatesError}
                </Alert>
              )}
              {actionError && (
                <Alert color="red" radius="md">
                  {actionError}
                </Alert>
              )}
              <Select
                label="Template"
                placeholder={templatesLoading ? 'Loading templates...' : 'Select a template'}
                data={templateSelectData}
                value={selectedTemplateId}
                onChange={onSelectedTemplateIdChange}
                searchable
                clearable
                disabled={templatesLoading || applyingTemplate}
                nothingFoundMessage="No templates found"
              />
              <DatePickerInput
                label="New event start date"
                valueFormat="MM/DD/YYYY"
                value={selectedTemplateStartDate}
                onChange={(value) => onSelectedTemplateStartDateChange(parseLocalDateTime(value))}
                minDate={new Date()}
                disabled={applyingTemplate}
              />
              <Group justify="space-between" mt="md">
                <Button
                  variant="default"
                  onClick={handleCloseTemplatePrompt}
                  disabled={applyingTemplate}
                >
                  Start Blank
                </Button>
                <Button
                  onClick={handleApplyTemplate}
                  loading={applyingTemplate}
                  disabled={!selectedTemplateId || !selectedTemplateStartDate}
                >
                  Use Template
                </Button>
              </Group>
            </Stack>
          </Modal>

          {user && event ? (
            <EventForm
              key={`create-event-form-${templateSeedKey}`}
              ref={eventFormRef}
              isOpen
              onClose={onEventFormClose}
              onDirtyStateChange={onDirtyStateChange}
              currentUser={user}
              organization={organization}
              defaultLocation={defaultLocation}
              immutableDefaults={immutableDefaults}
              rentalPurchase={rentalPurchase}
              templateOrganizationId={templateOrganizationId}
              event={event}
              formId={formId}
              isCreateMode
            />
          ) : (
            <Loading text="Loading user..." />
          )}
        </Stack>
      </Container>
      <RentalCheckoutModals {...rentalCheckout} />
    </>
  );
}
