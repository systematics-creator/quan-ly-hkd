'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

export default function DailyEntryForm({ settings }: { settings: any }) {
  const { appUser } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState<any[]>([]);
  const [newProductName, setNewProductName] = useState('');

  useEffect(() => {
    if (appUser?.shop_id) {
      loadTodayRecords();
    }
  }, [appUser, date]);

  const loadTodayRecords = async () => {
    // 1. Get all distinct product names for this month
    const startOfMonth = new Date(date).toISOString().substring(0, 8) + '01';
    
    const { data: monthData } = await supabase
      .from('daily_records')
      .select('product_name')
      .eq('shop_id', appUser?.shop_id)
      .gte('date', startOfMonth)
      .lte('date', date);

    const uniqueProducts = Array.from(new Set(monthData?.map(d => d.product_name) || []));

    // 2. Get today's existing records
    const { data: todayData } = await supabase
      .from('daily_records')
      .select('*')
      .eq('shop_id', appUser?.shop_id)
      .eq('date', date);

    // 3. Merge: display all unique products, filling with today's values if they exist
    const merged = uniqueProducts.map(prod => {
      const existing = todayData?.find(t => t.product_name === prod);
      return existing || {
        product_name: prod,
        cash: 0,
        transfer: 0,
        accounting_amount: 0,
        isNew: true
      };
    });

    setRecords(merged);
  };

  const calculateAutoKT = (transfer: number) => {
    let kt = transfer + 50000; // Mặc định auto cao hơn ck 50k
    if (settings) {
      if (kt < settings.min_kt) kt = settings.min_kt;
      if (kt > settings.max_kt) kt = settings.max_kt;
    }
    return kt;
  };

  const handleSave = async (index: number) => {
    const rec = records[index];
    const kt = calculateAutoKT(rec.transfer);

    if (kt <= rec.transfer) {
      alert('Số tiền theo mẫu KT phải lớn hơn Tiền Chuyển Khoản!');
      return;
    }

    if (rec.id) {
      // Update
      await supabase.from('daily_records').update({
        cash: rec.cash,
        transfer: rec.transfer,
        accounting_amount: kt
      }).eq('id', rec.id);
    } else {
      // Insert
      await supabase.from('daily_records').insert({
        shop_id: appUser?.shop_id,
        date: date,
        product_name: rec.product_name,
        cash: rec.cash,
        transfer: rec.transfer,
        accounting_amount: kt
      });
    }
    alert('Lưu thành công!');
    loadTodayRecords();
  };

  const handleAddNewProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) return;

    // Check if already in list
    if (records.find(r => r.product_name.toLowerCase() === newProductName.toLowerCase())) {
      alert('Tên hàng hóa này đã có trong danh sách!');
      return;
    }

    const { error } = await supabase.from('daily_records').insert({
      shop_id: appUser?.shop_id,
      date: date,
      product_name: newProductName,
      cash: 0,
      transfer: 0,
      accounting_amount: settings?.min_kt || 0
    });

    if (!error) {
      setNewProductName('');
      loadTodayRecords();
    } else {
      alert(error.message);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">Nhập liệu hàng ngày</h2>
        <input 
          type="date" 
          value={date} 
          onChange={e => setDate(e.target.value)} 
          className="border p-2 rounded-lg font-medium bg-gray-50"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-3 text-sm font-semibold text-gray-600">Tên Hàng Hóa</th>
              <th className="p-3 text-sm font-semibold text-gray-600">Tiền Chuyển Khoản</th>
              <th className="p-3 text-sm font-semibold text-gray-600">Tiền Mặt</th>
              <th className="p-3 text-sm font-semibold text-gray-600">Số Tiền (Mẫu KT)</th>
              <th className="p-3 text-sm font-semibold text-gray-600">Hành Động</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec, index) => (
              <tr key={index} className="border-b">
                <td className="p-3 font-medium">{rec.product_name}</td>
                <td className="p-3">
                  <input type="number" className="border w-full p-2 rounded" value={rec.transfer} onChange={e => {
                    const newRecs = [...records];
                    newRecs[index].transfer = Number(e.target.value);
                    setRecords(newRecs);
                  }} />
                </td>
                <td className="p-3">
                  <input type="number" className="border w-full p-2 rounded" value={rec.cash} onChange={e => {
                    const newRecs = [...records];
                    newRecs[index].cash = Number(e.target.value);
                    setRecords(newRecs);
                  }} />
                </td>
                <td className="p-3">
                  <input type="number" disabled className="border w-full p-2 rounded bg-gray-100 font-semibold" value={calculateAutoKT(rec.transfer)} />
                </td>
                <td className="p-3">
                  <button onClick={() => handleSave(index)} className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700">
                    Lưu
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleAddNewProduct} className="mt-6 flex gap-3 p-4 bg-gray-50 rounded-lg border">
        <input 
          type="text" 
          placeholder="Tạo mã hàng hóa mới cho hôm nay..." 
          value={newProductName} 
          onChange={e => setNewProductName(e.target.value)}
          className="border p-2 rounded w-full md:w-1/3"
          required
        />
        <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 font-medium whitespace-nowrap">
          + Thêm Hàng Mới
        </button>
      </form>

    </div>
  );
}
