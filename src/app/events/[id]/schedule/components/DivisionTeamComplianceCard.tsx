import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import type { Team } from '@/types';
import { formatBillPaidInFullSummary, formatBillPaidProgress, formatBillTotalBreakdown } from '@/lib/billDisplay';
import type { TeamComplianceSummary } from '@/lib/eventTeamCompliance';

type DivisionTeamComplianceCardProps = {
  team: Team;
  summary?: TeamComplianceSummary;
  loading?: boolean;
  showComplianceDetails?: boolean;
  showTeamMetadata?: boolean;
  cardKind?: 'team' | 'participant';
  className?: string;
  fullWidth?: boolean;
  actions?: React.ReactNode;
  onClick?: () => void;
};

const getPaymentLabel = (
  summary?: TeamComplianceSummary,
  cardKind: 'team' | 'participant' = 'team',
): { label: string; color: string } => {
  if (!summary) {
    return { label: 'Payment details unavailable', color: 'gray' };
  }

  if (!summary.payment.hasBill) {
    if (summary.payment.paymentPending) {
      return { label: 'Payment pending', color: 'yellow' };
    }
    return { label: cardKind === 'participant' ? 'No bill yet' : 'No team bill yet', color: 'gray' };
  }

  const paymentStatus = String(summary.payment.status ?? '').toUpperCase();
  if (paymentStatus === 'DISPUTED') {
    return { label: 'Payment disputed', color: 'red' };
  }
  if (paymentStatus === 'FAILED') {
    return { label: 'Payment failed', color: 'red' };
  }
  if (summary.payment.manualPaymentProofStatus === 'SUBMITTED') {
    return {
      label: `Payment proof submitted (${formatBillTotalBreakdown(summary.payment)})`,
      color: 'yellow',
    };
  }
  if (summary.payment.manualPaymentProofStatus === 'ACCEPTED') {
    return {
      label: `Payment proof accepted (${formatBillPaidProgress(summary.payment) ?? formatBillTotalBreakdown(summary.payment)})`,
      color: summary.payment.isPaidInFull ? 'green' : 'yellow',
    };
  }
  if (paymentStatus === 'PENDING') {
    return { label: `Bill pending (${formatBillTotalBreakdown(summary.payment)})`, color: 'yellow' };
  }
  if (paymentStatus === 'PROCESSING') {
    return { label: `Payment processing (${formatBillTotalBreakdown(summary.payment)})`, color: 'yellow' };
  }

  if (summary.payment.isPaidInFull) {
    return { label: formatBillPaidInFullSummary(summary.payment), color: 'green' };
  }

  return {
    label: formatBillPaidProgress(summary.payment) ?? formatBillTotalBreakdown(summary.payment),
    color: 'yellow',
  };
};

const getDocumentLabel = (summary?: TeamComplianceSummary): { label: string; color: string } => {
  if (!summary) {
    return { label: 'Documents unavailable', color: 'gray' };
  }

  if (!summary.documents.requiredCount) {
    return { label: 'No required documents', color: 'gray' };
  }

  if (summary.documents.signedCount >= summary.documents.requiredCount) {
    return {
      label: `${summary.documents.signedCount}/${summary.documents.requiredCount} signatures complete`,
      color: 'green',
    };
  }

  return {
    label: `${summary.documents.signedCount}/${summary.documents.requiredCount} signatures complete`,
    color: 'yellow',
  };
};

export default function DivisionTeamComplianceCard({
  team,
  summary,
  loading = false,
  showComplianceDetails = true,
  showTeamMetadata = true,
  cardKind = 'team',
  className = '',
  fullWidth = false,
  actions,
  onClick,
}: DivisionTeamComplianceCardProps) {
  const payment = getPaymentLabel(summary, cardKind);
  const documents = getDocumentLabel(summary);
  const participantAnswers = cardKind === 'participant'
    ? summary?.users?.[0]?.registrationAnswers ?? []
    : [];

  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      className={className}
      data-testid="division-team-compliance-card"
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        width: fullWidth ? '100%' : 'fit-content',
        maxWidth: '100%',
      }}
    >
      <Stack gap="sm">
        <Stack gap={6}>
          <Text fw={600} size="md" truncate>{team.name || (cardKind === 'participant' ? 'Unnamed Participant' : 'Unnamed Team')}</Text>
          <Group gap={6}>
            {showTeamMetadata && team.sport ? <Badge variant="outline" color="gray" size="sm">{team.sport}</Badge> : null}
            {loading && showComplianceDetails ? <Badge variant="light" color="gray" size="sm">Loading</Badge> : null}
          </Group>
          {showComplianceDetails ? (
            <>
              <Text size="sm" c={payment.color}>{payment.label}</Text>
              <Text size="sm" c={documents.color}>{documents.label}</Text>
              {cardKind === 'team' && summary?.users?.length ? (
                <Text size="xs" c="dimmed">
                  {summary.users.length === 1 ? '1 rostered user' : `${summary.users.length} rostered users`}
                </Text>
              ) : null}
              {participantAnswers.length > 0 ? (
                <Stack gap={4} mt={4}>
                  <Text size="xs" fw={600}>Registration answers</Text>
                  {participantAnswers.map((answer) => (
                    <div key={answer.questionId}>
                      <Text size="xs" c="dimmed">{answer.prompt}</Text>
                      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                        {answer.answer || 'No answer'}
                      </Text>
                    </div>
                  ))}
                </Stack>
              ) : null}
            </>
          ) : null}
        </Stack>
        {actions ? (
          <div
            data-testid="division-team-compliance-actions"
            style={{ alignSelf: 'flex-start', display: 'inline-flex', maxWidth: '100%' }}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </Stack>
    </Paper>
  );
}
