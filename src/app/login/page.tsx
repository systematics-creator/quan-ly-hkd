'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [storeCode, setStoreCode] = useState(''); 
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    // 1. SignIn with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      setError('Tài khoản hoặc mật khẩu không chính xác.');
      setLoading(false);
      return;
    }

    // 2. Fetch User Custom Role & Shop_ID
    const { data: userData } = await supabase
      .from('users')
      .select('role, shop_id')
      .eq('id', authData.user.id)
      .single();

    if (userData?.role === 'super_admin') {
      // Super admin can login without Store Code
      router.push('/');
      return;
    }

    if (!storeCode.trim()) {
      await supabase.auth.signOut();
      setError('Vui lòng nhập Mã Cửa Hàng MS!');
      setLoading(false);
      return;
    }

    // 3. Verify Store Code
    const { data: shopData } = await supabase
      .from('shops')
      .select('store_code')
      .eq('id', userData?.shop_id)
      .single();

    if (!shopData || shopData.store_code.toUpperCase() !== storeCode.toUpperCase()) {
      await supabase.auth.signOut(); // Kick out
      setError('Mã Cửa Hàng MS không hợp lệ cho tài khoản này!');
      setLoading(false);
      return;
    }

    // Success
    router.push('/');
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-blue-50/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl border border-gray-100 relative overflow-hidden">
        
        {/* Decorator */}
        <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>

        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Đăng Nhập Quản Lý</h1>
          <p className="text-sm text-gray-500">Vui lòng nhập thông tin được cấp để truy cập</p>
        </div>
        
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600 border border-red-100 flex items-center">
            <span className="font-semibold">{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Tên Cửa Hàng MS (Mã Shop)</label>
            <input
              type="text"
              value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all font-bold text-blue-800 uppercase"
              placeholder="Ví dụ: 12ABC"
            />
            <p className="text-xs text-gray-400 mt-1">Bỏ trống nếu bạn là Admin Tổng</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Email / Tài khoản</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:bg-blue-300 transition-all mt-4"
          >
            {loading ? 'Đang xác thực...' : 'Đăng Nhập Vào Hệ Thống'}
          </button>
        </form>
      </div>
    </div>
  );
}
