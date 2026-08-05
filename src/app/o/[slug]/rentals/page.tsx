import { notFound, permanentRedirect, redirect } from 'next/navigation';
import {
  getDisabledPublicOrganizationRedirectPath,
  getPublicOrganizationRentalSelectionData,
  getPublicOrganizationRedirectPath,
} from '@/server/publicOrganizationCatalog';
import PublicRentalSelectionClient from './PublicRentalSelectionClient';

export const dynamic = 'force-dynamic';

export default async function PublicRentalSelectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const canonicalRedirectPath = await getPublicOrganizationRedirectPath(slug, {
    suffix: '/rentals',
  });
  if (canonicalRedirectPath) {
    if (canonicalRedirectPath.startsWith('/o/')) {
      permanentRedirect(canonicalRedirectPath);
    }
    redirect(canonicalRedirectPath);
  }
  const data = await getPublicOrganizationRentalSelectionData(slug);
  if (!data) {
    const redirectPath = await getDisabledPublicOrganizationRedirectPath(slug);
    if (redirectPath) {
      redirect(redirectPath);
    }
    notFound();
  }

  return (
    <PublicRentalSelectionClient
      slug={slug}
      organization={data.rentalOrganization}
    />
  );
}
