'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

type Row = {
  id?: string;
  product_name: string;
  cash: number;
  transfer: number;
  accounting_amount: number;
  isNew?: boolean;
};

const fmt = (val: number) =>
  new Intl.NumberFormat('vi-VN').format(Math.round(val || 0));

export default function DailyEntryForm({ settings }: { settings: any }) {
  const { appUser } = useAuth();
  const isAdmin = appUser?.role === 'admin' || appUser?.role === 'super_admin';
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [inputRows, setInputRows] = useState<Row[]>([]);
  const [monthlyRecords, setMonthlyRecords] = useState<any[]>([]);
  const [saving, setSaving] = useState<number | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const currentMonth = date.substring(0, 7);

  useEffect(() => {
    if (appUser?.shop_id) {
      loadTodayRows();
      loadMonthlyResults();
    }
  }, [appUser, date]);

  const loadTodayRows = async () => {
    if (!appUser?.shop_id) return;
    const { data: todayData } = await supabase
      .from('daily_records').select('*')
      .eq('shop_id', appUser.shop_id).eq('date', date);

    if (todayData && todayData.length > 0) {
      setInputRows(todayData.map(r => ({ ...r })));
      return;
    }

    // Gợi ý từ ngày gần nhất: Lấy cả Tên hàng và Mẫu KT cũ
    const { data: recentData } = await supabase
      .from('daily_records').select('product_name, accounting_amount, date')
      .eq('shop_id', appUser.shop_id).lt('date', date)
      .order('date', { ascending: false }).limit(30);

    if (recentData && recentData.length > 0) {
      const latestDate = recentData[0].date;
      const suggestions = recentData.filter(r => r.date === latestDate);
      setInputRows(suggestions.map(s => ({
        product_name: s.product_name, 
        cash: 0, 
        transfer: 0, 
        accounting_amount: s.accounting_amount || 0, // Lấy mẫu KT trước đó
        isNew: true
      })));
    } else {
      setInputRows([{ product_name: '', cash: 0, transfer: 0, accounting_amount: 0, isNew: true }]);
    }
  };

  const loadMonthlyResults = async () => {
    if (!appUser?.shop_id) return;
    const { data } = await supabase
      .from('daily_records').select('*')
      .eq('shop_id', appUser.shop_id)
      .gte('date', currentMonth + '-01')
      .order('date', { ascending: false })
      .order('created_at', { ascending: true });
    if (data) setMonthlyRecords(data);
  };

  const calcKT = (transfer: number, cash: number, manualKT?: number) => {
    if (manualKT !== undefined && manualKT > 0 && transfer === 0 && cash === 0) return { value: manualKT, warn: '' };
    const base = (transfer || 0) + (cash || 0);
    const min = settings?.min_kt || 0;
    const max = settings?.max_kt || Infinity;
    if (base > max) return { value: max, warn: `Tổng vượt mức tối đa ${fmt(max)}đ` };
    return { value: Math.max(base, min), warn: '' };
  };

  const doSave = async (index: number) => {
    const rec = inputRows[index];
    if (!rec.product_name.trim()) { alert('Nhập tên hàng hóa!'); return; }
    setSaving(index);
    const { value: kt, warn } = calcKT(rec.transfer, rec.cash, rec.accounting_amount);
    
    const payload = { 
      cash: rec.cash, 
      transfer: rec.transfer, 
      accounting_amount: kt,
      product_name: rec.product_name 
    };

    if (rec.id) {
      await supabase.from('daily_records').update(payload).eq('id', rec.id);
    } else {
      const { data: ins } = await supabase.from('daily_records').insert({
        ...payload,
        shop_id: appUser?.shop_id, 
        date
      }).select().single();
      if (ins) {
        const nr = [...inputRows]; nr[index] = { ...ins }; setInputRows(nr);
      }
    }
    if (warn) alert(warn);
    await loadMonthlyResults();
    setSaving(null);
  };

  const doSaveAll = async () => {
    setSavingAll(true);
    for (let i = 0; i < inputRows.length; i++) {
      const rec = inputRows[i];
      if (!rec.product_name.trim()) continue;
      const { value: kt } = calcKT(rec.transfer, rec.cash, rec.accounting_amount);
      const payload = { 
        cash: rec.cash, 
        transfer: rec.transfer, 
        accounting_amount: kt,
        product_name: rec.product_name 
      };

      if (rec.id) {
        await supabase.from('daily_records').update(payload).eq('id', rec.id);
      } else {
        await supabase.from('daily_records').insert({
          ...payload,
          shop_id: appUser?.shop_id, 
          date
        });
      }
    }
    await loadTodayRows();
    await loadMonthlyResults();
    setSavingAll(false);
  };

  const handleEditRecord = async (record: any) => {
    const newName = prompt("Tên hàng hóa:", record.product_name);
    if (newName === null) return;
    const newCK = prompt("Tiền chuyển khoản:", record.transfer);
    if (newCK === null) return;
    const newTM = prompt("Tiền mặt:", record.cash);
    if (newTM === null) return;
    
    const ck = parseMoney(newCK);
    const tm = parseMoney(newTM);
    const { value: kt } = calcKT(ck, tm);

    const { error } = await supabase.from('daily_records').update({
      product_name: newName,
      transfer: ck,
      cash: tm,
      accounting_amount: kt
    }).eq('id', record.id);

    if (!error) loadMonthlyResults();
  };

  const updateRow = (index: number, field: keyof Row, val: any) => {
    const nr = [...inputRows]; (nr[index] as any)[field] = val; setInputRows(nr);
  };

  const parseMoney = (v: any) => typeof v === 'string' ? Number(v.replace(/[^0-9]/g, '')) : Number(v);

  const addEmptyRow = () => {
    const prevRow = inputRows.length > 0 ? inputRows[inputRows.length - 1] : null;
    setInputRows([...inputRows, { 
      product_name: prevRow?.product_name || '', 
      cash: 0, 
      transfer: 0, 
      accounting_amount: prevRow?.accounting_amount || 0, 
      isNew: true 
    }]);
  };

  const monthTotalKT = monthlyRecords.reduce((s, r) => s + (r.accounting_amount || 0), 0);
  const monthTarget = settings?.yearly_kt_limit ? settings.yearly_kt_limit / 12 : 0;
  const pct = monthTarget > 0 ? Math.min((monthTotalKT / monthTarget) * 100, 100) : 0;

  return (
    <div className="space-y-6">

      {/* ===== NHẬP LIỆU HÀNG NGÀY ===== */}
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="bg-blue-600 px-6 py-4 flex justify-between items-center text-white">
          <h2 className="font-bold text-lg flex items-center gap-2">📝 Nhập Liệu</h2>
          <input
            type="date" value={date}
            onChange={e => setDate(e.target.value)}
            className="bg-white/20 border border-white/30 rounded-xl px-3 py-1 text-sm outline-none"
          />
        </div>

        <div className="p-4 md:p-6 space-y-4">
          {inputRows.map((rec, i) => {
            const { value: kt } = calcKT(rec.transfer, rec.cash, rec.accounting_amount);
            const isSavingThis = saving === i;
            return (
              <div key={i} className="bg-gray-50 rounded-2xl p-4 border border-gray-200 space-y-3 relative">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase font-bold text-gray-400 ml-1 mb-1 block">Tên mặt hàng</label>
                    <input
                      type="text" value={rec.product_name}
                      onChange={e => updateRow(i, 'product_name', e.target.value)}
                      placeholder="Nhập tên..."
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-semibold text-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="md:w-32">
                    <label className="text-[10px] uppercase font-bold text-gray-400 ml-1 mb-1 block">Mẫu KT cũ</label>
                    <input
                      type="text" value={fmt(rec.accounting_amount)}
                      onChange={e => updateRow(i, 'accounting_amount', parseMoney(e.target.value))}
                      className="w-full bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 font-bold text-blue-700 text-sm text-center outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-gray-200">
                    <label className="text-[10px] text-gray-400 block mb-1">CK (VND)</label>
                    <input
                      type="text" inputMode="numeric"
                      value={fmt(rec.transfer)}
                      onChange={e => updateRow(i, 'transfer', parseMoney(e.target.value))}
                      className="w-full text-right font-black text-gray-800 text-base outline-none"
                    />
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-gray-200">
                    <label className="text-[10px] text-gray-400 block mb-1">Tiền mặt (VND)</label>
                    <input
                      type="text" inputMode="numeric"
                      value={fmt(rec.cash)}
                      onChange={e => updateRow(i, 'cash', parseMoney(e.target.value))}
                      className="w-full text-right font-black text-gray-800 text-base outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="text-[10px] text-green-600 font-bold uppercase block">Mẫu KT mới</span>
                    <span className="text-lg font-black text-green-700">{fmt(kt)} đ</span>
                  </div>
                  <button
                    onClick={() => doSave(i)}
                    disabled={isSavingThis}
                    className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-blue-200 active:scale-95 transition-transform disabled:opacity-50"
                  >
                    {isSavingThis ? '...' : 'Lưu'}
                  </button>
                </div>
              </div>
            );
          })}

          <div className="flex gap-3 mt-4">
            <button
              onClick={addEmptyRow}
              className="flex-1 bg-white border-2 border-dashed border-gray-300 text-gray-500 rounded-2xl py-4 font-bold text-sm hover:border-blue-400 hover:text-blue-500 transition-colors"
            >
              + Thêm dòng
            </button>
            <button
              onClick={doSaveAll}
              disabled={savingAll}
              className="flex-[1.5] bg-blue-700 text-white rounded-2xl py-4 font-black text-sm shadow-xl shadow-blue-200 active:scale-95 transition-all"
            >
              {savingAll ? 'Đang tải...' : '💾 LƯU TẤT CẢ'}
            </button>
          </div>
        </div>
      </div>

      {/* ===== KẾT QUẢ THÁNG (Bảng 5 cột) ===== */}
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="bg-gray-800 px-6 py-4 flex justify-between items-center text-white">
          <h2 className="font-bold text-lg">📊 Bảng Kết Quả Tháng {currentMonth.replace('-', '/')}</h2>
          <div className="text-right">
             <div className="text-[10px] text-gray-400 uppercase">Tổng KT</div>
             <div className="font-black text-green-400">{fmt(monthTotalKT)}đ</div>
          </div>
        </div>

        {/* Bảng kết quả */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400 border-b border-gray-100">
                <th className="px-4 py-3">Ngày</th>
                <th className="px-4 py-3">Tên Hàng</th>
                <th className="px-4 py-3 text-right">CK</th>
                <th className="px-4 py-3 text-right">TM</th>
                <th className="px-4 py-3 text-right text-green-600">Mẫu KT</th>
                {isAdmin && <th className="px-4 py-3 text-center">Sửa</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {monthlyRecords.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="text-center py-10 text-gray-400">Chưa có dữ liệu</td>
                </tr>
              ) : monthlyRecords.map((r) => (
                <tr key={r.id} className="hover:bg-blue-50/50 transition-colors">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(r.date + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{r.product_name}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(r.transfer)}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(r.cash)}</td>
                  <td className="px-4 py-3 text-right font-black text-green-700">{fmt(r.accounting_amount)}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-center">
                      <button 
                        onClick={() => handleEditRecord(r)}
                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                      >
                        ✏️
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
