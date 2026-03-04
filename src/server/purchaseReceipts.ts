import { formatDisplayDateTime } from '@/lib/dateUtils';
import { prisma } from '@/lib/prisma';
import { isEmailEnabled, sendEmail } from '@/server/email';

export interface SendPurchaseReceiptEmailInput {
  purchaseType?: string | null;
  paymentIntentId?: string | null;
  userId?: string | null;
  teamId?: string | null;
  eventId?: string | null;
  productId?: string | null;
  organizationId?: string | null;
  billId?: string | null;
  billPaymentId?: string | null;
  amountCents?: number | null;
  totalChargeCents?: number | null;
  paidAt?: Date | null;
  receiptEmail?: string | null;
  metadata?: Record<string, unknown>;
}

type DetailRow = {
  label: string;
  value: string;
};

type ReceiptLineItem = {
  label: string;
  amountCents: number;
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const normalizeAmount = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatCurrency = (amountCents: number): string => (
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amountCents / 100)
);

const escapeHtml = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
);

const formatWhenPaid = (value: Date): string => {
  const formatted = formatDisplayDateTime(value, { timeZone: 'UTC' });
  return formatted ? `${formatted} UTC` : value.toISOString();
};

const formatEventDate = (value: Date | null | undefined): string | null => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null;
  }
  const formatted = formatDisplayDateTime(value, { timeZone: 'UTC' });
  return formatted ? `${formatted} UTC` : value.toISOString();
};

const formatHostName = (
  user: { firstName: string | null; lastName: string | null; userName: string } | null,
  fallback?: string | null,
): string | null => {
  if (user) {
    const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
    if (fullName.length) return fullName;
    if (user.userName.trim().length) return user.userName.trim();
  }
  return normalizeString(fallback);
};

const toLowerEmail = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const resolvePurchaseTypeLabel = (purchaseType: string | null | undefined): string => {
  const normalized = (purchaseType ?? '').trim().toLowerCase();
  if (normalized === 'event') return 'Event registration';
  if (normalized === 'rental') return 'Field rental';
  if (normalized === 'product') return 'Product purchase';
  if (normalized === 'bill') return 'Bill payment';
  return 'Purchase';
};

const resolveProductPeriodLabel = (period: string | null | undefined): string | null => {
  if (!period) return null;
  const normalized = period.trim().toLowerCase();
  if (!normalized.length) return null;
  if (normalized === 'week') return 'Weekly';
  if (normalized === 'month') return 'Monthly';
  if (normalized === 'year') return 'Yearly';
  return normalized;
};

const deriveAmountCents = ({
  inputAmount,
  metadataAmount,
  billPaymentAmount,
  billTotalAmount,
  totalChargeAmount,
}: {
  inputAmount: number | null;
  metadataAmount: number | null;
  billPaymentAmount: number | null;
  billTotalAmount: number | null;
  totalChargeAmount: number | null;
}): number | null => {
  return inputAmount
    ?? metadataAmount
    ?? billPaymentAmount
    ?? billTotalAmount
    ?? totalChargeAmount
    ?? null;
};

const parseReceiptLineItems = (value: unknown): ReceiptLineItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }
      const lineItem = item as Record<string, unknown>;
      const amountCents = normalizeAmount(lineItem.amountCents) ?? 0;
      if (amountCents <= 0) {
        return null;
      }
      return {
        label: normalizeString(lineItem.label) ?? 'Line item',
        amountCents,
      };
    })
    .filter((item): item is ReceiptLineItem => Boolean(item));
};

