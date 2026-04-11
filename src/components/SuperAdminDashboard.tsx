'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function SuperAdminDashboard() {
  const [shops, setShops] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [expireDate, setExpireDate] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: shopsData } = await supabase.from('shops').select('*');
    if (shopsData) setShops(shopsData);

    const { data: usersData } = await supabase.from('users').select('*');
    if (usersData) setUsers(usersData);
  };

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('shops').insert({
      name,
      expire_at: new Date(expireDate).toISOString()
    });
    if (!error) {
      alert('Tạo Shop thành công!');
      fetchData();
    } else {
      alert(error.message);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Bảng Điều Khiển Admin Tổng (Super Admin)</h2>
      
      <div className="bg-white p-6 rounded-xl border mb-6 shadow-sm">
        <h3 className="font-semibold mb-4 text-lg">Tạo Cửa Hàng Mới (Thêm Khách Hàng)</h3>
        <form onSubmit={handleCreateShop} className="flex gap-4">
          <input type="text" placeholder="Tên cửa hàng" required className="border p-2 rounded-lg" value={name} onChange={e => setName(e.target.value)} />
          <input type="date" required className="border p-2 rounded-lg" value={expireDate} onChange={e => setExpireDate(e.target.value)} />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Thêm Shop</button>
        </form>
      </div>

      <div className="bg-white p-6 rounded-xl border shadow-sm">
        <h3 className="font-semibold mb-4 text-lg">Danh Sách Cửa Hàng</h3>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="py-2">Tên Cửa Hàng</th>
              <th className="py-2">Ngày Hết Hạn</th>
              <th className="py-2">Trạng thái</th>
              <th className="py-2">Hành Động</th>
            </tr>
          </thead>
          <tbody>
            {shops.map(shop => (
              <tr key={shop.id} className="border-b">
                <td className="py-2">{shop.name}</td>
                <td className="py-2">{new Date(shop.expire_at).toLocaleDateString('vi-VN')}</td>
                <td className="py-2">{shop.is_active ? '✅ Hoạt động' : '❌ Đang khóa'}</td>
                <td className="py-2">
                  <button className="text-blue-500 hover:underline">Gia hạn</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
