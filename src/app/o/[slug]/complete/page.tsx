import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicOrganizationBySlug } from '@/server/publicOrganizationCatalog';
import type { PublicCompletionKind } from '@/lib/publicCompletionRedirect';
import styles from '../PublicOrganizationPage.module.css';

export const dynamic = 'force-dynamic';

const completionCopy: Record<PublicCompletionKind, { title: string; message: string }> = {
  event: {
    title: 'Event registered',
    message: 'Your event registration was successful.',
  },
  rental: {
    title: 'Event rented',
    message: 'Your event has been successfully rented.',
  },
  product: {
    title: 'Product purchased',
    message: 'Your product purchase was successful.',
  },
  team: {
    title: 'Team registration complete',
    message: 'Your team registration was successful.',
  },
};

const getCompletionKind = (value: string | string[] | undefined): PublicCompletionKind => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'rental' || raw === 'product' || raw === 'team' || raw === 'event' ? raw : 'event';
};

export default async function PublicCompletionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const organization = await getPublicOrganizationBySlug(slug, { surface: 'page' });
  if (!organization) {
    notFound();
  }

  const kind = getCompletionKind(query?.type);
  const copy = completionCopy[kind];
  const supportEmail = process.env.SUPPORT_EMAIL?.trim() || 'support@bracket-iq.com';
  const pageStyle = {
    '--org-primary': organization.brandPrimaryColor,
    '--org-accent': organization.brandAccentColor,
  } as CSSProperties;

  return (
    <main className={styles.page} style={pageStyle}>
      <section className={styles.completionSection}>
        <div className={styles.completionPanel}>
          <Image src={organization.logoUrl} alt="" width={76} height={76} className={styles.logo} unoptimized />
          <p className={styles.eyebrow}>{organization.name}</p>
          <h1 className={styles.completionTitle}>{copy.title}</h1>
          <p className={styles.completionMessage}>{copy.message}</p>
          <p className={styles.completionMessage}>
            You will be emailed a receipt. If you do not receive one, email{' '}
            <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
          </p>
          <Link href={`/o/${encodeURIComponent(organization.slug)}`} className={styles.button}>
            Back to organization
          </Link>
        </div>
      </section>
    </main>
  );
}
