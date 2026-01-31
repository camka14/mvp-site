'use client';

import { useRouter } from 'next/navigation';

export default function VerifyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl font-bold text-white">M</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Verification Not Required</h1>
        <p className="text-gray-600 mt-2">
          Email verification is not required for this app. You can continue to the app now.
        </p>
        <button
          type="button"
          onClick={() => router.push('/discover')}
          className="w-full mt-6 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          Continue to App
        </button>
      </div>
    </div>
  );
}
