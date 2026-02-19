'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/app/providers';
import { authService } from '@/lib/auth';
import { NavItem } from '@/types';

const baseNav: NavItem[] = [
  { label: 'Discover', href: '/discover' },
  { label: 'My Organizations', href: '/organizations' },
  { label: 'Profile', href: '/profile' },
];

export default function Navigation() {
  const { authUser, setUser, setAuthUser, isGuest } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRazumlyAdmin, setIsRazumlyAdmin] = useState(false);

  const handleLogout = async () => {
    try {
      await authService.logout();
      setUser(null);
      setAuthUser(null);
      setIsMenuOpen(false);
      router.replace('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const checkAdmin = async () => {
      if (isGuest) {
        if (!cancelled) setIsRazumlyAdmin(false);
        return;
      }

      try {
        const res = await fetch('/api/admin/access', { credentials: 'include' });
        if (!res.ok) {
          if (!cancelled) setIsRazumlyAdmin(false);
          return;
        }
        const payload = await res.json().catch(() => ({}));
        if (!cancelled) {
          setIsRazumlyAdmin(Boolean(payload?.allowed));
        }
      } catch {
        if (!cancelled) {
          setIsRazumlyAdmin(false);
        }
      }
    };

    void checkAdmin();
    return () => {
      cancelled = true;
    };
  }, [isGuest, authUser?.$id]);

  if (!authUser) return null;

  const items = isGuest
    ? baseNav.filter(i => i.href === '/discover')
    : (
      isRazumlyAdmin
        ? [...baseNav, { label: 'Admin', href: '/admin' }]
        : baseNav
    );

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="container-responsive">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/discover" className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ background: 'var(--ocean-primary)' }}>
              <span className="text-white font-bold text-lg">M</span>
            </div>
            <span className="text-xl font-bold text-slate-900">MVP</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`font-medium transition-colors duration-200 ${(pathname === item.href || pathname.startsWith(item.href + '/'))
                    ? 'text-blue-700'
                    : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            {isGuest ? (
              <>
                <Link href="/login" className="btn-ghost text-sm">Login / Signup</Link>
                {/* Mobile Menu Button */}
                <button
                  className="md:hidden p-2"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <div className="hidden md:flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                    {(authUser.name || authUser.email.split('@')[0]).slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-slate-800">
                    {authUser.name || authUser.email.split('@')[0]}
                  </span>
                </div>

                <button
                  onClick={handleLogout}
                  className="btn-ghost text-sm"
                >
                  Logout
                </button>

                {/* Mobile Menu Button */}
                <button
                  className="md:hidden p-2"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-gray-200 py-2">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block py-2 px-4 font-medium ${(pathname === item.href || pathname.startsWith(item.href + '/'))
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
