'use client';

import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LogOut } from 'lucide-react';
import SuperAdminDashboard from '@/components/SuperAdminDashboard';
import DailyEntryForm from '@/components/DailyEntryForm';
import ShopAdminSettings from '@/components/ShopAdminSettings';

export default function DashboardPage() {
  const { user, appUser, shop, loading, signOut } = useAuth();
  const router = useRouter();

  // Settings
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (appUser && appUser.role !== 'super_admin' && appUser.shop_id) {
      fetchSettings();
    }
  }, [appUser]);

  const fetchSettings = async () => {
    if (!appUser?.shop_id) return;
    const { data } = await supabase.from('shop_settings').select('*').eq('shop_id', appUser.shop_id).single();
    if (data) setSettings(data);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-gray-500 font-medium">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (appUser?.role === 'super_admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-red-600">Hệ Thống Phân Cấp (Super Admin)</h1>
          </div>
          <button onClick={signOut} className="flex items-center text-gray-600 hover:text-red-600 font-medium">
            <LogOut className="w-5 h-5 mr-2" /> Đăng xuất
          </button>
        </header>
        <main className="flex-1 max-w-7xl w-full mx-auto p-6">
           <SuperAdminDashboard />
        </main>
      </div>
    );
  }

  // SHOP DASHBOARD (Admin, Manager, User)
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-blue-800">{shop?.name || 'Dashboard'}</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Vai trò của bạn: <span className="text-blue-600 uppercase">{appUser?.role}</span></p>
        </div>
        <button onClick={signOut} className="flex items-center text-gray-600 hover:text-red-600 font-medium">
          <LogOut className="w-5 h-5 mr-2" /> Đăng xuất
        </button>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* Daily Input Form - Accessible to everyone */}
        <DailyEntryForm settings={settings} />

        {/* Shop Admin Settings */}
        {appUser?.role === 'admin' && (
           <ShopAdminSettings settings={settings} onSettingsUpdated={fetchSettings} />
        )}

      </main>
    </div>
  );
}
