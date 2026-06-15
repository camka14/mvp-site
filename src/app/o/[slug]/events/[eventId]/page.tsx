import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import BlogStructuredData from '@/components/blog/BlogStructuredData';
import { getPublicOrganizationEventForRegistration } from '@/server/publicOrganizationCatalog';
import {
  absoluteUrl,
  createPublicEventMetaDescription,
  createPublicEventStructuredData,
  getPublicEventSeoData,
  publicEventPath,
} from '@/server/publicSearchSeo';
import styles from '../../PublicOrganizationPage.module.css';
import EventRegistrationClient from './EventRegistrationClient';
import type { Event } from '@/types';

export const dynamic = 'force-dynamic';

type PublicEventRegistrationPageProps = {
  params: Promise<{ slug: string; eventId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PublicEventRegistrationPageProps): Promise<Metadata> {
  const { slug, eventId } = await params;
  const seoData = await getPublicEventSeoData(slug, eventId);
  if (!seoData) {
    return {};
  }

  const seoEventId = seoData.event.id ?? seoData.event.$id ?? eventId;
  const seoEventName = seoData.event.name ?? 'Event';
  const canonicalPath = publicEventPath(seoData.organization.slug, seoEventId);
  const description = createPublicEventMetaDescription(seoData);
  const title = `${seoEventName} | ${seoData.organization.name} on BracketIQ`;
  const eventImage = seoData.event.imageId
    ? absoluteUrl(`/api/files/${encodeURIComponent(seoData.event.imageId)}/preview?w=1200&h=675`)
    : absoluteUrl(seoData.organization.logoUrl ?? '/BIQ_drawing.svg');

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title,
      description,
      url: absoluteUrl(canonicalPath),
      type: 'website',
      images: [
        {
          url: eventImage,
          width: 1200,
          height: 675,
          alt: seoEventName,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [eventImage],
    },
  };
}

export default async function PublicEventRegistrationPage({
  params,
  searchParams,
}: PublicEventRegistrationPageProps) {
  const { slug, eventId } = await params;
  const query = await searchParams;
  const slotId = typeof query?.slotId === 'string' ? query.slotId.trim() : '';
  const occurrenceDate = typeof query?.occurrenceDate === 'string' ? query.occurrenceDate.trim() : '';
  const selectedOccurrence = slotId && occurrenceDate ? { slotId, occurrenceDate } : null;
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
        <EventRegistrationClient
          event={result.event as Event}
          selectedOccurrence={selectedOccurrence}
          publicCompletion={{
            slug: result.organization.slug,
            redirectUrl: result.organization.publicCompletionRedirectUrl,
          }}
        />
      </div>
      <BlogStructuredData
        data={createPublicEventStructuredData({
          organization: result.organization,
          event: result.event,
        })}
      />
    </main>
  );
}
