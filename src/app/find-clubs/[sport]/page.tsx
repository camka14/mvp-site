import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicSearchPageView from '@/components/publicSearch/PublicSearchPageView';
import {
  fallbackSearchTitle,
  getSearchPageForSegments,
  metadataForPublicSearchPage,
} from '@/app/find-events/publicSearchRoute';

export const dynamic = 'force-dynamic';

type ClubSearchPageProps = {
  params: Promise<{ sport: string }>;
};

export async function generateMetadata({ params }: ClubSearchPageProps): Promise<Metadata> {
  const { sport } = await params;
  const page = await getSearchPageForSegments('clubs', [sport]);
  return metadataForPublicSearchPage(page, fallbackSearchTitle('clubs', sport));
}

export default async function ClubSearchPage({ params }: ClubSearchPageProps) {
  const { sport } = await params;
  const page = await getSearchPageForSegments('clubs', [sport]);
  if (!page) {
    notFound();
  }
  return <PublicSearchPageView page={page} />;
}
