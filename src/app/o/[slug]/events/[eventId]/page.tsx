import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicOrganizationEventForRegistration } from '@/server/publicOrganizationCatalog';
import styles from '../../PublicOrganizationPage.module.css';
import EventRegistrationClient from './EventRegistrationClient';
import type { Event } from '@/types';

export const dynamic = 'force-dynamic';

export default async function PublicEventRegistrationPage({
  params,
}: {
  params: Promise<{ slug: string; eventId: string }>;
}) {
  const { slug, eventId } = await params;
  const result = await getPublicOrganizationEventForRegistration(slug, eventId);
  if (!result) {
    notFound();
  }

  const pageStyle = {
    '--org-primary': result.organization.brandPrimaryColor,
    '--org-accent': result.organization.brandAccentColor,
  } as CSSProperties;

  return (
    <main className={styles.registrationShell} style={pageStyle}>
      <header className={styles.registrationHeader}>
        <Link href={`/o/${encodeURIComponent(result.organization.slug)}`} className={styles.registrationBrand}>
          <Image src={result.organization.logoUrl} alt="" width={76} height={76} className={styles.logo} unoptimized />
          <div>
            <p className={styles.eyebrow}>Registration</p>
            <p className={styles.orgName}>{result.organization.name}</p>
          </div>
        </Link>
      </header>
      <div className={styles.registrationContent}>
        <EventRegistrationClient event={result.event as Event} />
      </div>
    </main>
  );
}
