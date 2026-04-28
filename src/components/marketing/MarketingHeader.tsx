'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useApp } from '@/app/providers';
import { getHomePathForUser } from '@/lib/homePage';

const marketingNavItems = [
  { label: 'Platform', href: '#platform' },
  { label: 'Operations', href: '#operations' },
  { label: 'Integrations', href: '#integrations' },
  { label: 'Fees', href: '#fees' },
  { label: 'Resources', href: '#resources' },
];

type MarketingHeaderProps = {
  brandHref?: string;
  anchorHrefPrefix?: '' | '/';
  hideRequestDemoCta?: boolean;
};

const resolveAnchorHref = (href: string, prefix: '' | '/') => (
  prefix ? `${prefix}${href}` : href
);

export default function MarketingHeader({
  brandHref = '/',
  anchorHrefPrefix = '',
  hideRequestDemoCta = false,
}: MarketingHeaderProps) {
  const { user, isAuthenticated, isGuest } = useApp();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const appHref = getHomePathForUser(user);
  const showAppCta = isAuthenticated && !isGuest;

  const closeMobileMenu = () => setIsMobileMenuOpen(false);
  const navItems = marketingNavItems.map((item) => ({
    ...item,
    href: resolveAnchorHref(item.href, anchorHrefPrefix),
  }));

  return (
    <header className="landing-header sticky top-0 z-30">
      <div className="container-responsive py-3">
        <div className="landing-header-shell flex min-h-14 items-center justify-between gap-4 px-3 sm:px-4">
          <Link href={brandHref} className="landing-brand inline-flex items-center gap-3" onClick={closeMobileMenu}>
            <Image
              src="/BIQ_drawing.svg"
              alt="BracketIQ logo"
              width={44}
              height={44}
              className="landing-brand-mark"
              priority
            />
            <span className="landing-brand-name">BracketIQ</span>
          </Link>

          <nav className="landing-nav hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="landing-nav-link">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center justify-end gap-2 md:flex">
            {showAppCta ? (
              <>
                {!hideRequestDemoCta ? (
                  <Link href="/request-demo" className="landing-btn-secondary landing-btn-compact">
                    Request demo
                  </Link>
                ) : null}
                <Link href={appHref} className="landing-btn-primary landing-btn-compact">
                  Go to app
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="landing-btn-secondary landing-btn-compact">
                  Sign in
                </Link>
                {!hideRequestDemoCta ? (
                  <Link href="/request-demo" className="landing-btn-secondary landing-btn-compact">
                    Request demo
                  </Link>
                ) : null}
                <Link href="/login" className="landing-btn-primary landing-btn-compact">
                  Sign up
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="landing-menu-button inline-flex md:hidden"
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileMenuOpen}
            onClick={() => setIsMobileMenuOpen((open) => !open)}
          >
            {isMobileMenuOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
          </button>
        </div>

        {isMobileMenuOpen ? (
          <div className="landing-mobile-menu md:hidden">
            <nav className="grid gap-2" aria-label="Mobile navigation">
              {navItems.map((item) => (
                <a key={item.href} href={item.href} className="landing-mobile-nav-link" onClick={closeMobileMenu}>
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="mt-4 grid gap-2">
              {showAppCta ? (
                <>
                  {!hideRequestDemoCta ? (
                    <Link href="/request-demo" className="landing-btn-secondary landing-btn-full" onClick={closeMobileMenu}>
                      Request demo
                    </Link>
                  ) : null}
                  <Link href={appHref} className="landing-btn-primary landing-btn-full" onClick={closeMobileMenu}>
                    Go to app
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/login" className="landing-btn-secondary landing-btn-full" onClick={closeMobileMenu}>
                    Sign in
                  </Link>
                  {!hideRequestDemoCta ? (
                    <Link href="/request-demo" className="landing-btn-secondary landing-btn-full" onClick={closeMobileMenu}>
                      Request demo
                    </Link>
                  ) : null}
                  <Link href="/login" className="landing-btn-primary landing-btn-full" onClick={closeMobileMenu}>
                    Sign up
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </Link>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
