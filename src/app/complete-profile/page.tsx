'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Loading from '@/components/ui/Loading';
import { useApp } from '@/app/providers';
import { authService, type RequiredProfileField } from '@/lib/auth';
import { getHomePathForUser } from '@/lib/homePage';
import { userService } from '@/lib/userService';

const FIELD_LABELS: Record<RequiredProfileField, string> = {
  firstName: 'first name',
  lastName: 'last name',
  dateOfBirth: 'birthday',
};

const safeNextPath = (value: string | null): string | null => {
  if (!value) return null;
  const next = value.trim();
  if (!next.startsWith('/')) return null;
  if (next.startsWith('//')) return null;
  if (/[\r\n\t]/.test(next)) return null;
  if (next.startsWith('/login')) return null;
  if (next.startsWith('/complete-profile')) return null;
  return next;
};

function CompleteProfilePageContent() {
  const {
    user,
    authUser,
    loading,
    isAuthenticated,
    requiresProfileCompletion,
    missingProfileFields,
    setUser,
    refreshSession,
  } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const maxDob = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, []);

  const nextPath = safeNextPath(searchParams.get('next'));
  const userId = user?.$id ?? authUser?.$id ?? null;
  const missingSummary = useMemo(() => {
    if (!missingProfileFields.length) return null;
    return missingProfileFields.map((field) => FIELD_LABELS[field]).join(', ');
  }, [missingProfileFields]);

  useEffect(() => {
    if (user) {
      setFirstName((current) => current || user.firstName || '');
      setLastName((current) => current || user.lastName || '');
    }
  }, [user]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, loading, router]);

  useEffect(() => {
    if (!loading && isAuthenticated && !requiresProfileCompletion && user) {
      router.replace(nextPath ?? getHomePathForUser(user));
    }
  }, [isAuthenticated, loading, nextPath, requiresProfileCompletion, router, user]);

  const handleLogout = async () => {
    setSaving(true);
    setError('');
    try {
      await authService.logout();
      router.replace('/login');
    } catch (logoutError: any) {
      setError(logoutError?.message || 'Failed to log out.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId) return;

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedDob = dateOfBirth.trim();
    if (!normalizedFirstName || !normalizedLastName || !normalizedDob) {
      setError('First name, last name, and birthday are required.');
      return;
    }

    const parsedDob = new Date(`${normalizedDob}T00:00:00.000Z`);
    if (Number.isNaN(parsedDob.getTime())) {
      setError('Please provide a valid birthday.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const updatedUser = await userService.updateProfile(userId, {
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        dateOfBirth: parsedDob.toISOString(),
      });
      setUser(updatedUser);
      await refreshSession();
      router.replace(nextPath ?? getHomePathForUser(updatedUser));
    } catch (submitError: any) {
      setError(submitError?.message || 'Failed to update your profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !isAuthenticated || !userId) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-blue-50 px-4 py-10">
      <div className="mx-auto w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70">
        <div className="mb-8">
          <p className="mb-3 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
            One More Step
          </p>
          <h1 className="text-3xl font-semibold text-slate-900">Complete your profile</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            We need your first name, last name, and birthday before you can continue.
          </p>
          {missingSummary ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Missing: {missingSummary}.
            </p>
          ) : null}
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="firstName" className="mb-2 block text-sm font-medium text-slate-700">
              First Name
            </label>
            <input
              id="firstName"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              required
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="Enter your first name"
            />
          </div>

          <div>
            <label htmlFor="lastName" className="mb-2 block text-sm font-medium text-slate-700">
              Last Name
            </label>
            <input
              id="lastName"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              required
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="Enter your last name"
            />
          </div>

          <div>
            <label htmlFor="dateOfBirth" className="mb-2 block text-sm font-medium text-slate-700">
              Birthday
            </label>
            <input
              id="dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
              required
              max={maxDob}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Continue'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleLogout}
          disabled={saving}
          className="mt-4 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}

export default function CompleteProfilePage() {
  return (
    <Suspense fallback={<Loading />}>
      <CompleteProfilePageContent />
    </Suspense>
  );
}
