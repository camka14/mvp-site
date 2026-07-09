import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import BlogStructuredData from '@/components/blog/BlogStructuredData';
import { absoluteUrl } from '@/server/publicSearchSeo';
import {
  createRegularOrganizationStructuredData,
  getRegularOrganizationSeoData,
} from '@/server/publicSearchPages';

export const dynamic = 'force-dynamic';

type OrganizationProfileLayoutProps = {
  children: ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: OrganizationProfileLayoutProps): Promise<Metadata> {
  const { id } = await params;
  const organization = await getRegularOrganizationSeoData(id);
  if (!organization) {
    return {
      title: 'Organization | BracketIQ',
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  const title = `${organization.name} Sports Organization | BracketIQ`;
  return {
    title,
    description: organization.description,
    alternates: {
      canonical: organization.canonicalPath,
    },
    robots: {
      index: organization.indexable,
      follow: true,
    },
    openGraph: {
      title,
      description: organization.description,
      url: absoluteUrl(organization.canonicalPath),
      type: 'website',
      images: [
        {
          url: absoluteUrl(organization.logoUrl),
          width: 240,
          height: 240,
          alt: `${organization.name} on BracketIQ`,
        },
      ],
    },
    twitter: {
      card: 'summary',
      title,
      description: organization.description,
      images: [absoluteUrl(organization.logoUrl)],
    },
  };
}

export default async function OrganizationProfileLayout({
  children,
  params,
}: OrganizationProfileLayoutProps) {
  const { id } = await params;
  const organization = await getRegularOrganizationSeoData(id);
  return (
    <>
      {children}
      {organization?.indexable ? (
        <BlogStructuredData data={createRegularOrganizationStructuredData(organization)} />
      ) : null}
    </>
  );
}
