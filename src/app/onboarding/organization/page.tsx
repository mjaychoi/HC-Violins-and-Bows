'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

function OrganizationOnboardingFallback() {
  return (
    <div className="min-h-screen bg-gray-50 px-6 py-16">
      <div className="mx-auto max-w-3xl rounded-3xl border border-gray-200 bg-white p-10 shadow-sm">
        <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mt-6 h-10 w-3/4 animate-pulse rounded bg-gray-100" />
        <div className="mt-4 h-4 w-full animate-pulse rounded bg-gray-100" />
        <div className="mt-3 h-4 w-5/6 animate-pulse rounded bg-gray-100" />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

function OrganizationOnboardingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, hasOrgContext, role, signOut } = useAuth();
  const next = searchParams.get('next');
  const nextDestination =
    next && next.startsWith('/') && !next.startsWith('//')
      ? decodeURIComponent(next)
      : '/dashboard';

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/');
      return;
    }

    if (!loading && user && hasOrgContext) {
      router.replace(nextDestination);
    }
  }, [hasOrgContext, loading, nextDestination, router, user]);

  if (loading) {
    return <OrganizationOnboardingFallback />;
  }

  if (!user || hasOrgContext) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Redirecting...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-white px-6 py-16">
      <div className="mx-auto max-w-4xl rounded-3xl border border-amber-200 bg-white p-10 shadow-sm">
        <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
          Organization Setup Required
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-gray-900">
          Your account needs an organization before you can use the app
        </h1>
        <p className="mt-4 text-base leading-7 text-gray-600">
          Inventory, invoices, sales, and client records are all scoped to an
          organization. Until your account is connected, protected screens stay
          locked to prevent partial access and failed submissions.
        </p>

        <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">
            Why this screen is blocking access
          </h2>
          <p className="mt-3 text-sm leading-6 text-gray-700">
            Every client, instrument, invoice, sale, and task belongs to an
            organization. Without an active organization, the app would open
            screens that cannot load or save correctly. This gate stops that
            broken flow before it starts.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <section className="rounded-2xl border border-gray-200 p-5">
            <div className="text-sm font-semibold text-gray-900">
              Select organization
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              If your account has already been assigned, refresh and continue to
              your workspace automatically.
            </p>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="mt-5 inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Refresh organization access
            </button>
          </section>

          <section className="rounded-2xl border border-gray-200 p-5">
            <div className="text-sm font-semibold text-gray-900">
              Join via invite
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Use the invited email address and complete the invitation flow, or
              ask your administrator to resend the invite.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Open signup
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Sign out
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 p-5">
            <div className="text-sm font-semibold text-gray-900">
              Create organization
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Start a new organization if your account is allowed to create one.
            </p>
            {role === 'admin' ? (
              <Link
                href="/signup"
                className="mt-5 inline-flex h-10 items-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Start organization setup
              </Link>
            ) : (
              <div className="mt-5 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                Organization creation is not enabled for this account.
              </div>
            )}
          </section>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-6">
          <button
            type="button"
            onClick={() => router.replace('/')}
            className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Back to sign in
          </button>
          <span className="text-sm text-gray-500">
            Once your organization is available, you will be sent back to your
            normal workspace automatically.
          </span>
        </div>
      </div>
    </main>
  );
}

export default function OrganizationOnboardingPage() {
  return (
    <Suspense fallback={<OrganizationOnboardingFallback />}>
      <OrganizationOnboardingPageContent />
    </Suspense>
  );
}
