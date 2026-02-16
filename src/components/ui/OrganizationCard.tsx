'use client';

import React from 'react';
import Image from 'next/image';
import type { Organization } from '@/types';

interface OrganizationCardProps {
  organization: Organization;
  onClick?: () => void;
  actions?: React.ReactNode;
}

function getOrgLogoUrl(org: Organization, size: number = 56): string {
  if (org.logoId) {
    return `/api/files/${org.logoId}/preview?w=${size}&h=${size}&fit=cover`;
  }
  const initials = (org.name || 'Org').split(' ').map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase();
  return `/api/avatars/initials?name=${encodeURIComponent(initials)}&size=${size}`;
}

export default function OrganizationCard({ organization, onClick, actions }: OrganizationCardProps) {
  return (
    <div className={`card group ${onClick ? 'cursor-pointer hover:elevation-3' : ''} transition-all duration-200`} onClick={onClick}>
      <div className="card-content">
        <div className="flex items-start space-x-3 mb-4">
          <Image
            src={getOrgLogoUrl(organization, 56)}
            alt={organization.name}
            width={56}
            height={56}
            unoptimized
            className="w-14 h-14 rounded-full object-cover border-2 border-gray-200 group-hover:border-blue-300 transition-colors"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors truncate">
              {organization.name}
            </h3>
            {organization.website && (
              <a
                href={organization.website}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-blue-600 hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {organization.website}
              </a>
            )}
          </div>
          {actions && <div className="flex-shrink-0">{actions}</div>}
        </div>

        {organization.description && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-2">{organization.description}</p>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-200">
          <div className="flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {organization.location || '—'}
          </div>
          <div className="text-gray-400">Created {organization.$createdAt ? new Date(organization.$createdAt).toLocaleDateString() : '—'}</div>
        </div>
      </div>
    </div>
  );
}
