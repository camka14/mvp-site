'use client';

import React from 'react';
import Image from 'next/image';
import { Building2, CalendarDays, UsersRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Organization, OrganizationFeature } from '@/types';

interface OrganizationCardProps {
  organization: Organization;
  onClick?: () => void;
  actions?: React.ReactNode;
}

function getOrgLogoUrl(org: Organization, size: number = 56): string {
  if (org.logoId) {
    return `/api/files/${org.logoId}/preview?w=${size}&h=${size}&fit=cover`;
  }
  const label = (org.name || 'Org').trim() || 'Org';
  return `/api/avatars/initials?name=${encodeURIComponent(label)}&size=${size}`;
}

const formatDivisionPrice = (price: number): string => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: price % 100 === 0 ? 0 : 2,
  maximumFractionDigits: 2,
}).format(price / 100);

const ORGANIZATION_FEATURE_BADGES: Array<{
  feature: OrganizationFeature;
  label: string;
  Icon: LucideIcon;
}> = [
  { feature: 'CLUB_TEAMS', label: 'Club & Teams', Icon: UsersRound },
  { feature: 'FACILITIES_RENTALS', label: 'Rentals', Icon: Building2 },
  { feature: 'EVENT_MANAGEMENT', label: 'Events', Icon: CalendarDays },
];

export const getOrganizationFeatureBadgeLabels = (
  enabledFeatures?: OrganizationFeature[],
): string[] => {
  if (!Array.isArray(enabledFeatures)) return [];
  return ORGANIZATION_FEATURE_BADGES
    .filter(({ feature }) => enabledFeatures.includes(feature))
    .map(({ label }) => label);
};

export const formatOrganizationDivisionSummary = (organization: Organization): string => {
  const summary = organization.divisionSummary;
  const count = summary?.count ?? organization.divisions?.length ?? 0;
  const countLabel = `${count} division${count === 1 ? '' : 's'}`;
  if (summary?.minPrice === null || summary?.minPrice === undefined) {
    return count > 0 ? `${countLabel} · Price not specified` : countLabel;
  }
  const minPrice = formatDivisionPrice(summary.minPrice);
  const maxPrice = summary.maxPrice === null || summary.maxPrice === undefined
    ? minPrice
    : formatDivisionPrice(summary.maxPrice);
  return `${countLabel} · ${minPrice === maxPrice ? minPrice : `${minPrice}–${maxPrice}`}`;
};

export default function OrganizationCard({ organization, onClick, actions }: OrganizationCardProps) {
  return (
    <div
      className={`card group ${onClick ? 'cursor-pointer hover:elevation-3' : ''} transition-all duration-200 border border-slate-200/80`}
      onClick={onClick}
    >
      <div className="card-content">
        <div className="flex items-start space-x-3 mb-4">
          <Image
            src={getOrgLogoUrl(organization, 56)}
            alt={organization.name}
            width={56}
            height={56}
            unoptimized
            className="w-14 h-14 rounded-full object-cover border-2 border-slate-200 group-hover:border-slate-300 transition-colors"
          />
          <div className="flex-1 min-w-0">
            <div className="mb-1">
              <h3 className="min-w-0 truncate text-lg font-semibold text-slate-900 transition-colors group-hover:text-slate-950">
                {organization.name}
              </h3>
            </div>
            {organization.website && (
              <a
                href={organization.website}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-blue-700 hover:text-blue-800 hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {organization.website}
              </a>
            )}
            {getOrganizationFeatureBadgeLabels(organization.enabledFeatures).length > 0 && (
              <div
                className="mt-2 flex flex-wrap gap-1.5"
                data-testid="organization-card-badges"
              >
                {ORGANIZATION_FEATURE_BADGES
                  .filter(({ feature }) => organization.enabledFeatures?.includes(feature))
                  .map(({ feature, label, Icon }) => (
                    <span
                      key={feature}
                      className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-medium text-slate-700"
                    >
                      <Icon aria-hidden="true" className="h-3.5 w-3.5 text-[#294c70]" strokeWidth={2} />
                      {label}
                    </span>
                  ))}
              </div>
            )}
          </div>
          {actions && <div className="flex-shrink-0">{actions}</div>}
        </div>

        {organization.description && (
          <p className="text-slate-600 text-sm mb-3 line-clamp-2">{organization.description}</p>
        )}

        <div className="space-y-3 border-t border-slate-200 pt-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {organization.location || '—'}
            </div>
            <div className="text-right text-slate-500">{formatOrganizationDivisionSummary(organization)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
