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
  const page = await getSearchPageForSegments('facilities', []);
  return metadataForPublicSearchPage(page, fallbackSearchTitle('facilities'));
}

export default async function FindFacilitiesPage() {
  const page = await getSearchPageForSegments('facilities', []);
  if (!page) {
    notFound();
  }
  return <PublicSearchPageView page={page} />;
}
