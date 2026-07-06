import { Fragment, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
} from '@mantine/core';

import { formatBillPaidInFullSummary, formatBillPaidProgress, formatBillTotalBreakdown } from '@/lib/billDisplay';
import type { TeamComplianceSummary } from '@/lib/eventTeamCompliance';

type EventComplianceModalProps = {
  opened: boolean;
  fullScreen: boolean;
  teamName?: string | null;
  summary: TeamComplianceSummary | null;
  loading: boolean;
  onClose: () => void;
};

function formatCompliancePaymentLabel(payment: TeamComplianceSummary['payment']) {
  if (!payment.hasBill) {
    return 'No bill';
  }
  const status = String(payment.status ?? '').toUpperCase();
  if (status === 'DISPUTED') {
    return 'Payment disputed';
  }
  if (status === 'FAILED') {
    return 'Payment failed';
  }
  if (payment.manualPaymentProofStatus === 'SUBMITTED') {
    return `Payment proof submitted (${formatBillTotalBreakdown(payment)})`;
  }
  if (payment.manualPaymentProofStatus === 'ACCEPTED') {
    return `Payment proof accepted (${formatBillPaidProgress(payment) ?? formatBillTotalBreakdown(payment)})`;
  }
  if (status === 'PENDING') {
    const prefix = payment.inheritedFromTeamBill ? 'Team bill' : 'User bill';
    return `${prefix} pending (${formatBillTotalBreakdown(payment)})`;
  }
  if (status === 'PROCESSING') {
    return `Payment processing (${formatBillTotalBreakdown(payment)})`;
  }
  if (payment.isPaidInFull) {
    return formatBillPaidInFullSummary(payment);
  }
  const prefix = payment.inheritedFromTeamBill ? 'Team bill' : 'User bill';
  return `${prefix}: ${formatBillPaidProgress(payment) ?? formatBillTotalBreakdown(payment)}`;
}

