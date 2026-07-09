import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicSearchPageView from '@/components/publicSearch/PublicSearchPageView';
import {
  fallbackSearchTitle,
  getSearchPageForSegments,
  metadataForPublicSearchPage,
} from '@/app/find-events/publicSearchRoute';

export const dynamic = 'force-dynamic';

type FacilityLocationSearchPageProps = {
  params: Promise<{ sport: string; location: string }>;
};

export async function generateMetadata({ params }: FacilityLocationSearchPageProps): Promise<Metadata> {
  const { sport, location } = await params;
  const page = await getSearchPageForSegments('facilities', [sport, location]);
  return metadataForPublicSearchPage(page, fallbackSearchTitle('facilities', sport));
}

export default async function FacilityLocationSearchPage({ params }: FacilityLocationSearchPageProps) {
  const { sport, location } = await params;
  const page = await getSearchPageForSegments('facilities', [sport, location]);
  if (!page) {
    notFound();
  }
  return <PublicSearchPageView page={page} />;
}
