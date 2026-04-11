'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { createUserWithRole } from '@/app/actions';

export default function ShopAdminSettings({ settings, onSettingsUpdated }: { settings: any, onSettingsUpdated: () => void }) {
  const { appUser, shop } = useAuth();
  
  // Settings Mode
  const [minKt, setMinKt] = useState(0);
  const [maxKt, setMaxKt] = useState(0);
  const [yearlyLimit, setYearlyLimit] = useState(0);
  const [shopName, setShopName] = useState('');

  // User Management
  const [users, setUsers] = useState<any[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [newUserRole, setNewUserRole] = useState('user');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (settings) {
      setMinKt(settings.min_kt || 0);
      setMaxKt(settings.max_kt || 0);
      setYearlyLimit(settings.yearly_kt_limit || 0);
    }
    if (shop) {
      setShopName(shop.name || '');
      fetchUsers();
    }
  }, [settings, shop]);

  const fetchUsers = async () => {
    if (!appUser?.shop_id) return;
    const { data } = await supabase.from('users').select('*').eq('shop_id', appUser.shop_id);
    if (data) setUsers(data);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser?.shop_id) return;

    try {
      // Save Shop name
      const { error: shopError } = await supabase.from('shops').update({ name: shopName }).eq('id', appUser.shop_id);
      if (shopError) throw new Error("Lỗi cập nhật tên shop: " + shopError.message);

      // Save Settings
      if (settings?.id) {
        const { error: setErr } = await supabase.from('shop_settings').update({
          min_kt: minKt,
          max_kt: maxKt,
          yearly_kt_limit: yearlyLimit
        }).eq('id', settings.id);
        if (setErr) throw new Error("Lỗi cập nhật thiết lập: " + setErr.message);
      } else {
        const { error: insErr } = await supabase.from('shop_settings').insert({
          shop_id: appUser.shop_id,
          min_kt: minKt,
          max_kt: maxKt,
          yearly_kt_limit: yearlyLimit
        });
        if (insErr) throw new Error("Lỗi tạo mới thiết lập: " + insErr.message);
      }

      alert('Lưu cấu hình và thông tin thành công!');
      onSettingsUpdated();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser?.shop_id) return;
    setLoading(true);

    const res = await createUserWithRole(newUserEmail, newUserPass, newUserRole, appUser.shop_id);
    
    if (res.error) {
      alert('Lỗi tạo user: ' + res.error);
    } else {
      alert('Đã tạo user thành công!');
      setNewUserEmail('');
      setNewUserPass('');
      fetchUsers();
    }
    setLoading(false);
  };

  const formatCurrency = (val: number) => {
    if (!val) return '';
    return new Intl.NumberFormat('vi-VN').format(val);
  };

  const handleCurrencyInput = (setter: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '');
    setter(Number(rawValue));
  };

  if (appUser?.role !== 'admin') return null;

  const formatCurrencyDisplay = (val: number) => {
    if (!val) return '0 đ';
    return new Intl.NumberFormat('vi-VN').format(val) + ' đ';
  };

  return (
    <div className="space-y-6 mt-6">
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <h2 className="text-xl font-bold mb-4">Cấu Hình Shop & Giới Hạn</h2>

        {/* Current config summary */}
        {(settings?.min_kt || settings?.max_kt || settings?.yearly_kt_limit) && (
          <div className="mb-6 rounded-xl bg-blue-50 border border-blue-100 p-4">
            <h3 className="text-sm font-bold text-blue-700 mb-3 uppercase tracking-wide">Cấu hình hiện tại</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
                <div className="text-xs text-gray-500 mb-1">Giới Hạn Tối Thiểu</div>
                <div className="font-bold text-blue-700 text-lg">{formatCurrencyDisplay(settings.min_kt)}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
                <div className="text-xs text-gray-500 mb-1">Giới Hạn Tối Đa</div>
                <div className="font-bold text-blue-700 text-lg">{formatCurrencyDisplay(settings.max_kt)}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-red-100 text-center">
                <div className="text-xs text-gray-500 mb-1">Tổng Năm (÷12/tháng)</div>
                <div className="font-bold text-red-600 text-lg">{formatCurrencyDisplay(settings.yearly_kt_limit)}</div>
                <div className="text-xs text-gray-400">{formatCurrencyDisplay(Math.round(settings.yearly_kt_limit / 12))}/tháng</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-500 text-center">Tên shop: <span className="font-semibold text-gray-700">{shopName || shop?.name}</span></div>
          </div>
        )}
        
        <form onSubmit={handleSaveSettings} className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold mb-1 text-blue-700">Tên Đầy Đủ Của Cửa Hàng</label>
            <input 
              type="text" 
              required
              value={shopName} 
              onChange={e => setShopName(e.target.value)}
              className="border p-2 rounded w-full font-bold"
              placeholder="Ví dụ: Đại Lý Yến Sào Chi Nhánh A"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Giới hạn Tiền Tối Thiểu (Mẫu KT)</label>
            <div className="relative">
              <input 
                type="text" 
                value={formatCurrency(minKt)} 
                onChange={handleCurrencyInput(setMinKt)}
                className="border p-2 rounded w-full pr-10"
              />
              <span className="absolute right-3 top-2.5 text-gray-500 font-medium">đ</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Giới hạn Tiền Tối Đa (Mẫu KT)</label>
            <div className="relative">
              <input 
                type="text" 
                value={formatCurrency(maxKt)} 
                onChange={handleCurrencyInput(setMaxKt)}
                className="border p-2 rounded w-full pr-10"
              />
              <span className="absolute right-3 top-2.5 text-gray-500 font-medium">đ</span>
            </div>
          </div>
          <div className="md:col-span-2 border-t pt-4">
            <label className="block text-sm font-semibold mb-1 text-red-600">Tổng Tiền - Mẫu KT Phải Đạt Trong Năm</label>
            <div className="relative md:w-1/2">
              <input 
                type="text" 
                required
                value={formatCurrency(yearlyLimit)} 
                onChange={handleCurrencyInput(setYearlyLimit)}
                className="border border-red-200 bg-red-50 p-2 rounded w-full font-bold pr-10"
              />
              <span className="absolute right-3 top-2.5 text-red-600 font-bold">đ</span>
            </div>
          </div>
          
          <div className="md:col-span-2">
            <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700">
              Cập nhật cấu hình
            </button>
          </div>
        </form>
      </div>

      {/* USER MANAGEMENT */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <h2 className="text-xl font-bold mb-4">Quản Lý Nhân Sự (Tài Khoản)</h2>
        
        <form onSubmit={handleCreateUser} className="flex flex-wrap gap-4 mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <input 
            type="email" 
            placeholder="Email (Tài khoản)" 
            required
            value={newUserEmail}
            onChange={e => setNewUserEmail(e.target.value)}
            className="border p-2 rounded flex-1 min-w-[200px]"
          />
          <input 
            type="text" 
            placeholder="Mật khẩu" 
            required
            value={newUserPass}
            onChange={e => setNewUserPass(e.target.value)}
            className="border p-2 rounded flex-1 min-w-[150px]"
          />
          <select 
            value={newUserRole} 
            onChange={e => setNewUserRole(e.target.value)}
            className="border p-2 rounded shrink-0 bg-white"
          >
            <option value="user">Nhân Viên (User)</option>
            <option value="manager">Quản Lý (Manager)</option>
            <option value="admin">Admin Cửa Hàng</option>
          </select>
          <button type="submit" disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded font-medium hover:bg-green-700 disabled:bg-gray-400">
            {loading ? 'Đang tạo...' : '+ Cấp quyền'}
          </button>
        </form>

        <h3 className="font-semibold mb-2">Danh Sách User Sở Hữu Thuộc Shop Này</h3>
        <table className="w-full text-left bg-white border">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="p-2">Email</th>
              <th className="p-2">Vai trò (Role)</th>
              <th className="p-2">Ngày Tạo</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b hover:bg-gray-50">
                <td className="p-2">{u.email}</td>
                <td className="p-2 uppercase text-sm font-semibold text-gray-600">{u.role}</td>
                <td className="p-2">{new Date(u.created_at).toLocaleDateString('vi-VN')}</td>
              </tr>
            ))}
          </tbody>
        </table>

      </div>
    </div>
  );
}