export const sendPurchaseReceiptEmail = async (
  input: SendPurchaseReceiptEmailInput,
): Promise<{ sent: boolean; reason?: string }> => {
  if (!isEmailEnabled()) {
    return { sent: false, reason: 'email_disabled' };
  }

  const metadata = input.metadata ?? {};
  const metadataUserId = normalizeString(metadata.user_id ?? metadata.userId);
  const metadataTeamId = normalizeString(metadata.team_id ?? metadata.teamId);
  const metadataEventId = normalizeString(metadata.event_id ?? metadata.eventId);
  const metadataProductId = normalizeString(metadata.product_id ?? metadata.productId);
  const metadataOrganizationId = normalizeString(metadata.organization_id ?? metadata.organizationId);
  const metadataOrganizationName = normalizeString(metadata.organization_name ?? metadata.organizationName);
  const metadataBillId = normalizeString(metadata.bill_id ?? metadata.billId);
  const metadataBillPaymentId = normalizeString(metadata.bill_payment_id ?? metadata.billPaymentId);
  const metadataEventName = normalizeString(metadata.event_name ?? metadata.eventName);
  const metadataEventLocation = normalizeString(metadata.event_location ?? metadata.eventLocation);
  const metadataEventStart = normalizeString(metadata.event_start ?? metadata.eventStart);
  const metadataHostName = normalizeString(metadata.host_name ?? metadata.hostName);
  const metadataProductName = normalizeString(metadata.product_name ?? metadata.productName);
  const metadataProductDescription = normalizeString(metadata.product_description ?? metadata.productDescription);
  const metadataProductPeriod = normalizeString(metadata.product_period ?? metadata.productPeriod);

  const userId = input.userId ?? metadataUserId;
  const teamId = input.teamId ?? metadataTeamId;
  const eventId = input.eventId ?? metadataEventId;
  const productId = input.productId ?? metadataProductId;
  const organizationId = input.organizationId ?? metadataOrganizationId;
  const billId = input.billId ?? metadataBillId;
  const billPaymentId = input.billPaymentId ?? metadataBillPaymentId;
  const paymentIntentId = normalizeString(input.paymentIntentId);

  const [userEmailRow, event, product, team, bill, billPayment] = await Promise.all([
    userId
      ? prisma.sensitiveUserData.findFirst({
        where: { userId },
        select: { email: true },
        orderBy: { updatedAt: 'desc' },
      })
      : Promise.resolve(null),
    eventId
      ? prisma.events.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          name: true,
          start: true,
          location: true,
          hostId: true,
          organizationId: true,
        },
      })
      : Promise.resolve(null),
    productId
      ? prisma.products.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          description: true,
          period: true,
          organizationId: true,
        },
      })
      : Promise.resolve(null),
    teamId
      ? prisma.teams.findUnique({
        where: { id: teamId },
        select: {
          id: true,
          name: true,
        },
      })
      : Promise.resolve(null),
    billId
      ? prisma.bills.findUnique({
        where: { id: billId },
        select: {
          id: true,
          eventId: true,
          organizationId: true,
          totalAmountCents: true,
          lineItems: true,
        },
      })
      : Promise.resolve(null),
    billPaymentId
      ? prisma.billPayments.findUnique({
        where: { id: billPaymentId },
        select: {
          id: true,
          amountCents: true,
          paidAt: true,
        },
      })
      : Promise.resolve(null),
  ]);

  const fallbackEmail = toLowerEmail(input.receiptEmail);
  const recipientEmail = toLowerEmail(userEmailRow?.email) ?? fallbackEmail;
  if (!recipientEmail) {
    return { sent: false, reason: 'missing_recipient_email' };
  }

  const resolvedEventId = event?.id ?? bill?.eventId ?? null;
  const resolvedEvent = event ?? (
    resolvedEventId && resolvedEventId !== eventId
      ? await prisma.events.findUnique({
        where: { id: resolvedEventId },
        select: {
          id: true,
          name: true,
          start: true,
          location: true,
          hostId: true,
          organizationId: true,
        },
      })
      : null
  );

  const resolvedOrganizationId =
    organizationId
    ?? resolvedEvent?.organizationId
    ?? product?.organizationId
    ?? bill?.organizationId
    ?? null;
  const [organization, host] = await Promise.all([
    resolvedOrganizationId
      ? prisma.organizations.findUnique({
        where: { id: resolvedOrganizationId },
        select: { name: true },
      })
      : Promise.resolve(null),
    resolvedEvent?.hostId
      ? prisma.userData.findUnique({
        where: { id: resolvedEvent.hostId },
        select: {
          firstName: true,
          lastName: true,
          userName: true,
        },
      })
      : Promise.resolve(null),
  ]);
  const organizationLabel = organization?.name ?? metadataOrganizationName ?? resolvedOrganizationId;

  const purchaseType = (input.purchaseType ?? normalizeString(metadata.purchase_type) ?? 'purchase').toLowerCase();
  const paidAt = input.paidAt ?? billPayment?.paidAt ?? new Date();

  const metadataAmount = normalizeAmount(metadata.amount_cents ?? metadata.amountCents);
  const totalChargeAmountFromInput = normalizeAmount(input.totalChargeCents);
  const totalChargeAmountFromMetadata = normalizeAmount(metadata.total_charge_cents ?? metadata.totalChargeCents);
  const totalChargeAmount = totalChargeAmountFromInput ?? totalChargeAmountFromMetadata ?? null;
  const amountCents = deriveAmountCents({
    inputAmount: normalizeAmount(input.amountCents),
    metadataAmount,
    billPaymentAmount: billPayment?.amountCents ?? null,
    billTotalAmount: bill?.totalAmountCents ?? null,
    totalChargeAmount,
  });

  const eventName = resolvedEvent?.name ?? metadataEventName;
  const eventLocation = resolvedEvent?.location ?? metadataEventLocation;
  const hostName = formatHostName(host, metadataHostName);
  const eventDate = formatEventDate(resolvedEvent?.start) ?? normalizeString(metadataEventStart);
  const teamName = team?.name ?? normalizeString(metadata.team_name ?? metadata.teamName);
  const productName = product?.name ?? metadataProductName;
  const productDescription = product?.description ?? metadataProductDescription;
  const productPeriod = resolveProductPeriodLabel(
    product?.period ?? metadataProductPeriod ?? normalizeString(metadata.period),
  );

  const purchaseTypeLabel = resolvePurchaseTypeLabel(purchaseType);
  const detailRows: DetailRow[] = [
    { label: 'Purchase type', value: purchaseTypeLabel },
    { label: 'Paid at', value: formatWhenPaid(paidAt) },
  ];

  if (amountCents !== null) {
    detailRows.push({ label: 'Amount', value: formatCurrency(amountCents) });
  }

  if (totalChargeAmount !== null && (amountCents === null || totalChargeAmount !== amountCents)) {
    detailRows.push({ label: 'Total charged', value: formatCurrency(totalChargeAmount) });
  }

  if (eventName) {
    detailRows.push({ label: 'Event', value: eventName });
  }
  if (organizationLabel) {
    detailRows.push({ label: 'Organization', value: organizationLabel });
  }
  if (hostName) {
    detailRows.push({ label: 'Host', value: hostName });
  }
  if (eventLocation) {
    detailRows.push({ label: 'Location', value: eventLocation });
  }
  if (eventDate) {
    detailRows.push({ label: 'Event date', value: eventDate });
  }
  if (teamName) {
    detailRows.push({ label: 'Team', value: teamName });
  }
  if (productName) {
    detailRows.push({ label: 'Product', value: productName });
  }
  if (productDescription) {
    detailRows.push({ label: 'Product details', value: productDescription });
  }
  if (productPeriod) {
    detailRows.push({ label: 'Billing period', value: productPeriod });
  }
  if (paymentIntentId) {
    detailRows.push({ label: 'Stripe payment ID', value: paymentIntentId });
  }
  if (bill?.id) {
    detailRows.push({ label: 'Bill ID', value: bill.id });
  }
  if (billPayment?.id) {
    detailRows.push({ label: 'Bill payment ID', value: billPayment.id });
  }

  const normalizedBillLineItems = parseReceiptLineItems(bill?.lineItems);
  normalizedBillLineItems.forEach((lineItem, index) => {
    detailRows.push({
      label: `Line item ${index + 1}`,
      value: `${lineItem.label} - ${formatCurrency(lineItem.amountCents)}`,
    });
  });

  const subjectItemName = eventName ?? productName ?? purchaseTypeLabel;
  const subject = `Receipt: ${subjectItemName}`;

  const text = [
    'Your payment was successful.',
    'This is a receipt for your convenience.',
    '',
    ...detailRows.map((row) => `${row.label}: ${row.value}`),
    '',
    'If you have any questions about this purchase, please contact support.',
  ].join('\n');

  const html = [
    '<p>Your payment was successful.</p>',
    '<p><em>This is a receipt for your convenience.</em></p>',
    '<table cellpadding="6" cellspacing="0" style="border-collapse: collapse;">',
    ...detailRows.map((row) => (
      `<tr><td style="font-weight:600;vertical-align:top;">${escapeHtml(row.label)}</td><td>${escapeHtml(row.value)}</td></tr>`
    )),
    '</table>',
    '<p>If you have any questions about this purchase, please contact support.</p>',
  ].join('');

  await sendEmail({
    to: recipientEmail,
    subject,
    text,
    html,
  });

  return { sent: true };
};
