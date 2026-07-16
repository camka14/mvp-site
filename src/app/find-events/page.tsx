import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicSearchPageView from '@/components/publicSearch/PublicSearchPageView';
import {
  fallbackSearchTitle,
  getSearchPageForSegments,
  metadataForPublicSearchPage,
} from '@/app/find-events/publicSearchRoute';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getSearchPageForSegments('events', []);
  return metadataForPublicSearchPage(page, fallbackSearchTitle('events'));
}

export default async function FindEventsPage() {
  const page = await getSearchPageForSegments('events', []);
  if (!page) {
    notFound();
  }
  return <PublicSearchPageView page={page} />;
}
