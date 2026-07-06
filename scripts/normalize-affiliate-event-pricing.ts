import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: false, quiet: true });

type AffiliatePriceRange = {
  minPriceCents: number;
  maxPriceCents: number;
};

const nullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parsePriceCents = (value: unknown): number | null => {
  const text = nullableString(value);
  if (!text) return null;
  const match = text.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (!match) return null;
  const amount = Number.parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;
  return Math.max(0, Math.round(amount * 100));
};

const parseAffiliateSourcePriceRange = (value: unknown): AffiliatePriceRange | null => {
  const text = nullableString(value);
  if (!text) return null;

  const amountPattern = '([0-9][0-9,]*(?:\\.[0-9]{1,2})?)';
  const rangePatterns = [
    new RegExp(`\\$\\s*${amountPattern}\\s*(?:-|–|—|to|through)\\s*(?:\\$\\s*)?${amountPattern}`, 'i'),
    new RegExp(`\\$\\s*${amountPattern}[^$]*?\\b(?:up\\s+to|go(?:es)?\\s+up\\s+to|range(?:s)?\\s+to)\\b[^$]*\\$\\s*${amountPattern}`, 'i'),
    new RegExp(`\\b(?:from|start(?:s|ing)?\\s+at)\\b[^$]*\\$\\s*${amountPattern}[^$]*?\\b(?:up\\s+to|go(?:es)?\\s+up\\s+to|to)\\b[^$]*\\$\\s*${amountPattern}`, 'i'),
  ];

  for (const pattern of rangePatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const left = Number.parseFloat(match[1].replace(/,/g, ''));
    const right = Number.parseFloat(match[2].replace(/,/g, ''));
    if (Number.isFinite(left) && Number.isFinite(right)) {
      const leftCents = Math.max(0, Math.round(left * 100));
      const rightCents = Math.max(0, Math.round(right * 100));
      return {
        minPriceCents: Math.min(leftCents, rightCents),
        maxPriceCents: Math.max(leftCents, rightCents),
      };
    }
  }

  const priceCents = parsePriceCents(text);
  if (priceCents !== null) {
    return {
      minPriceCents: priceCents,
      maxPriceCents: priceCents,
    };
  }

  if (/\bfree\b/i.test(text)) {
    return {
      minPriceCents: 0,
      maxPriceCents: 0,
    };
  }

  return null;
};

const formatPriceCents = (priceCents: number): string => (
  priceCents <= 0 ? 'Free' : `$${(priceCents / 100).toFixed(2)}`
);

const formatPriceRange = (range: AffiliatePriceRange): string => (
  range.minPriceCents === range.maxPriceCents
    ? formatPriceCents(range.minPriceCents)
    : `${formatPriceCents(range.minPriceCents)} - ${formatPriceCents(range.maxPriceCents)}`
);

const isSimplePriceText = (sourcePriceText: string, displayPriceText: string | null): boolean => {
  const normalize = (value: string) => value.trim().replace(/\.$/, '').toLowerCase();
  const normalizedSource = normalize(sourcePriceText);
  const normalizedDisplay = displayPriceText ? normalize(displayPriceText) : '';
  if (normalizedDisplay && normalizedSource === normalizedDisplay) {
    return true;
  }

  return /^\$?\s*\d[\d,]*(?:\.\d{1,2})?$/.test(sourcePriceText.trim())
    || /^free$/i.test(sourcePriceText.trim());
};

const buildDescription = (
  description: string | null,
  oldPriceText: string | null,
  displayPriceText: string | null,
) => {
  if (!oldPriceText || isSimplePriceText(oldPriceText, displayPriceText)) {
    return description;
  }

  const existingDescription = description ?? '';
  if (existingDescription.toLowerCase().includes(oldPriceText.toLowerCase())) {
    return description;
  }

  const pricingDetailsLine = `Pricing details: ${oldPriceText}`;
  return [description, pricingDetailsLine]
    .filter((value): value is string => Boolean(value))
    .join('\n\n');
};

