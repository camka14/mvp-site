import { notFound } from 'next/navigation';
import { getPublicOrganizationProductForCheckout } from '@/server/publicOrganizationCatalog';
import PublicProductCheckoutClient from './PublicProductCheckoutClient';

export const dynamic = 'force-dynamic';

export default async function PublicProductCheckoutPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await params;
  const data = await getPublicOrganizationProductForCheckout(slug, productId);
  if (!data) {
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
