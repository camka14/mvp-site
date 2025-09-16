'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authService } from '@/lib/auth';

export default function VerifyPage() {
  const params = useSearchParams();
  const router = useRouter();
  const userId = useMemo(() => params.get('userId') || '', [params]);
  const secret = useMemo(() => params.get('secret') || '', [params]);
  const hasToken = !!userId && !!secret;

  const [state, setState] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!hasToken) return;
      setState('verifying');
      setMessage('Confirming your email…');
      try {
        await authService.confirmVerification(userId, secret);
        setState('success');
        setMessage('Email verified successfully. You can continue.');
      } catch (e: any) {
        setState('error');
        setMessage(e?.message || 'Failed to verify email.');
      }
    };
    run();
  }, [hasToken, userId, secret]);

  const handleResend = async () => {
    setResending(true);
    try {
      await authService.resendVerification();
      setMessage('Verification email sent. Please check your inbox.');
    } catch (e: any) {
      setMessage(e?.message || 'Failed to send verification email.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-bold text-white">M</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Email Verification</h1>
          <p className="text-gray-600 mt-2">
            {hasToken ? 'Finalizing your verification…' : 'Check your email for a verification link.'}
          </p>
        </div>

        {/* Status box */}
        {message && (
          <div className={`rounded-lg p-4 mb-4 ${
            state === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
            state === 'error' ? 'bg-red-50 border border-red-200 text-red-800' :
            'bg-gray-50 border border-gray-200 text-gray-800'
          }`}>
            <p className="text-sm">{message}</p>
          </div>
        )}

        {!hasToken && (
          <>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {resending ? 'Sending…' : 'Resend Verification Email'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="w-full mt-3 border border-gray-300 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Back to Login
            </button>
          </>
        )}

        {state === 'success' && (
          <button
            type="button"
            onClick={() => router.push('/events')}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Continue to App
          </button>
        )}
      </div>
    </div>
  );
}

