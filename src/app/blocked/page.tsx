'use client';

import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function BlockedPage() {
  const { signOut, shop, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && shop && new Date(shop.expire_at) >= new Date() && shop.is_active) {
       router.push('/');
    }
  }, [shop, loading, router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <div className="text-center p-8 bg-white rounded-xl shadow-sm max-w-md w-full">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
        <p className="text-gray-600 mb-6">
          Your shop's subscription has expired or has been deactivated. Please contact support.
        </p>
        <button
          onClick={signOut}
          className="bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-800"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
