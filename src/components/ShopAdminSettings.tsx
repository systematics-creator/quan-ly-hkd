'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { createUserWithRole, updateUserInShop, deleteUserFromShop } from '@/app/actions';

export default function ShopAdminSettings({ settings, onSettingsUpdated }: { settings: any, onSettingsUpdated: () => void }) {
  const { appUser, shop } = useAuth();
  
  const [minKt, setMinKt] = useState(0);
  const [maxKt, setMaxKt] = useState(0);
  const [yearlyLimit, setYearlyLimit] = useState(0);
  const [shopName, setShopName] = useState('');
  
  const [raMin, setRaMin] = useState(1800000);
  const [raMax, setRaMax] = useState(2300000);
  const [rbMin, setRbMin] = useState(2300000);
  const [rbMax, setRbMax] = useState(3400000);

  const [users, setUsers] = useState<any[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [newUserRole, setNewUserRole] = useState('user');
  const [loading, setLoading] = useState(false);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserPass, setEditUserPass] = useState('');
  const [editUserRole, setEditUserRole] = useState('user');

  useEffect(() => {
    if (settings) {
      setMinKt(settings.min_kt || 0);
      setMaxKt(settings.max_kt || 0);
      setYearlyLimit(settings.yearly_kt_limit || 0);
      setRaMin(settings.range_a_min || 1800000);
      setRaMax(settings.range_a_max || 2300000);
      setRbMin(settings.range_b_min || 2300000);
      setRbMax(settings.range_b_max || 3400000);
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
      const payload = { 
        min_kt: minKt, 
        max_kt: maxKt, 
        yearly_kt_limit: yearlyLimit,
        range_a_min: raMin,
        range_a_max: raMax,
        range_b_min: rbMin,
        range_b_max: rbMax
      };
      if (settings?.id) {
        await supabase.from('shop_settings').update(payload).eq('id', settings.id);
      } else {
        await supabase.from('shop_settings').insert({ shop_id: appUser.shop_id, ...payload });
      }
      alert('Lưu cấu hình thành công!');
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

  const handleStartEditUser = (u: any) => {
    setEditingUserId(u.id);
    setEditUserEmail(u.email);
    setEditUserRole(u.role);
    setEditUserPass('');
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    setLoading(true);
    const res = await updateUserInShop(editingUserId, editUserEmail, editUserPass || undefined, editUserRole);
    if (res.error) alert('Lỗi: ' + res.error);
    else {
      alert('Đã cập nhật!');
      setEditingUserId(null);
      fetchUsers();
    }
    setLoading(false);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Xóa nhân sự này?')) return;
    setLoading(true);
    const res = await deleteUserFromShop(userId);
    if (res.error) alert('Lỗi: ' + res.error);
    else { alert('Đã xóa!'); fetchUsers(); }
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
      <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 shadow-sm">
        <h2 className="text-base font-bold mb-2 text-blue-800">Thiết Lập Cửa Hàng</h2>
        
        <form onSubmit={handleSaveSettings} className="space-y-3 pt-2">
          <div>
            <label className="block text-[10px] font-bold mb-0.5 text-gray-400 uppercase">Tên Cửa Hàng</label>
            <input 
              type="text" required value={shopName} onChange={e => setShopName(e.target.value)}
              className="border border-gray-200 p-2 rounded-md w-full font-bold text-sm outline-none"
            />
          </div>

          <div className="p-3 bg-red-50 rounded-lg border border-red-100 space-y-3">
             <div className="font-bold text-red-600 uppercase text-[10px]">Cấu hình Mục tiêu & Auto KT</div>
             
             <div>
               <label className="block text-[9px] font-bold text-gray-500 mb-0.5">MỤC TIÊU NĂM (Đ)</label>
               <input 
                 type="text" required value={formatCurrency(yearlyLimit)} onChange={handleCurrencyInput(setYearlyLimit)}
                 className="border border-red-200 p-2 rounded-md w-full font-bold text-red-700 text-sm"
               />
               <div className="text-[9px] text-red-400 mt-1 italic">Tương đương: {formatCurrency(Math.round(yearlyLimit/12))}đ / tháng</div>
             </div>

             <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                   <div className="text-[9px] font-black text-gray-400">KHOẢNG A (CK &lt; 1.5M)</div>
                   <input type="text" value={formatCurrency(raMin)} onChange={handleCurrencyInput(setRaMin)} className="border p-2 rounded w-full text-xs" placeholder="Min A" />
                   <input type="text" value={formatCurrency(raMax)} onChange={handleCurrencyInput(setRaMax)} className="border p-2 rounded w-full text-xs" placeholder="Max A" />
                </div>
                <div className="space-y-2">
                   <div className="text-[9px] font-black text-gray-400">KHOẢNG B (CK &ge; 1.5M)</div>
                   <input type="text" value={formatCurrency(rbMin)} onChange={handleCurrencyInput(setRbMin)} className="border p-2 rounded w-full text-xs" placeholder="Min B" />
                   <input type="text" value={formatCurrency(rbMax)} onChange={handleCurrencyInput(setRbMax)} className="border p-2 rounded w-full text-xs" placeholder="Max B" />
                </div>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold mb-0.5 text-gray-400 uppercase">Min KT Chung (đ)</label>
              <input 
                type="text" value={formatCurrency(minKt)} onChange={handleCurrencyInput(setMinKt)}
                className="border border-gray-200 p-2 rounded-md w-full text-sm outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-0.5 text-gray-400 uppercase">Max KT Chung (đ)</label>
              <input 
                type="text" value={formatCurrency(maxKt)} onChange={handleCurrencyInput(setMaxKt)}
                className="border border-gray-200 p-2 rounded-md w-full text-sm outline-none"
              />
            </div>
          </div>
          
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-md font-bold text-sm active:scale-95 shadow-sm">
            Cập nhật cấu hình
          </button>
        </form>
      </div>

      {/* 2. Quản Lý Nhân Sự */}
      <div className="bg-orange-50/50 p-3 rounded-xl border border-orange-100 shadow-sm">
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
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-white/50">
                  <td className="p-2 text-gray-700 truncate max-w-[140px]">
                    {editingUserId === u.id ? (
                      <input 
                        type="email" value={editUserEmail} 
                        onChange={e => setEditUserEmail(e.target.value)}
                        className="border border-blue-300 p-1 rounded w-full text-[10px]"
                      />
                    ) : u.email}
                  </td>
                  <td className="p-2 text-center">
                    {editingUserId === u.id ? (
                      <select 
                        value={editUserRole} onChange={e => setEditUserRole(e.target.value)}
                        className="border border-blue-300 p-1 rounded text-[10px]"
                      >
                        <option value="user">USER</option>
                        <option value="manager">MGR</option>
                        <option value="admin">ADM</option>
                      </select>
                    ) : (
                      <span className="uppercase text-[9px] font-bold text-gray-500">{u.role}</span>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    {editingUserId === u.id ? (
                      <div className="flex flex-col gap-1">
                        <input 
                          type="text" placeholder="Pass mới" value={editUserPass}
                          onChange={e => setEditUserPass(e.target.value)}
                          className="border border-blue-300 p-1 rounded text-[10px] w-20"
                        />
                        <div className="flex gap-1">
                           <button onClick={handleUpdateUser} className="bg-blue-600 text-white px-2 py-0.5 rounded">V</button>
                           <button onClick={() => setEditingUserId(null)} className="bg-gray-400 text-white px-2 py-0.5 rounded">X</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                         <button onClick={() => handleStartEditUser(u)} className="text-blue-500">✏️</button>
                         <button onClick={() => handleDeleteUser(u.id)} className="text-red-400">🗑️</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
