import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import type { Team } from '@/types';
import { formatBillAmount } from '@/types';
import type { TeamComplianceSummary } from '@/lib/eventTeamCompliance';

type DivisionTeamComplianceCardProps = {
  team: Team;
  summary?: TeamComplianceSummary;
  loading?: boolean;
  showComplianceDetails?: boolean;
  className?: string;
  actions?: React.ReactNode;
  onClick?: () => void;
};

const getPaymentLabel = (summary?: TeamComplianceSummary): { label: string; color: string } => {
  if (!summary) {
    return { label: 'Payment details unavailable', color: 'gray' };
  }

  if (!summary.payment.hasBill) {
    return { label: 'No team bill yet', color: 'gray' };
  }

  if (summary.payment.isPaidInFull) {
    return { label: `Paid in full (${formatBillAmount(summary.payment.totalAmountCents)})`, color: 'green' };
  }

  return {
    label: `${formatBillAmount(summary.payment.paidAmountCents)} of ${formatBillAmount(summary.payment.totalAmountCents)} paid`,
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
  className = '',
  actions,
  onClick,
}: DivisionTeamComplianceCardProps) {
  const payment = getPaymentLabel(summary);
  const documents = getDocumentLabel(summary);

  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      className={className}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} size="md" truncate>{team.name || 'Unnamed Team'}</Text>
          <Group gap={6}>
            <Badge variant="light" color="blue" size="sm">{team.currentSize}/{team.teamSize} players</Badge>
            {team.sport ? <Badge variant="outline" color="gray" size="sm">{team.sport}</Badge> : null}
            {loading && showComplianceDetails ? <Badge variant="light" color="gray" size="sm">Loading</Badge> : null}
          </Group>
          {showComplianceDetails ? (
            <>
              <Text size="sm" c={payment.color}>{payment.label}</Text>
              <Text size="sm" c={documents.color}>{documents.label}</Text>
              {summary?.users?.length ? (
                <Text size="xs" c="dimmed">
                  {summary.users.length === 1 ? '1 rostered user' : `${summary.users.length} rostered users`}
                </Text>
              ) : null}
            </>
          ) : null}
        </Stack>
        {actions ? (
          <div
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </Group>
    </Paper>
  );
}