export default function EventComplianceModal({
  opened,
  fullScreen,
  teamName,
  summary,
  loading,
  onClose,
}: EventComplianceModalProps) {
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);

  useEffect(() => {
    setExpandedUserIds([]);
  }, [opened, summary?.teamId]);

  const title = `${teamName || summary?.teamName || 'Team'} users`;

  const toggleUserExpanded = (userId: string) => {
    setExpandedUserIds((current) => (
      current.includes(userId)
        ? current.filter((value) => value !== userId)
        : [...current, userId]
    ));
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size="xl"
      centered
      fullScreen={fullScreen}
    >
      <Stack gap="md">
        {summary ? (
          <>
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <Stack gap={2}>
                <Text size="sm" c="dimmed">Payment</Text>
                <Text size="sm">{formatCompliancePaymentLabel(summary.payment)}</Text>
              </Stack>
              <Stack gap={2}>
                <Text size="sm" c="dimmed">Required signatures</Text>
                <Text size="sm">
                  {summary.documents.signedCount}/{summary.documents.requiredCount} complete
                </Text>
              </Stack>
            </Group>
            {(summary.registrationAnswers ?? []).length > 0 ? (
              <Paper withBorder radius="md" p="sm">
                <Stack gap={6}>
                  <Text size="sm" fw={600}>Registration answers</Text>
                  {(summary.registrationAnswers ?? []).map((answer) => (
                    <div key={answer.questionId}>
                      <Text size="xs" c="dimmed">{answer.prompt}</Text>
                      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                        {answer.answer || 'No answer'}
                      </Text>
                    </div>
                  ))}
                </Stack>
              </Paper>
            ) : null}

            {summary.users.length === 0 ? (
              <Paper withBorder radius="md" p="md">
                <Text size="sm" c="dimmed">No users were found on this team.</Text>
              </Paper>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <Table withTableBorder withColumnBorders highlightOnHover miw={760}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>User</Table.Th>
                      <Table.Th>Payment</Table.Th>
                      <Table.Th>Documents</Table.Th>
                      <Table.Th style={{ width: 120 }}>Details</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {summary.users.map((userSummary) => {
                      const expanded = expandedUserIds.includes(userSummary.userId);
                      return (
                        <Fragment key={userSummary.userId}>
                          <Table.Tr>
                            <Table.Td>
                              <Text fw={600}>{userSummary.fullName}</Text>
                              {userSummary.userName ? (
                                <Text size="xs" c="dimmed">@{userSummary.userName}</Text>
                              ) : null}
                              <Text size="xs" c="dimmed">
                                {userSummary.registrationType === 'CHILD'
                                  ? 'Child registration'
                                  : 'Adult registration'}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm">{formatCompliancePaymentLabel(userSummary.payment)}</Text>
                            </Table.Td>
                            <Table.Td>
                              {userSummary.documents.requiredCount === 0 ? (
                                <Text size="xs" c="dimmed">No required documents</Text>
                              ) : (
                                <Text size="sm">
                                  {userSummary.documents.signedCount}/{userSummary.documents.requiredCount} signed
                                </Text>
                              )}
                            </Table.Td>
                            <Table.Td>
                              <Button
                                size="xs"
                                variant="light"
                                onClick={() => toggleUserExpanded(userSummary.userId)}
                              >
                                {expanded ? 'Collapse' : 'Expand'}
                              </Button>
                            </Table.Td>
                          </Table.Tr>
                          {expanded && (
                            <Table.Tr>
                              <Table.Td colSpan={4}>
                                <Stack gap="sm">
                                  {userSummary.requiredDocuments.length === 0 ? (
                                    <Text size="xs" c="dimmed">No required documents for this user.</Text>
                                  ) : (
                                    <Stack gap={6}>
                                      {userSummary.requiredDocuments.map((document) => (
                                        <Group key={document.key} justify="space-between" align="center" wrap="wrap">
                                          <Stack gap={0}>
                                            <Text size="sm">{document.title}</Text>
                                            <Text size="xs" c="dimmed">
                                              {document.signerLabel}
                                              {document.signOnce ? ' \u2022 Sign once' : ' \u2022 Event-specific'}
                                            </Text>
                                          </Stack>
                                          <Group gap={6}>
                                            {document.signedAt ? (
                                              <Text size="xs" c="dimmed">
                                                {new Date(document.signedAt).toLocaleString()}
                                              </Text>
                                            ) : null}
                                            <Badge
                                              size="sm"
                                              color={document.status === 'SIGNED' ? 'green' : 'yellow'}
                                              variant="light"
                                            >
                                              {document.status === 'SIGNED' ? 'Signed' : 'Needs signature'}
                                            </Badge>
                                          </Group>
                                        </Group>
                                      ))}
                                    </Stack>
                                  )}
                                  {(userSummary.registrationAnswers ?? []).length > 0 ? (
                                    <Stack gap={6}>
                                      <Text size="sm" fw={600}>Registration answers</Text>
                                      {(userSummary.registrationAnswers ?? []).map((answer) => (
                                        <div key={answer.questionId} className="rounded-md border border-gray-200 p-2">
                                          <Text size="xs" c="dimmed">{answer.prompt}</Text>
                                          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                                            {answer.answer || 'No answer'}
                                          </Text>
                                        </div>
                                      ))}
                                    </Stack>
                                  ) : (
                                    <Text size="xs" c="dimmed">No registration answers submitted.</Text>
                                  )}
                                </Stack>
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </div>
            )}
          </>
        ) : loading ? (
          <Paper withBorder radius="md" p="md">
            <Group justify="center" gap="sm">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">Loading team users...</Text>
            </Group>
          </Paper>
        ) : (
          <Paper withBorder radius="md" p="md">
            <Text size="sm" c="dimmed">
              Team compliance details are not available yet.
            </Text>
          </Paper>
        )}
      </Stack>
    </Modal>
  );
}
