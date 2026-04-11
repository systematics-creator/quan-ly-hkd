'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

export default function ShopAdminSettings({ settings, onSettingsUpdated }: { settings: any, onSettingsUpdated: () => void }) {
  const { appUser } = useAuth();
  
  const [minKt, setMinKt] = useState(0);
  const [maxKt, setMaxKt] = useState(0);
  const [yearlyLimit, setYearlyLimit] = useState(0);

  useEffect(() => {
    if (settings) {
      setMinKt(settings.min_kt || 0);
      setMaxKt(settings.max_kt || 0);
      setYearlyLimit(settings.yearly_kt_limit || 0);
    }
  }, [settings]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser?.shop_id) return;

    if (settings?.id) {
      // update
      await supabase.from('shop_settings').update({
        min_kt: minKt,
        max_kt: maxKt,
        yearly_kt_limit: yearlyLimit
      }).eq('id', settings.id);
    } else {
      // insert
      await supabase.from('shop_settings').insert({
        shop_id: appUser.shop_id,
        min_kt: minKt,
        max_kt: maxKt,
        yearly_kt_limit: yearlyLimit
      });
    }

    alert('Lưu cấu hình thành công!');
    onSettingsUpdated();
  };

  if (appUser?.role !== 'admin') return null;

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mt-6">
      <h2 className="text-xl font-bold mb-4">Cấu Hình Shop (Dành cho Admin)</h2>
      <p className="text-gray-500 text-sm mb-6">Bạn cần nhập đầy đủ Số Tiền Tổng mẫu KT năm trong lần đầu tiên đăng nhập.</p>

      <form onSubmit={handleSaveSettings} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-semibold mb-1">Giới hạn Tối Thiểu (Mẫu KT)</label>
          <input 
            type="number" 
            value={minKt} 
            onChange={e => setMinKt(Number(e.target.value))}
            className="border p-2 rounded w-full"
          />
          <p className="text-xs text-gray-400 mt-1">Ví dụ: 1500000</p>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Giới hạn Tối Đa (Mẫu KT)</label>
          <input 
            type="number" 
            value={maxKt} 
            onChange={e => setMaxKt(Number(e.target.value))}
            className="border p-2 rounded w-full"
          />
          <p className="text-xs text-gray-400 mt-1">Ví dụ: 3500000</p>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1 text-red-600">Tổng Số Tiền Mẫu KT (Năm)</label>
          <input 
            type="number" 
            required
            value={yearlyLimit} 
            onChange={e => setYearlyLimit(Number(e.target.value))}
            className="border border-red-200 bg-red-50 p-2 rounded w-full font-bold"
          />
          <p className="text-xs text-red-400 mt-1">Tổng 12 tháng buộc phải <= số này.</p>
        </div>
        
        <div className="md:col-span-3">
          <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700">
            Cập nhật cấu hình
          </button>
        </div>
      </form>
    </div>
  );
}
