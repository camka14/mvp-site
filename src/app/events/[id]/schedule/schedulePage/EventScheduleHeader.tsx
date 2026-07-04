import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Select,
  Title,
} from '@mantine/core';
import { Megaphone, QrCode } from 'lucide-react';

import { EventQrCodeModal, buildEventPublicUrl } from '@/components/events/EventQrCodeModal';

import EventSchedulePendingChangesPopover from './EventSchedulePendingChangesPopover';
import {
  EVENT_LIFECYCLE_OPTIONS,
  type EventLifecycleStatus,
  type PendingSaveChangeItem,
} from './helpers';
import type { TemplateRentalResourcePrompt } from './useCreateEventFlow';

type EventScheduleHeaderProps = {
  eventId: string;
  eventName: string;
  organizationLogoId?: string | null;
  selectedOccurrenceLabel?: string | null;
  onClearSelectedOccurrence: () => void;
  showNotificationAction: boolean;
  onOpenNotification: () => void;
  showReportAction: boolean;
  reportingEvent: boolean;
  onReportEvent: () => void;
  showEditAction: boolean;
  onEnterEditMode: () => void;
  showQrCodeAction: boolean;
  qrCodeOpen: boolean;
  onOpenQrCode: () => void;
  onCloseQrCode: () => void;
  showEditingActions: boolean;
  pendingChangesOpen: boolean;
  pendingSaveChanges: PendingSaveChangeItem[];
  onPendingChangesOpenChange: (opened: boolean) => void;
  showDiscardChanges: boolean;
  onDiscardChanges: () => void;
  showLifecycleStatusSelect: boolean;
  selectedLifecycleStatus: EventLifecycleStatus | null;
  activeLifecycleStatus: EventLifecycleStatus;
  onLifecycleStatusChange: (value: string | null) => void;
  showSaveAction: boolean;
  createButtonLabel: string;
  isCreateMode: boolean;
  onSave: () => void;
  publishing: boolean;
  hasNetworkActionInFlight: boolean;
  hasPendingUnsavedChanges: boolean;
  hasSplitDivisionUnassignedTeams: boolean;
  showMoreActions: boolean;
  showRescheduleAction: boolean;
  isRescheduleActionInFlight: boolean;
  onRescheduleMatches: () => void;
  showBuildBracketsAction: boolean;
  isRebuildActionInFlight: boolean;
  onBuildBrackets: () => void;
  showRebuildWithoutPlaceholdersAction: boolean;
  isRebuildWithoutPlaceholdersActionInFlight: boolean;
  onRebuildWithoutPlaceholders: () => void;
  showCancelAction: boolean;
  cancelling: boolean;
  cancelButtonLabel: string;
  onCancel: () => void;
  showDeleteTemplateAction: boolean;
  onDeleteTemplate: () => void;
  showDeleteEventAction: boolean;
  onDeleteEvent: () => void;
  showCreateTemplateAction: boolean;
  creatingTemplate: boolean;
  onCreateTemplate: () => void;
  infoMessage: string | null;
  onInfoMessageClose: () => void;
  submitError: string | null;
  onSubmitErrorClose: () => void;
  error: string | null;
  onErrorClose: () => void;
  visibleMatchConflictMessage: string | null;
  onMatchConflictMessageClose: () => void;
  warningMessage: string | null;
  onWarningMessageClose: () => void;
  templateRentalResourcePrompt: TemplateRentalResourcePrompt | null;
  onTemplateRentalResourcePromptClose: () => void;
  showSplitDivisionWarning: boolean;
  unassignedTeamLabels: string[];
  actionError: string | null;
  onActionErrorClose: () => void;
};

