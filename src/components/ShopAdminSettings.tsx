'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { createUserWithRole } from '@/app/actions';

export default function ShopAdminSettings({ settings, onSettingsUpdated }: { settings: any, onSettingsUpdated: () => void }) {
  const { appUser, shop } = useAuth();
  
  const [minKt, setMinKt] = useState(0);
  const [maxKt, setMaxKt] = useState(0);
  const [yearlyLimit, setYearlyLimit] = useState(0);
  const [shopName, setShopName] = useState('');

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
      await supabase.from('shops').update({ name: shopName }).eq('id', appUser.shop_id);
      if (settings?.id) {
        await supabase.from('shop_settings').update({ min_kt: minKt, max_kt: maxKt, yearly_kt_limit: yearlyLimit }).eq('id', settings.id);
      } else {
        await supabase.from('shop_settings').insert({ shop_id: appUser.shop_id, min_kt: minKt, max_kt: maxKt, yearly_kt_limit: yearlyLimit });
      }
      alert('Lưu thành công!');
      onSettingsUpdated();
    } catch (err: any) { alert(err.message); }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appUser?.shop_id) return;
    setLoading(true);
    const res = await createUserWithRole(newUserEmail, newUserPass, newUserRole, appUser.shop_id);
    if (res.error) alert('Lỗi: ' + res.error);
    else { alert('Thành công!'); setNewUserEmail(''); setNewUserPass(''); fetchUsers(); }
    setLoading(false);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN').format(val || 0);
  };

  const handleCurrencyInput = (setter: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(Number(e.target.value.replace(/[^0-9]/g, '')));
  };

  const formatCurrencyDisplay = (val: number) => {
    return new Intl.NumberFormat('vi-VN').format(val || 0) + ' đ';
  };

  if (appUser?.role !== 'admin') return null;

  return (
    <div className="space-y-4 mt-4 text-xs">
      {/* 1. Cấu Hình Shop */}
      <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
        <h2 className="text-base font-bold mb-2 text-blue-800">Thiết Lập Cửa Hàng</h2>

        {(settings?.min_kt || settings?.max_kt || settings?.yearly_kt_limit) && (
          <div className="mb-3 rounded-md bg-blue-50/50 border border-blue-100 p-2">
            <h3 className="text-[10px] font-bold text-blue-700 mb-1.5 uppercase px-1">Cấu hình hiện tại</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="bg-white rounded border border-blue-50 p-1.5 text-center">
                <div className="text-[9px] text-gray-400">Min KT</div>
                <div className="font-bold text-blue-700 text-sm">{formatCurrencyDisplay(settings.min_kt)}</div>
              </div>
              <div className="bg-white rounded border border-blue-50 p-1.5 text-center">
                <div className="text-[9px] text-gray-400">Max KT</div>
                <div className="font-bold text-blue-700 text-sm">{formatCurrencyDisplay(settings.max_kt)}</div>
              </div>
              <div className="bg-white rounded border border-red-50 p-1.5 text-center col-span-2 sm:col-span-1">
                <div className="text-[9px] text-red-500">Năm (÷12)</div>
                <div className="font-bold text-red-600 text-sm">{formatCurrencyDisplay(settings.yearly_kt_limit)}</div>
              </div>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSaveSettings} className="space-y-2.5">
          <div>
            <label className="block text-[10px] font-bold mb-0.5 text-gray-400 uppercase">Tên Cửa Hàng</label>
            <input 
              type="text" required value={shopName} onChange={e => setShopName(e.target.value)}
              className="border border-gray-200 p-2 rounded-md w-full font-bold text-sm outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold mb-0.5 text-gray-400 uppercase">Min KT (đ)</label>
              <input 
                type="text" value={formatCurrency(minKt)} onChange={handleCurrencyInput(setMinKt)}
                className="border border-gray-200 p-2 rounded-md w-full text-sm outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-0.5 text-gray-400 uppercase">Max KT (đ)</label>
              <input 
                type="text" value={formatCurrency(maxKt)} onChange={handleCurrencyInput(setMaxKt)}
                className="border border-gray-200 p-2 rounded-md w-full text-sm outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold mb-0.5 text-red-500 uppercase">KT Năm (đ)</label>
            <input 
              type="text" required value={formatCurrency(yearlyLimit)} onChange={handleCurrencyInput(setYearlyLimit)}
              className="border border-red-100 bg-red-50 p-2 rounded-md w-full font-bold text-red-600 text-sm outline-none"
            />
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-md font-bold text-sm active:scale-95 shadow-sm">
            Cập nhật cấu hình
          </button>
        </form>
      </div>

      {/* 2. Quản Lý Nhân Sự */}
      <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
        <h2 className="text-base font-bold mb-2 text-gray-800">Nhân Sự</h2>
        <form onSubmit={handleCreateUser} className="space-y-2 mb-3 bg-gray-50/50 p-2 rounded border border-gray-100">
          <input 
            type="email" placeholder="Email (Tài khoản)" required value={newUserEmail}
            onChange={e => setNewUserEmail(e.target.value)}
            className="border border-gray-200 p-2 rounded-md w-full text-sm outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <input 
              type="text" placeholder="Mật khẩu" required value={newUserPass}
              onChange={e => setNewUserPass(e.target.value)}
              className="border border-gray-200 p-2 rounded-md w-full text-sm outline-none"
            />
            <select 
              value={newUserRole} onChange={e => setNewUserRole(e.target.value)}
              className="border border-gray-200 p-2 rounded-md w-full text-sm bg-white outline-none"
            >
              <option value="user">Nhân Viên</option>
              <option value="manager">Quản Lý</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit" disabled={loading} className="w-full bg-green-600 text-white py-2 rounded-md font-bold text-sm disabled:bg-gray-400">
            {loading ? '...' : '+ Cấp quyền'}
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-gray-50 border-b">
              <tr className="text-[9px] uppercase font-bold text-gray-400">
                <th className="p-2">Email</th>
                <th className="p-2 text-center">Vai trò</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.id}>
                  <td className="p-2 text-gray-700 truncate max-w-[140px]">{u.email}</td>
                  <td className="p-2 text-center uppercase text-[9px] font-bold text-gray-500">{u.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
