import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';

import { formatBillAmount } from '@/types';
import type { Team } from '@/types';
import HostPriceInput from '@/components/ui/HostPriceInput';

import type { TeamBillingSnapshot } from './helpers';

type RefundTeamModalProps = {
  team: Team | null;
  fullScreen: boolean;
  error: string | null;
  loading: boolean;
  snapshot: TeamBillingSnapshot | null;
  refundAmountDraftByPaymentId: Record<string, number>;
  refundingPaymentId: string | null;
  cancellingPendingBillPaymentId: string | null;
  onClose: () => void;
  onRefundAmountDraftChange: (paymentId: string, amountDollars: number) => void;
  onSubmitRefund: (paymentId: string) => void;
  onCancelPendingPayment: (billId: string, paymentId: string) => void;
};

export function RefundTeamModal({
  team,
  fullScreen,
  error,
  loading,
  snapshot,
  refundAmountDraftByPaymentId,
  refundingPaymentId,
  cancellingPendingBillPaymentId,
  onClose,
  onRefundAmountDraftChange,
  onSubmitRefund,
  onCancelPendingPayment,
}: RefundTeamModalProps) {
  return (
    <Modal
      opened={Boolean(team)}
      onClose={onClose}
      title={team ? `Refunds \u2022 ${team.name || 'Team'}` : 'Refunds'}
      size="xl"
      centered
      fullScreen={fullScreen}
    >
      <Stack gap="md">
        {error ? (
          <Alert color="red" radius="md">
            {error}
          </Alert>
        ) : null}

        {loading ? (
          <Paper withBorder radius="md" p="md">
            <Group justify="center" gap="sm">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">Loading bill payments...</Text>
            </Group>
          </Paper>
        ) : snapshot ? (
          <>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" c="dimmed">Paid</Text>
                <Text fw={600}>{formatBillAmount(snapshot.totals.paidAmountCents)}</Text>
              </Paper>
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" c="dimmed">Refunded</Text>
                <Text fw={600}>{formatBillAmount(snapshot.totals.refundedAmountCents)}</Text>
              </Paper>
              <Paper withBorder radius="md" p="sm">
                <Text size="xs" c="dimmed">Refundable</Text>
                <Text fw={600}>{formatBillAmount(snapshot.totals.refundableAmountCents)}</Text>
              </Paper>
            </SimpleGrid>

            {snapshot.bills.length === 0 ? (
              <Paper withBorder radius="md" p="md">
                <Text size="sm" c="dimmed">No bills were found for this team on this event.</Text>
              </Paper>
            ) : (
              <Stack gap="sm">
                {snapshot.bills.map((bill) => (
                  <Paper key={bill.$id} withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start" wrap="wrap">
                        <Stack gap={2}>
                          <Text fw={600}>
                            {bill.ownerType === 'TEAM' ? 'Team bill' : 'User bill'} {'\u2022'} {bill.ownerName}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {bill.status ?? 'OPEN'} {'\u2022'} Total {formatBillAmount(bill.totalAmountCents)}
                          </Text>
                        </Stack>
                        <Text size="xs" c="dimmed">
                          Refunded {formatBillAmount(bill.refundedAmountCents)} / Refundable {formatBillAmount(bill.refundableAmountCents)}
                        </Text>
                      </Group>

                      {Array.isArray(bill.lineItems) && bill.lineItems.length > 0 ? (
                        <Stack gap={2}>
                          {bill.lineItems.map((item, index) => (
                            <Text key={`${bill.$id}:line:${item.id ?? index}`} size="xs" c="dimmed">
                              {(item.label ?? 'Line item')} {'\u2022'} {formatBillAmount(Number(item.amountCents ?? 0))}
                            </Text>
                          ))}
                        </Stack>
                      ) : null}

                      <Stack gap="xs" mt={4}>
                        {bill.payments.length === 0 ? (
                          <Text size="sm" c="dimmed">No bill payments found.</Text>
                        ) : bill.payments.map((payment) => {
                          const draftAmount = refundAmountDraftByPaymentId[payment.$id] ?? (payment.refundableAmountCents / 100);
                          const maxDollars = payment.refundableAmountCents / 100;
                          const canRefundPayment = payment.isRefundable && Boolean(payment.paymentIntentId);
                          const canCancelPendingPayment = payment.status === 'PROCESSING';
                          return (
                            <Paper key={payment.$id} withBorder radius="sm" p="sm">
                              <Stack gap="xs">
                                <Group justify="space-between" align="center" wrap="wrap">
                                  <Group gap="xs">
                                    <Text size="sm" fw={500}>Payment #{payment.sequence}</Text>
                                    {canCancelPendingPayment ? (
                                      <Badge size="xs" color="yellow" variant="light">Pending</Badge>
                                    ) : null}
                                  </Group>
                                  <Text size="xs" c="dimmed">
                                    Amount {formatBillAmount(payment.amountCents)} {'\u2022'} Refunded {formatBillAmount(payment.refundedAmountCents)}
                                  </Text>
                                </Group>
                                <Text size="xs" c="dimmed">
                                  Refundable: {formatBillAmount(payment.refundableAmountCents)}
                                </Text>
                                {canRefundPayment ? (
                                  <Group align="flex-end" wrap="wrap">
                                    <NumberInput
                                      label="Refund amount"
                                      min={0}
                                      max={maxDollars}
                                      decimalScale={2}
                                      fixedDecimalScale
                                      prefix="$"
                                      value={draftAmount}
                                      onChange={(value) => {
                                        const numeric = typeof value === 'number' ? value : Number(value);
                                        onRefundAmountDraftChange(
                                          payment.$id,
                                          Number.isFinite(numeric) ? Math.max(0, numeric) : 0,
                                        );
                                      }}
                                      w={180}
                                    />
                                    <Button
                                      loading={refundingPaymentId === payment.$id}
                                      disabled={refundingPaymentId !== null && refundingPaymentId !== payment.$id}
                                      onClick={() => onSubmitRefund(payment.$id)}
                                    >
                                      Refund
                                    </Button>
                                  </Group>
                                ) : (
                                  <Text size="xs" c="dimmed">
                                    {payment.paymentIntentId
                                      ? canCancelPendingPayment
                                        ? 'This bank payment is pending with Stripe.'
                                        : 'This payment has no refundable balance.'
                                      : 'This payment cannot be refunded because it is not linked to Stripe.'}
                                  </Text>
                                )}
                                {canCancelPendingPayment ? (
                                  <Group>
                                    <Button
                                      size="xs"
                                      variant="light"
                                      color="red"
                                      loading={cancellingPendingBillPaymentId === payment.$id}
                                      onClick={() => onCancelPendingPayment(bill.$id, payment.$id)}
                                    >
                                      Cancel pending payment
                                    </Button>
                                  </Group>
                                ) : null}
                              </Stack>
                            </Paper>
                          );
                        })}
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </>
        ) : (
          <Paper withBorder radius="md" p="md">
            <Text size="sm" c="dimmed">No billing details loaded yet.</Text>
          </Paper>
        )}
      </Stack>
    </Modal>
  );
}

type CreateBillModalProps = {
  team: Team | null;
  error: string | null;
  ownerType: 'TEAM' | 'USER';
  ownerId: string | null;
  amountDollars: number;
  taxDollars: number;
  label: string;
  allowSplit: boolean;
  isUserOnly: boolean;
  userOptions: Array<{ value: string; label: string }>;
  previewLineItems: Array<{ id: string; label: string; amountCents: number }>;
  totalCents: number;
  creating: boolean;
  onClose: () => void;
  onOwnerTypeChange: (ownerType: 'TEAM' | 'USER') => void;
  onOwnerIdChange: (ownerId: string | null) => void;
  onAmountDollarsChange: (amount: number) => void;
  onTaxDollarsChange: (amount: number) => void;
  onLabelChange: (label: string) => void;
  onAllowSplitChange: (allowSplit: boolean) => void;
  onSubmit: () => void;
};

export function CreateBillModal({
  team,
  error,
  ownerType,
  ownerId,
  amountDollars,
  taxDollars,
  label,
  allowSplit,
  isUserOnly,
  userOptions,
  previewLineItems,
  totalCents,
  creating,
  onClose,
  onOwnerTypeChange,
  onOwnerIdChange,
  onAmountDollarsChange,
  onTaxDollarsChange,
  onLabelChange,
  onAllowSplitChange,
  onSubmit,
}: CreateBillModalProps) {
  return (
    <Modal
      opened={Boolean(team)}
      onClose={onClose}
      title={team ? `Send Bill \u2022 ${team.name || 'Team'}` : 'Send Bill'}
      size="lg"
      centered
    >
      <Stack gap="md">
        {error ? (
          <Alert color="red" radius="md">
            {error}
          </Alert>
        ) : null}

        <Group align="flex-end" wrap="wrap">
          <Select
            label="Bill owner"
            data={isUserOnly
              ? [{ value: 'USER', label: 'User' }]
              : [
                  { value: 'TEAM', label: 'Team' },
                  { value: 'USER', label: 'User' },
                ]}
            value={ownerType}
            onChange={(value) => onOwnerTypeChange(value === 'USER' ? 'USER' : 'TEAM')}
            allowDeselect={false}
            disabled={isUserOnly}
            w={180}
          />
          {ownerType === 'USER' && !isUserOnly ? (
            <Select
              label="User"
              data={userOptions}
              value={ownerId}
              onChange={(value) => onOwnerIdChange(value ?? null)}
              placeholder="Select user"
              searchable
              allowDeselect={false}
              w={260}
            />
          ) : null}
        </Group>

        <Group align="flex-end" wrap="wrap">
          <div className="min-w-[320px] flex-1">
            <HostPriceInput
              hostLabel="Host take-home"
              totalLabel="Bill amount"
              value={Math.round((Number(amountDollars) || 0) * 100)}
              onChange={(nextCents) => onAmountDollarsChange(nextCents / 100)}
            />
          </div>
          <NumberInput
            label="Tax"
            min={0}
            decimalScale={2}
            fixedDecimalScale
            prefix="$"
            value={taxDollars}
            onChange={(value) => {
              const numeric = typeof value === 'number' ? value : Number(value);
              onTaxDollarsChange(Number.isFinite(numeric) ? Math.max(0, numeric) : 0);
            }}
            w={180}
          />
          <TextInput
            label="Primary line item label"
            value={label}
            onChange={(event) => onLabelChange(event.currentTarget.value)}
            placeholder="Event registration"
            w={280}
          />
        </Group>

        {ownerType === 'TEAM' && !isUserOnly ? (
          <Checkbox
            label="Allow team members to split this bill"
            checked={allowSplit}
            onChange={(event) => onAllowSplitChange(event.currentTarget.checked)}
          />
        ) : null}

        <Paper withBorder radius="md" p="md">
          <Stack gap={6}>
            <Text size="sm" fw={600}>Bill preview</Text>
            {previewLineItems.map((item) => (
              <Group key={item.id} justify="space-between" align="center">
                <Text size="sm">{item.label}</Text>
                <Text size="sm">{formatBillAmount(item.amountCents)}</Text>
              </Group>
            ))}
            <Group justify="space-between" align="center" pt={6} style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
              <Text fw={600}>Total bill</Text>
              <Text fw={600}>{formatBillAmount(totalCents)}</Text>
            </Group>
          </Stack>
        </Paper>

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button loading={creating} onClick={onSubmit}>
            Create Bill
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
