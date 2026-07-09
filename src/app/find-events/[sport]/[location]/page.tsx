import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicSearchPageView from '@/components/publicSearch/PublicSearchPageView';
import {
  fallbackSearchTitle,
  getSearchPageForSegments,
  metadataForPublicSearchPage,
} from '../../publicSearchRoute';

export const dynamic = 'force-dynamic';

type EventLocationSearchPageProps = {
  params: Promise<{ sport: string; location: string }>;
};

export async function generateMetadata({ params }: EventLocationSearchPageProps): Promise<Metadata> {
  const { sport, location } = await params;
  const page = await getSearchPageForSegments('events', [sport, location]);
  return metadataForPublicSearchPage(page, fallbackSearchTitle('events', sport));
}

export default async function EventLocationSearchPage({ params }: EventLocationSearchPageProps) {
  const { sport, location } = await params;
  const page = await getSearchPageForSegments('events', [sport, location]);
  if (!page) {
    notFound();
  }
  return <PublicSearchPageView page={page} />;
}
