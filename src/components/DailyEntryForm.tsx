'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import * as XLSX from 'xlsx';

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
  const currentMonth = date.substring(0, 7);

  useEffect(() => {
    if (appUser?.shop_id) {
      loadTodayRows();
      loadMonthlyResults();
    }
  }, [appUser, date]);

  const loadTodayRows = async () => {
    // Luôn bắt đầu bằng 1 dòng trống cho ngày hiện tại
    setInputRows([{ product_name: '', cash: 0, transfer: 0, accounting_amount: 0, isNew: true }]);
  };

  const loadMonthlyResults = async () => {
    if (!appUser?.shop_id) return;
    
    // Lấy ngày đầu tháng và ngày đầu tháng sau để lọc chính xác
    const [year, month] = currentMonth.split('-').map(Number);
    const firstDay = `${currentMonth}-01`;
    const nextMonthObj = new Date(year, month, 1);
    const nextMonthStr = nextMonthObj.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('daily_records').select('*')
      .eq('shop_id', appUser.shop_id)
      .gte('date', firstDay)
      .lt('date', nextMonthStr) // Lọc từ mùng 1 đến trước mùng 1 tháng sau
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Lỗi tải dữ liệu tháng:", error.message);
      return;
    }
    if (data) setMonthlyRecords(data);
  };

  const calcKT = (transfer: number, cash: number, prevKT?: number) => {
    // 1. Logic Random theo CK
    let result = 0;
    if (transfer < 1500000) {
      // 1,800,000 < KT < 2,300,000
      result = 1800001 + Math.floor(Math.random() * 499999);
    } else {
      // 2,300,000 <= KT <= 3,400,000
      result = 2300000 + Math.floor(Math.random() * 1100001);
    }

    // 2. Đảm bảo khác kết quả liền kề (nếu trùng thì cộng thêm chút ít)
    if (Math.abs(result - (prevKT || 0)) < 100) {
      result += 555;
    }

    // 3. Ràng buộc bởi Cấu hình (Min/Max)
    const min = settings?.min_kt || 0;
    const max = settings?.max_kt || Infinity;
    
    const finalVal = Math.max(min, Math.min(max, result));
    return { value: finalVal, warn: '' };
  };

  const exportToExcel = () => {
    if (monthlyRecords.length === 0) return;
    const data = monthlyRecords.map(r => ({
      'Ngày': new Date(r.date).toLocaleDateString('vi-VN'),
      'Tên hàng': r.product_name,
      'Chuyển khoản (CK)': r.transfer,
      'Tiền mặt (TM)': r.cash,
      'Mẫu KT': r.accounting_amount
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kết quả");
    XLSX.writeFile(wb, `Bao-cao-thang-${currentMonth}.xlsx`);
  };

  const doSave = async (index: number) => {
    const rec = inputRows[index];
    if (!rec.product_name.trim()) { alert('Nhập tên hàng hóa!'); return; }
    if (rec.cash === 0 && rec.transfer === 0) { alert('Nhập số tiền!'); return; }
    
    setSaving(index);
    
    // Tìm Mẫu KT gần nhất của mặt hàng này
    const { data: history } = await supabase
      .from('daily_records')
      .select('accounting_amount')
      .eq('product_name', rec.product_name)
      .eq('shop_id', appUser?.shop_id)
      .order('created_at', { ascending: false })
      .limit(1);

    const lastKT = (history && history.length > 0) ? history[0].accounting_amount : 0;
    const { value: kt } = calcKT(rec.transfer, rec.cash, lastKT);
    
    const { data: ins, error: saveErr } = await supabase.from('daily_records').insert({
      cash: rec.cash, 
      transfer: rec.transfer, 
      accounting_amount: kt,
      product_name: rec.product_name,
      shop_id: appUser?.shop_id, 
      date
    }).select().single();

    if (saveErr) {
       alert('Lỗi lưu: ' + saveErr.message);
    } else {
      const nr = [...inputRows];
      nr[index] = { 
        product_name: rec.product_name, 
        cash: 0, 
        transfer: 0, 
        accounting_amount: ins.accounting_amount,
        isNew: true 
      };
      setInputRows(nr);
    }

    await loadMonthlyResults();
    setSaving(null);
  };

  const doSaveAll = async () => {
    setSavingAll(true);
    for (let i = 0; i < inputRows.length; i++) {
      const rec = inputRows[i];
      if (!rec.product_name.trim() || (rec.cash === 0 && rec.transfer === 0)) continue;
      
      const { data: lastRec } = await supabase
        .from('daily_records').select('accounting_amount')
        .eq('product_name', rec.product_name).eq('shop_id', appUser?.shop_id)
        .order('created_at', { ascending: false }).limit(1).single();

      const { value: kt } = calcKT(rec.transfer, rec.cash, lastRec?.accounting_amount || 0);

      await supabase.from('daily_records').insert({
        cash: rec.cash,
        transfer: rec.transfer,
        accounting_amount: kt,
        product_name: rec.product_name,
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
    if (!newName) return;
    const newCK = prompt("Tiền chuyển khoản:", String(record.transfer));
    const newTM = prompt("Tiền mặt:", String(record.cash));
    
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
      accounting_amount: 0, 
      isNew: true 
    }]);
  };

  const monthTotalKT = monthlyRecords.reduce((s, r) => s + (r.accounting_amount || 0), 0);

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
              const isSavingThis = saving === i;
              return (
                <div key={i} className="flex flex-col gap-1 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                  <div className="flex gap-2">
                    <input
                      type="text" value={rec.product_name}
                      onChange={e => updateRow(i, 'product_name', e.target.value)}
                      placeholder="Tên hàng hóa..."
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-bold text-gray-800 text-sm outline-none focus:border-blue-500"
                    />
                  </div>

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
          <div className="flex flex-col">
            <h1 className="font-bold text-xs uppercase text-gray-400 leading-none">📊 Kết Quả Tháng</h1>
            <span className="text-[14px] font-black text-white">{currentMonth.replace('-', '/')}</span>
          </div>
          <div className="flex gap-3 items-center">
            <div className="text-right">
               <div className="font-black text-green-400 text-sm leading-none">{fmt(monthTotalKT)}đ</div>
               <div className="text-[8px] text-gray-500 font-bold">TỔNG KT</div>
            </div>
            <button 
              onClick={exportToExcel}
              className="bg-green-600 hover:bg-green-700 text-white p-2 rounded-lg active:scale-95 transition-all shadow-md"
              title="Tải Excel"
            >
              📥
            </button>
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
