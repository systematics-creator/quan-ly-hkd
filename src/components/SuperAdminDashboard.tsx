'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { createUserWithRole, deleteShopAndUsers } from '@/app/actions';

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
  const [autoLogoutMinutes, setAutoLogoutMinutes] = useState(60);
  
  // Admin User Fields
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPass, setAdminPass] = useState('');
  
  // Edit State
  const [editingShopId, setEditingShopId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>(null);

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
        contact_phone: contactPhone,
        auto_logout_minutes: autoLogoutMinutes
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
        <form onSubmit={handleCreateShopAndAdmin} className="space-y-6">
          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="col-span-full border-b border-blue-200 pb-2 mb-2 font-black text-blue-700 uppercase text-xs tracking-widest">1. Thông tin Cửa Hàng</div>
            <div>
              <label className="block text-sm mb-1 font-bold">Mã Cửa Hàng</label>
              <input type="text" readOnly value={storeCode} className="border p-2 rounded w-full bg-gray-100 font-bold" />
            </div>
            <div>
              <label className="block text-sm mb-1 font-bold">Ngày Hết Hạn Phí</label>
              <input type="date" required value={expireDate} onChange={e => setExpireDate(e.target.value)} className="border p-2 rounded w-full" />
            </div>
            <div>
              <label className="block text-sm mb-1 font-bold">Tên Cửa Hàng</label>
              <input type="text" value={storeName} onChange={e => setStoreName(e.target.value)} className="border p-2 rounded w-full" />
            </div>
            <div>
              <label className="block text-sm mb-1 font-bold">SĐT (Footer)</label>
              <input type="text" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className="border p-2 rounded w-full font-bold text-red-600" />
            </div>
            <div>
              <label className="block text-sm mb-1 font-bold">Tự thoát (Phút)</label>
              <input type="number" value={autoLogoutMinutes} onChange={e => setAutoLogoutMinutes(Number(e.target.value))} className="border p-2 rounded w-full font-bold" />
            </div>
          </div>

          <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-100 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-full border-b border-orange-200 pb-2 mb-2 font-black text-orange-700 uppercase text-xs tracking-widest">2. Tài Khoản Admin Cửa Hàng</div>
            <div>
              <label className="block text-sm mb-1 font-bold">Email / Tài khoản</label>
              <input type="text" required value={adminEmail} onChange={e => setAdminEmail(e.target.value)} className="border p-2 rounded w-full" placeholder="user@gmail.com" />
            </div>
            <div>
              <label className="block text-sm mb-1 font-bold">Mật Khẩu</label>
              <input type="text" required value={adminPass} onChange={e => setAdminPass(e.target.value)} className="border p-2 rounded w-full" placeholder="123456" />
            </div>
          </div>

          <div className="pt-2">
            <button disabled={loading} type="submit" className="w-full md:w-auto bg-red-600 text-white px-10 py-3 rounded-xl hover:bg-red-700 disabled:bg-red-300 font-black shadow-lg shadow-red-200 transition-all active:scale-95">
              {loading ? 'Đang xử lý...' : 'TẠO SHOP & CẤP TÀI KHOẢN'}
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
              <th className="p-3">Tự thoát (p)</th>
              <th className="p-3">Ngày Hết Hạn</th>
              <th className="p-3">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {shops.map(shop => {
              const isEditing = editingShopId === shop.id;
              
              const startEdit = () => {
                setEditingShopId(shop.id);
                setEditFormData({ ...shop, expire_at: shop.expire_at.split('T')[0] });
              };

              const handleSaveEdit = async () => {
                setLoading(true);
                try {
                  const expireAt = editFormData.expire_at ? new Date(editFormData.expire_at).toISOString() : shop.expire_at;
                  
                  const { error } = await supabase.from('shops').update({
                    name: editFormData.name,
                    contact_phone: editFormData.contact_phone,
                    auto_logout_minutes: editFormData.auto_logout_minutes,
                    expire_at: expireAt,
                    is_active: editFormData.is_active
                  }).eq('id', shop.id);
                  
                  if (!error) {
                    setEditingShopId(null);
                    fetchData();
                  } else {
                    if (error.message.includes("contact_phone")) {
                      alert("LỖI: Bảng dữ liệu chưa được cập nhật cột Số điện thoại. Bạn hãy chạy câu lệnh SQL tôi đã gửi trước đó trong Supabase.");
                    } else {
                      alert("Lỗi: " + error.message);
                    }
                  }
                } catch (e: any) {
                  alert("Lỗi định dạng dữ liệu: " + e.message);
                }
                setLoading(false);
              };

              const handleDelete = async () => {
                if (!confirm(`XÓA VĨNH VIỄN cửa hàng ${shop.name} và tất cả nhân viên?`)) return;
                setLoading(true);
                const res = await deleteShopAndUsers(shop.id);
                if (res.error) alert(res.error);
                else fetchData();
                setLoading(false);
              };

              if (isEditing) {
                return (
                  <tr key={shop.id} className="bg-blue-50">
                    <td colSpan={6} className="p-4 border">
                      <div className="flex flex-col gap-3">
                         <div className="font-bold text-blue-700 uppercase mb-2">Chỉnh sửa Cửa Hàng: {shop.store_code}</div>
                         <div className="flex flex-col gap-4 max-w-md">
                           <div>
                             <label className="text-[10px] uppercase font-bold text-gray-400">Tên Cửa Hàng</label>
                             <input type="text" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} className="border p-2 rounded w-full text-sm font-bold" />
                           </div>
                           <div>
                             <label className="text-[10px] uppercase font-bold text-gray-400">Số Điện Thoại (Footer)</label>
                             <input type="text" value={editFormData.contact_phone} onChange={e => setEditFormData({...editFormData, contact_phone: e.target.value})} className="border p-2 rounded w-full text-sm font-bold text-red-600" />
                           </div>
                           <div>
                             <label className="text-[10px] uppercase font-bold text-gray-400">Ngày Hết Hạn</label>
                             <input type="date" value={editFormData.expire_at} onChange={e => setEditFormData({...editFormData, expire_at: e.target.value})} className="border p-2 rounded w-full text-sm" />
                           </div>
                           <div>
                             <label className="text-[10px] uppercase font-bold text-gray-400">Tự thoát sau (Phút)</label>
                             <input type="number" value={editFormData.auto_logout_minutes} onChange={e => setEditFormData({...editFormData, auto_logout_minutes: Number(e.target.value)})} className="border p-2 rounded w-full text-sm font-bold" />
                           </div>
                           <div>
                             <label className="flex items-center gap-2 cursor-pointer pt-2">
                               <input type="checkbox" checked={editFormData.is_active} onChange={e => setEditFormData({...editFormData, is_active: e.target.checked})} />
                               <span className="text-sm font-bold">Kích hoạt cửa hàng</span>
                             </label>
                           </div>
                         </div>
                         <div className="flex gap-2">
                           <button onClick={handleSaveEdit} className="bg-green-600 text-white px-4 py-2 rounded font-bold text-xs uppercase">Lưu</button>
                           <button onClick={() => setEditingShopId(null)} className="bg-gray-400 text-white px-4 py-2 rounded font-bold text-xs uppercase">Hủy</button>
                           <button onClick={handleDelete} className="ml-auto bg-red-600 text-white px-4 py-2 rounded font-bold text-xs uppercase">XÓA SHOP</button>
                         </div>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={shop.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-bold text-blue-700">{shop.store_code}</td>
                  <td className="p-3">{shop.name}</td>
                  <td className="p-3 text-xs">{shop.contact_phone || '---'}</td>
                  <td className="p-3 text-xs font-bold">{shop.auto_logout_minutes || 60}p</td>
                  <td className="p-3">{new Date(shop.expire_at).toLocaleDateString('vi-VN')}</td>
                  <td className="p-3 flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-[10px] font-semibold ${shop.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {shop.is_active ? '✅ Hoạt động' : '❌ Đang khóa'}
                    </span>
                    <button onClick={startEdit} className="text-blue-500 font-bold text-xs ml-auto">SỬA</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
