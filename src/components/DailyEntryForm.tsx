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

    const { data: ins, error: saveErr } = await supabase.from('daily_records').insert({
      ...payload,
      shop_id: appUser?.shop_id, 
      date
    }).select().single();

    if (saveErr) {
       alert('Lỗi lưu: ' + saveErr.message);
    } else {
      // RESET LUỒNG: Sau khi lưu xong, đưa dòng này về trạng thái mới 
      // Nhưng giữ lại tên mặt hàng cho lần nhập tiếp theo
      const nr = [...inputRows];
      nr[index] = { 
        product_name: rec.product_name, 
        cash: 0, 
        transfer: 0, 
        accounting_amount: ins.accounting_amount, // Giữ mẫu KT vừa lưu làm gợi ý kế tiếp
        isNew: true 
      };
      setInputRows(nr);
      if (warn) alert(warn);
    }

    await loadMonthlyResults();
    setSaving(null);
  };

  const doSaveAll = async () => {
    setSavingAll(true);
    for (let i = 0; i < inputRows.length; i++) {
      const rec = inputRows[i];
      if (!rec.product_name.trim() || (rec.cash === 0 && rec.transfer === 0)) continue;
      
      const { value: kt } = calcKT(rec.transfer, rec.cash, rec.accounting_amount);
      const payload = { 
        cash: rec.cash, 
        transfer: rec.transfer, 
        accounting_amount: kt,
        product_name: rec.product_name 
      };

      await supabase.from('daily_records').insert({
        ...payload,
        shop_id: appUser?.shop_id, 
        date
      });
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
    const { value: kt } = calcKT(ck, tm, record.accounting_amount);

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
    <div className="space-y-4">

      {/* ===== NHẬP LIỆU DẠNG DÒNG (DENSE LAYOUT) ===== */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-blue-600 px-4 py-3 flex justify-between items-center text-white">
          <h2 className="font-bold text-sm uppercase tracking-wide">📝 Nhập Liệu</h2>
          <input
            type="date" value={date}
            onChange={e => setDate(e.target.value)}
            className="bg-white/20 border border-white/30 rounded-lg px-2 py-0.5 text-xs outline-none"
          />
        </div>

        <div className="p-2 md:p-4">
          <div className="space-y-2">
            {inputRows.map((rec, i) => {
              const { value: kt } = calcKT(rec.transfer, rec.cash, rec.accounting_amount);
              const isSavingThis = saving === i;
              return (
                <div key={i} className="flex flex-col gap-1 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                  {/* Dòng 1: Tên hàng + Mẫu KT cũ */}
                  <div className="flex gap-2">
                    <input
                      type="text" value={rec.product_name}
                      onChange={e => updateRow(i, 'product_name', e.target.value)}
                      placeholder="Tên hàng..."
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-bold text-gray-800 text-sm outline-none focus:border-blue-500"
                    />
                    <div className="w-24 bg-blue-50/50 border border-blue-100 rounded-lg px-2 py-2 text-center">
                      <span className="text-[9px] text-blue-500 font-bold block leading-none mb-1">KT CŨ</span>
                      <input 
                        type="text" value={fmt(rec.accounting_amount)} 
                        onChange={e => updateRow(i, 'accounting_amount', parseMoney(e.target.value))}
                        className="w-full bg-transparent text-center font-bold text-blue-700 text-xs outline-none"
                      />
                    </div>
                  </div>

                  {/* Dòng 2: CK + TM + LƯU */}
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-[8px] text-gray-400 font-bold">CK</span>
                        <input
                          type="text" inputMode="numeric"
                          value={fmt(rec.transfer)}
                          onChange={e => updateRow(i, 'transfer', parseMoney(e.target.value))}
                          className="w-full bg-white border border-gray-200 rounded-lg pl-2 pr-2 pt-3 pb-1 text-right font-black text-gray-800 text-sm outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="relative">
                        <span className="absolute left-2 top-1.5 text-[8px] text-gray-400 font-bold">TM</span>
                        <input
                          type="text" inputMode="numeric"
                          value={fmt(rec.cash)}
                          onChange={e => updateRow(i, 'cash', parseMoney(e.target.value))}
                          className="w-full bg-white border border-gray-200 rounded-lg pl-2 pr-2 pt-3 pb-1 text-right font-black text-gray-800 text-sm outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                    
                    <button
                      onClick={() => doSave(i)}
                      disabled={isSavingThis}
                      className="bg-blue-600 text-white w-14 h-10 rounded-lg font-bold text-xs shadow-md active:scale-95 disabled:opacity-50 shrink-0"
                    >
                      {isSavingThis ? '...' : 'Lưu'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={addEmptyRow}
              className="flex-1 bg-gray-50 border border-gray-200 text-gray-500 rounded-xl py-2.5 font-bold text-xs hover:bg-gray-100"
            >
              + Dòng mới
            </button>
            <button
              onClick={doSaveAll}
              disabled={savingAll}
              className="flex-1 bg-blue-700 text-white rounded-xl py-2.5 font-black text-xs shadow-lg active:scale-95 disabled:opacity-50"
            >
              {savingAll ? 'Đang lưu...' : 'LƯU TẤT CẢ'}
            </button>
          </div>
        </div>
      </div>

      {/* ===== KẾT QUẢ THÁNG (Bảng 5 cột) ===== */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gray-800 px-4 py-3 flex justify-between items-center text-white">
          <h1 className="font-bold text-xs uppercase">📊 Kết Quả Tháng {currentMonth.replace('-', '/')}</h1>
          <div className="text-right">
             <div className="font-black text-green-400 text-sm">{fmt(monthTotalKT)}đ</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400 border-b border-gray-100 whitespace-nowrap">
                <th className="px-3 py-2">Ngày</th>
                <th className="px-3 py-2">Hàng</th>
                <th className="px-3 py-2 text-right">CK</th>
                <th className="px-3 py-2 text-right">TM</th>
                <th className="px-3 py-2 text-right text-green-600">KT</th>
                {isAdmin && <th className="px-3 py-2 text-center">Sửa</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-xs">
              {monthlyRecords.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="text-center py-6 text-gray-400 italic">Chưa có dữ liệu</td>
                </tr>
              ) : monthlyRecords.map((r) => (
                <tr key={r.id} className="active:bg-blue-50 transition-colors">
                  <td className="px-3 py-2 text-gray-500">
                    {new Date(r.date + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                  </td>
                  <td className="px-3 py-2 font-semibold text-gray-700 max-w-[80px] truncate">{r.product_name}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.transfer)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.cash)}</td>
                  <td className="px-3 py-2 text-right font-bold text-green-700">{fmt(r.accounting_amount)}</td>
                  {isAdmin && (
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => handleEditRecord(r)} className="p-1 opacity-70">✏️</button>
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
