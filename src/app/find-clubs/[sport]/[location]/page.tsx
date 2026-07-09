import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicSearchPageView from '@/components/publicSearch/PublicSearchPageView';
import {
  fallbackSearchTitle,
  getSearchPageForSegments,
  metadataForPublicSearchPage,
} from '@/app/find-events/publicSearchRoute';

export const dynamic = 'force-dynamic';

type ClubLocationSearchPageProps = {
  params: Promise<{ sport: string; location: string }>;
};

export async function generateMetadata({ params }: ClubLocationSearchPageProps): Promise<Metadata> {
  const { sport, location } = await params;
  const page = await getSearchPageForSegments('clubs', [sport, location]);
  return metadataForPublicSearchPage(page, fallbackSearchTitle('clubs', sport));
}

export default async function ClubLocationSearchPage({ params }: ClubLocationSearchPageProps) {
  const { sport, location } = await params;
  const page = await getSearchPageForSegments('clubs', [sport, location]);
  if (!page) {
    notFound();
  }
  return <PublicSearchPageView page={page} />;
}