export default function EventScheduleHeader({
  eventId,
  eventName,
  organizationLogoId,
  selectedOccurrenceLabel,
  onClearSelectedOccurrence,
  showNotificationAction,
  onOpenNotification,
  showReportAction,
  reportingEvent,
  onReportEvent,
  showEditAction,
  onEnterEditMode,
  showQrCodeAction,
  qrCodeOpen,
  onOpenQrCode,
  onCloseQrCode,
  showEditingActions,
  pendingChangesOpen,
  pendingSaveChanges,
  onPendingChangesOpenChange,
  showDiscardChanges,
  onDiscardChanges,
  showLifecycleStatusSelect,
  selectedLifecycleStatus,
  activeLifecycleStatus,
  onLifecycleStatusChange,
  showSaveAction,
  createButtonLabel,
  isCreateMode,
  onSave,
  publishing,
  hasNetworkActionInFlight,
  hasPendingUnsavedChanges,
  hasSplitDivisionUnassignedTeams,
  showMoreActions,
  showRescheduleAction,
  isRescheduleActionInFlight,
  onRescheduleMatches,
  showBuildBracketsAction,
  isRebuildActionInFlight,
  onBuildBrackets,
  showRebuildWithoutPlaceholdersAction,
  isRebuildWithoutPlaceholdersActionInFlight,
  onRebuildWithoutPlaceholders,
  showCancelAction,
  cancelling,
  cancelButtonLabel,
  onCancel,
  showDeleteTemplateAction,
  onDeleteTemplate,
  showDeleteEventAction,
  onDeleteEvent,
  showCreateTemplateAction,
  creatingTemplate,
  onCreateTemplate,
  infoMessage,
  onInfoMessageClose,
  submitError,
  onSubmitErrorClose,
  error,
  onErrorClose,
  visibleMatchConflictMessage,
  onMatchConflictMessageClose,
  warningMessage,
  onWarningMessageClose,
  templateRentalResourcePrompt,
  onTemplateRentalResourcePromptClose,
  showSplitDivisionWarning,
  unassignedTeamLabels,
  actionError,
  onActionErrorClose,
}: EventScheduleHeaderProps) {
  const showActions = showReportAction || showNotificationAction || showEditAction || showQrCodeAction || showEditingActions || showMoreActions;
  const showActionButtons = showReportAction || showEditAction || showQrCodeAction || showEditingActions || showMoreActions;

  return (
    <>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Title order={2} mb={0} className="min-w-0 max-w-full break-words">{eventName}</Title>
            {selectedOccurrenceLabel && (
              <Badge
                variant="light"
                color="red"
                rightSection={(
                  <ActionIcon
                    variant="transparent"
                    color="red"
                    size="xs"
                    aria-label="Clear selected session"
                    onClick={onClearSelectedOccurrence}
                  >
                    ×
                  </ActionIcon>
                )}
              >
                {selectedOccurrenceLabel}
              </Badge>
            )}
          </div>
        </div>

        {showActions && (
          <div className="ml-auto flex shrink-0 flex-wrap items-start justify-end gap-2">
            {showNotificationAction && (
              <ActionIcon
                variant="subtle"
                size="lg"
                onClick={onOpenNotification}
                aria-label="Send notification"
                title="Send notification"
              >
                <Megaphone size={18} />
              </ActionIcon>
            )}

            {showActionButtons && (
              <Group gap="sm" wrap="wrap" justify="flex-end">
                {showReportAction && (
                  <Button
                    variant="light"
                    color="red"
                    onClick={onReportEvent}
                    loading={reportingEvent}
                  >
                    Report Event
                  </Button>
                )}
                {showEditAction && (
                  <Button onClick={onEnterEditMode} disabled={hasNetworkActionInFlight}>
                    Manage
                  </Button>
                )}
                {showQrCodeAction && (
                  <Button
                    variant="default"
                    leftSection={<QrCode size={16} />}
                    onClick={onOpenQrCode}
                  >
                    QR Code
                  </Button>
                )}
                {showEditingActions && (
                  <>
                    <EventSchedulePendingChangesPopover
                      opened={pendingChangesOpen}
                      changes={pendingSaveChanges}
                      onOpenedChange={onPendingChangesOpenChange}
                    />
                    {showDiscardChanges && (
                      <Button
                        variant="default"
                        onClick={onDiscardChanges}
                        disabled={hasNetworkActionInFlight}
                      >
                        Discard Changes
                      </Button>
                    )}
                    {showLifecycleStatusSelect && (
                      <Select
                        data={EVENT_LIFECYCLE_OPTIONS}
                        value={selectedLifecycleStatus ?? activeLifecycleStatus}
                        onChange={onLifecycleStatusChange}
                        allowDeselect={false}
                        w={160}
                        disabled={hasNetworkActionInFlight}
                      />
                    )}
                    {showSaveAction && (
                      <Button
                        color="green"
                        onClick={onSave}
                        loading={publishing}
                        disabled={
                          (hasNetworkActionInFlight && !publishing)
                          || (!isCreateMode && !hasPendingUnsavedChanges)
                          || hasSplitDivisionUnassignedTeams
                        }
                      >
                        {isCreateMode ? createButtonLabel : 'Save'}
                      </Button>
                    )}
                  </>
                )}
                {showMoreActions && (
                  <Menu shadow="md" width={280} position="bottom-end">
                    <Menu.Target>
                      <Button variant="default">More</Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {showRescheduleAction && (
                        <Menu.Item
                          onClick={onRescheduleMatches}
                          disabled={
                            (hasNetworkActionInFlight && !isRescheduleActionInFlight)
                            || hasSplitDivisionUnassignedTeams
                          }
                        >
                          {isRescheduleActionInFlight ? 'Rescheduling...' : 'Reschedule'}
                        </Menu.Item>
                      )}
                      {showBuildBracketsAction && (
                        <Menu.Item
                          color="orange"
                          onClick={onBuildBrackets}
                          disabled={
                            (hasNetworkActionInFlight && !isRebuildActionInFlight)
                            || hasSplitDivisionUnassignedTeams
                          }
                        >
                          {isRebuildActionInFlight ? 'Rebuilding...' : 'Rebuild'}
                        </Menu.Item>
                      )}
                      {showRebuildWithoutPlaceholdersAction && (
                        <Menu.Item
                          color="orange"
                          onClick={onRebuildWithoutPlaceholders}
                          disabled={
                            (hasNetworkActionInFlight && !isRebuildWithoutPlaceholdersActionInFlight)
                            || hasSplitDivisionUnassignedTeams
                          }
                        >
                          {isRebuildWithoutPlaceholdersActionInFlight
                            ? 'Rebuilding without placeholders...'
                            : 'Rebuild Without Placeholders'}
                        </Menu.Item>
                      )}
                      {showCancelAction && (
                        <Menu.Item
                          color="red"
                          onClick={onCancel}
                          disabled={hasNetworkActionInFlight && !cancelling}
                        >
                          {cancelling ? 'Cancelling...' : cancelButtonLabel}
                        </Menu.Item>
                      )}
                      {showDeleteTemplateAction && (
                        <Menu.Item
                          color="red"
                          onClick={onDeleteTemplate}
                          disabled={hasNetworkActionInFlight && !cancelling}
                        >
                          {cancelling ? 'Deleting...' : 'Delete'}
                        </Menu.Item>
                      )}
                      {showDeleteEventAction && (
                        <Menu.Item
                          color="red"
                          onClick={onDeleteEvent}
                          disabled={hasNetworkActionInFlight && !cancelling}
                        >
                          {cancelling ? 'Deleting...' : 'Delete Event'}
                        </Menu.Item>
                      )}
                      {showCreateTemplateAction && (
                        <Menu.Item
                          onClick={onCreateTemplate}
                          disabled={hasNetworkActionInFlight && !creatingTemplate}
                        >
                          {creatingTemplate ? 'Creating Template...' : 'Create Template'}
                        </Menu.Item>
                      )}
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Group>
            )}
          </div>
        )}
      </div>

      {showQrCodeAction && (
        <EventQrCodeModal
          eventId={eventId}
          eventName={eventName || 'Event'}
          eventUrl={buildEventPublicUrl(eventId)}
          organizationLogoId={organizationLogoId ?? null}
          opened={qrCodeOpen}
          onClose={onCloseQrCode}
        />
      )}

      {infoMessage && (
        <Alert color="green" radius="md" onClose={onInfoMessageClose} withCloseButton>
          {infoMessage}
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

      {visibleMatchConflictMessage && (
        <Alert
          color="yellow"
          radius="md"
          withCloseButton
          onClose={onMatchConflictMessageClose}
        >
          {visibleMatchConflictMessage}
        </Alert>
      )}

      {warningMessage && (
        <Alert color="yellow" radius="md" onClose={onWarningMessageClose} withCloseButton>
          {warningMessage}
        </Alert>
      )}

      {templateRentalResourcePrompt && (
        <Alert color="blue" radius="md" onClose={onTemplateRentalResourcePromptClose} withCloseButton>
          <Group justify="space-between" align="center" gap="sm">
            <span>{templateRentalResourcePrompt.message}</span>
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

      {showSplitDivisionWarning && (
        <Alert color="yellow" radius="md">
          Split-division leagues require every registered team to be assigned to a division before saving or rescheduling.
          Unassigned teams: {unassignedTeamLabels.join(', ')}.
        </Alert>
      )}

      {actionError && (
        <Alert color="red" radius="md" onClose={onActionErrorClose} withCloseButton>
          {actionError}
        </Alert>
      )}
    </>
  );
}