const priceRangeFromDivisionPrices = (prices: Array<number | null | undefined>): AffiliatePriceRange | null => {
  const normalizedPrices = prices
    .map((price) => (
      typeof price === 'number' && Number.isFinite(price)
        ? Math.max(0, Math.round(price))
        : null
    ))
    .filter((price): price is number => price !== null);

  if (normalizedPrices.length === 0) {
    return null;
  }

  return {
    minPriceCents: Math.min(...normalizedPrices),
    maxPriceCents: Math.max(...normalizedPrices),
  };
};

const isLikelyLiveDatabaseUrl = (databaseUrl: string | undefined): boolean => {
  if (!databaseUrl) return false;
  const normalized = databaseUrl.toLowerCase();
  return normalized.includes('ondigitalocean.com')
    || normalized.includes('digitalocean')
    || normalized.includes('do-user-');
};

const main = async () => {
  const dryRun = process.argv.includes('--dry-run');
  const allowLive = process.argv.includes('--allow-live');
  const databaseUrl = process.env.DATABASE_URL;

  if (isLikelyLiveDatabaseUrl(databaseUrl) && !allowLive) {
    throw new Error('Refusing to normalize a likely live database without --allow-live.');
  }

  const { prisma } = await import('../src/lib/prisma');
  const prismaClient = prisma as any;

  const events = await prismaClient.events.findMany({
    where: {
      archivedAt: null,
      OR: [
        { sourceType: 'AFFILIATE_IMPORT' },
        { affiliateUrl: { not: null } },
      ],
    },
    select: {
      id: true,
      name: true,
      price: true,
      priceText: true,
      description: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const eventIds = events.map((event: { id: string }) => event.id);
  const divisions = eventIds.length > 0
    ? await prismaClient.divisions.findMany({
        where: { eventId: { in: eventIds } },
        select: {
          eventId: true,
          price: true,
        },
      })
    : [];

  const divisionPricesByEvent = new Map<string, Array<number | null>>();
  divisions.forEach((division: { eventId: string; price: number | null }) => {
    const prices = divisionPricesByEvent.get(division.eventId) ?? [];
    prices.push(division.price);
    divisionPricesByEvent.set(division.eventId, prices);
  });

  const updates: Array<{
    id: string;
    name: string;
    oldPriceText: string | null;
    newPriceText: string | null;
    oldPrice: number;
    newPrice: number;
    descriptionChanged: boolean;
  }> = [];

  for (const event of events as Array<{
    id: string;
    name: string;
    price: number;
    priceText: string | null;
    description: string | null;
  }>) {
    const divisionRange = priceRangeFromDivisionPrices(divisionPricesByEvent.get(event.id) ?? []);
    const sourceRange = parseAffiliateSourcePriceRange(event.priceText);
    const existingEventPrice = typeof event.price === 'number' && Number.isFinite(event.price) && event.price > 0
      ? { minPriceCents: Math.round(event.price), maxPriceCents: Math.round(event.price) }
      : null;
    const range = divisionRange ?? sourceRange ?? existingEventPrice;
    const newPriceText = range ? formatPriceRange(range) : null;
    const newPrice = range?.minPriceCents ?? 0;
    const newDescription = buildDescription(event.description, nullableString(event.priceText), newPriceText);

    if (
      event.priceText === newPriceText
      && event.price === newPrice
      && event.description === newDescription
    ) {
      continue;
    }

    updates.push({
      id: event.id,
      name: event.name,
      oldPriceText: event.priceText,
      newPriceText,
      oldPrice: event.price,
      newPrice,
      descriptionChanged: event.description !== newDescription,
    });

    if (!dryRun) {
      await prismaClient.events.update({
        where: { id: event.id },
        data: {
          price: newPrice,
          priceText: newPriceText,
          description: newDescription,
          updatedAt: new Date(),
        },
      });
    }
  }

  console.log(JSON.stringify({
    dryRun,
    scannedEvents: events.length,
    updatedEvents: updates.length,
    examples: updates.slice(0, 20),
  }, null, 2));

  await prismaClient.$disconnect();
};

main().catch((error) => {
  console.error('[affiliate:normalize-pricing] failed', error);
  process.exitCode = 1;
});
