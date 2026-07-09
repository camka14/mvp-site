import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicSearchPageView from '@/components/publicSearch/PublicSearchPageView';
import {
  fallbackSearchTitle,
  getSearchPageForSegments,
  metadataForPublicSearchPage,
} from '@/app/find-events/publicSearchRoute';

export const dynamic = 'force-dynamic';

type FacilitySearchPageProps = {
  params: Promise<{ sport: string }>;
};

export async function generateMetadata({ params }: FacilitySearchPageProps): Promise<Metadata> {
  const { sport } = await params;
  const page = await getSearchPageForSegments('facilities', [sport]);
  return metadataForPublicSearchPage(page, fallbackSearchTitle('facilities', sport));
}

export default async function FacilitySearchPage({ params }: FacilitySearchPageProps) {
  const { sport } = await params;
  const page = await getSearchPageForSegments('facilities', [sport]);
  if (!page) {
    notFound();
  }
  return <PublicSearchPageView page={page} />;
}
