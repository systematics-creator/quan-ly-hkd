'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { createUserWithRole } from '@/app/actions';

function generateStoreCode() {
  const digits = Math.floor(10 + Math.random() * 90).toString(); // 2 numbers (10-99)
  const letters = Array(3).fill(0).map(() => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join(''); // 3 letters A-Z
  return digits + letters;
}

export default function SuperAdminDashboard() {
  const [shops, setShops] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Form Fields
  const [storeCode, setStoreCode] = useState(generateStoreCode());
  const [storeName, setStoreName] = useState('Cửa hàng mới');
  const [expireDate, setExpireDate] = useState('');
  const [contactPhone, setContactPhone] = useState('09xx');
  
  // Admin User Fields
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPass, setAdminPass] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data } = await supabase.from('shops').select('*').order('created_at', { ascending: false });
    if (data) setShops(data);
  };

  const handleCreateShopAndAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Create Shop with Store Code
      const { data: newShop, error: shopError } = await supabase.from('shops').insert({
        store_code: storeCode,
        name: storeName,
        expire_at: new Date(expireDate).toISOString(),
        contact_phone: contactPhone
      }).select().single();

      if (shopError || !newShop) {
        alert('Lỗi tạo Shop: ' + (shopError?.message || ''));
        setLoading(false);
        return;
      }

      // 2. Uses Server Action to create the Admin User for this Shop
      const res = await createUserWithRole(adminEmail, adminPass, 'admin', newShop.id);
      
      if (res.error) {
        // If user fails, delete the shop to rollback
        await supabase.from('shops').delete().eq('id', newShop.id);
        alert('Lỗi tạo Admin: ' + res.error);
        setLoading(false);
        return;
      }

      alert(`Đã tạo thành công! \nMã Cửa Hàng (Store Code): ${storeCode}\nTài khoản: ${adminEmail}\nMật khẩu: ${adminPass}`);
      
      // Reset Form
      setStoreCode(generateStoreCode());
      setStoreName('Cửa hàng mới');
      setExpireDate('');
      setAdminEmail('');
      setAdminPass('');
      
      fetchData();
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
    
    setLoading(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6 text-red-600">Bảng Điều Khiển Admin Tổng (Super Admin)</h2>
      
      <div className="bg-white p-6 rounded-xl border mb-6 shadow-sm">
        <h3 className="font-semibold mb-4 text-lg">Tạo Cửa Hàng Mới & Cấp User Admin</h3>
        <form onSubmit={handleCreateShopAndAdmin} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          
          <div className="col-span-1 md:col-span-2 lg:col-span-3 border-b pb-2 mb-2 font-medium text-gray-700">Thông tin Cửa Hàng</div>
          <div>
            <label className="block text-sm mb-1">Mã Cửa Hàng (Tự động)</label>
            <input type="text" readOnly value={storeCode} className="border p-2 rounded w-full bg-gray-100 font-bold" />
          </div>
          <div>
            <label className="block text-sm mb-1">Ngày Hết Hạn Phí</label>
            <input type="date" required value={expireDate} onChange={e => setExpireDate(e.target.value)} className="border p-2 rounded w-full" />
          </div>
          <div className="md:col-span-2 lg:col-span-1">
            <label className="block text-sm mb-1">Tên Tạm</label>
            <input type="text" value={storeName} onChange={e => setStoreName(e.target.value)} className="border p-2 rounded w-full" />
          </div>
          <div>
            <label className="block text-sm mb-1">SĐT Liên hệ (Chữ nhỏ Footer)</label>
            <input type="text" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className="border p-2 rounded w-full font-bold text-red-600" placeholder="09xxx" />
          </div>

          <div className="col-span-1 md:col-span-2 lg:col-span-3 border-b pb-2 mb-2 mt-4 font-medium text-gray-700">Tài Khoản Admin Cửa Hàng</div>
          <div>
            <label className="block text-sm mb-1">Email / Tài khoản</label>
            <input type="text" required value={adminEmail} onChange={e => setAdminEmail(e.target.value)} className="border p-2 rounded w-full" placeholder="user@gmail.com" />
          </div>
          <div>
            <label className="block text-sm mb-1">Mật Khẩu</label>
            <input type="text" required value={adminPass} onChange={e => setAdminPass(e.target.value)} className="border p-2 rounded w-full" placeholder="123456" />
          </div>

          <div className="col-span-1 md:col-span-2 lg:col-span-3 mt-4">
            <button disabled={loading} type="submit" className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 disabled:bg-red-300 font-medium">
              {loading ? 'Đang tạo...' : 'Tạo Shop & Cấp Tài Khoản'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white p-6 rounded-xl border shadow-sm overflow-x-auto">
        <h3 className="font-semibold mb-4 text-lg">Danh Sách Cửa Hàng Quản Lý</h3>
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-3">Mã MS</th>
              <th className="p-3">Tên Cửa Hàng</th>
              <th className="p-3">SĐT</th>
              <th className="p-3">Ngày Hết Hạn</th>
              <th className="p-3">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {shops.map(shop => (
              <tr key={shop.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-bold text-blue-700">{shop.store_code}</td>
                <td className="p-3">{shop.name}</td>
                <td className="p-3 text-xs">{shop.contact_phone || '---'}</td>
                <td className="p-3">{new Date(shop.expire_at).toLocaleDateString('vi-VN')}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${shop.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {shop.is_active ? '✅ Hoạt động' : '❌ Đang khóa'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
