import { notFound, permanentRedirect, redirect } from 'next/navigation';
import {
  getDisabledPublicOrganizationRedirectPath,
  getPublicOrganizationProductForCheckout,
  getPublicOrganizationRedirectPath,
} from '@/server/publicOrganizationCatalog';
import PublicProductCheckoutClient from './PublicProductCheckoutClient';

export const dynamic = 'force-dynamic';

export default async function PublicProductCheckoutPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await params;
  const canonicalRedirectPath = await getPublicOrganizationRedirectPath(slug, {
    suffix: `/products/${encodeURIComponent(productId)}`,
  });
  if (canonicalRedirectPath) {
    if (canonicalRedirectPath.startsWith('/o/')) {
      permanentRedirect(canonicalRedirectPath);
    }
    redirect(canonicalRedirectPath);
  }
  const data = await getPublicOrganizationProductForCheckout(slug, productId);
  if (!data) {
    const redirectPath = await getDisabledPublicOrganizationRedirectPath(slug);
    if (redirectPath) {
      redirect(redirectPath);
    }
    notFound();
  }

  return (
    <PublicProductCheckoutClient
      slug={slug}
      organization={data.organization}
      product={data.product}
    />
  );
}
