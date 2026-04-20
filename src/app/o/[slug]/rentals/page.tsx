import { notFound } from 'next/navigation';
import { getPublicOrganizationRentalSelectionData } from '@/server/publicOrganizationCatalog';
import PublicRentalSelectionClient from './PublicRentalSelectionClient';

export const dynamic = 'force-dynamic';

export default async function PublicRentalSelectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicOrganizationRentalSelectionData(slug);
  if (!data) {
    notFound();
  }

  return (
    <PublicRentalSelectionClient
      slug={slug}
      organization={data.rentalOrganization}
    />
  );
}
