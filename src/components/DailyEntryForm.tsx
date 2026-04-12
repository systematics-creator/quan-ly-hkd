'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import * as XLSX from 'xlsx';

type Row = {
  id?: string;
  product_name: string;
  cash: number | string;
  transfer: number | string;
  accounting_amount: number;
  isNew?: boolean;
  transfer_count?: number;
};

const fmt = (val: number | string) => {
  const n = typeof val === 'number' ? val : Number(val) || 0;
  return new Intl.NumberFormat('vi-VN').format(Math.round(n));
};

export default function DailyEntryForm({ settings }: { settings: any }) {
  const { appUser } = useAuth();
  const isAdmin = appUser?.role === 'admin' || appUser?.role === 'super_admin';
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [inputRows, setInputRows] = useState<Row[]>([]);
  const [monthlyRecords, setMonthlyRecords] = useState<any[]>([]);
  const [saving, setSaving] = useState<number | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>(null);

  // Quick Adder State
  const [adderRowIndex, setAdderRowIndex] = useState<number | null>(null);
  const [adderValues, setAdderValues] = useState<string[]>(['']);

  const currentMonth = date.substring(0, 7);

  useEffect(() => {
    if (appUser?.shop_id) {
      loadTodayRows();
      loadMonthlyResults();
    }
  }, [appUser, date]);

  // Persistence: Save to localStorage
  useEffect(() => {
    if (inputRows.length > 0) {
      const firstRow = inputRows[0];
      if (firstRow.product_name !== '' || firstRow.cash !== 0 || firstRow.transfer !== 0) {
        localStorage.setItem(`hkd_draft_${date}_${appUser?.id}`, JSON.stringify(inputRows));
      }
    }
  }, [inputRows, date, appUser]);

  const loadTodayRows = async () => {
    const saved = localStorage.getItem(`hkd_draft_${date}_${appUser?.id}`);
    if (saved) {
      try {
        setInputRows(JSON.parse(saved));
        return;
      } catch (e) {
        console.error("Failed to parse saved rows", e);
      }
    }
    setInputRows([{ product_name: '', cash: 0, transfer: 0, accounting_amount: 0, isNew: true }]);
  };

  const loadMonthlyResults = async () => {
    if (!appUser?.shop_id) return;
    const [year, month] = currentMonth.split('-').map(Number);
    const firstDay = `${currentMonth}-01`;
    const nextMonthObj = new Date(year, month, 1);
    const nextMonthStr = nextMonthObj.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('daily_records').select('*')
      .eq('shop_id', appUser.shop_id)
      .gte('date', firstDay)
      .lt('date', nextMonthStr)
      .order('created_at', { ascending: false });

    if (!error && data) setMonthlyRecords(data);
  };

  const calcKT = (transfer: number, cash: number, prevKT?: number) => {
    const raMin = settings?.range_a_min || 1800000;
    const raMax = settings?.range_a_max || 2300000;
    const rbMin = settings?.range_b_min || 2300000;
    const rbMax = settings?.range_b_max || 3400000;

    // --- THUẬT TOÁN BÙ (COMPENSATION LOGIC) ---
    // Tính toán tiến độ cần thiết để đạt mục tiêu tháng
    const dateParts = date.split('-');
    const y = dateParts.length > 0 ? Number(dateParts[0]) : new Date().getFullYear();
    const m = dateParts.length > 1 ? Number(dateParts[1]) : new Date().getMonth() + 1;
    
    const daysInMonth = new Date(y, m, 0).getDate() || 30;
    const dayOfMonth = new Date(date + 'T00:00:00').getDate() || 1;
    const monthlyTarget = (settings?.yearly_kt_limit || 0) / 12;
    
    // Tổng KT hiện tại trong tháng (bao gồm cả các bản ghi cũ)
    const currentMonthTotal = monthlyRecords.reduce((s, r) => s + (r.accounting_amount || 0), 0);
    
    // Tiến độ lý tưởng đến ngày hiện tại
    const idealProgress = (monthlyTarget / daysInMonth) * dayOfMonth;
    
    // Độ lệch (Gap): Nếu thiếu hụt so với tiến độ lý tưởng (do nghỉ làm KT=0), bias sẽ tăng lên
    const gap = idealProgress - currentMonthTotal;
    
    // Tỉ lệ bù: từ 0 đến 1. Nếu hụt nhiều, bias tiến gần về 1 (lấy giá trị Max của dải)
    // Chia cho 1/3 mục tiêu tháng để làm mượt tỉ lệ bù
    const bias = gap > 0 ? Math.min(gap / (monthlyTarget / 3), 1) : 0;

    // Tạo số ngẫu nhiên có trọng số (biasing towards Max if lagging)
    const weightedRandom = () => {
      const r = Math.random();
      // Nếu bias = 1, kết quả luôn là 1 (Max). Nếu bias = 0, kết quả là ngẫu nhiên đều 0-1.
      return r * (1 - bias) + bias;
    };

    let result = 0;
    const rand = weightedRandom();
    
    if (transfer < 1500000) {
      const delta = Math.max(0, raMax - raMin);
      result = raMin + Math.floor(rand * delta);
    } else {
      const delta = Math.max(0, rbMax - rbMin);
      result = rbMin + Math.floor(rand * delta);
    }

    if (Math.abs(result - (prevKT || 0)) < 100) result += 333;

    // Bỏ Min/Max KT chung theo yêu cầu người dùng
    const finalVal = (transfer === 0 && cash === 0) ? 0 : Math.max(0, result);
    return { value: finalVal, isCompensated: bias > 0.1 };
  };

  const exportToExcel = () => {
    const data = monthlyRecords.map(r => {
      const d = new Date(r.date + 'T00:00:00');
      const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      return {
        'Ngày': dateStr,
        'Tên hàng': r.product_name,
        'Chuyển khoản (CK)': r.transfer,
        'Tiền mặt (TM)': r.cash,
        'Mẫu KT': r.accounting_amount
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Kết quả");
    XLSX.writeFile(wb, `Bao-cao-thang-${currentMonth}.xlsx`);
  };

  const doSave = async (index: number) => {
    const rec = inputRows[index];
    const cashVal = Number(rec.cash) || 0;
    const transVal = Number(rec.transfer) || 0;

    if (!rec.product_name.trim()) { alert('Vui lòng nhập Tên hàng hóa!'); return; }
    setSaving(index);
    const { data: history } = await supabase.from('daily_records').select('accounting_amount').eq('product_name', rec.product_name).eq('shop_id', appUser?.shop_id).order('created_at', { ascending: false }).limit(1);
    const lastKT = (history && history.length > 0) ? history[0].accounting_amount : 0;
    const { value: kt } = calcKT(transVal, cashVal, lastKT);
    const { data: ins, error } = await supabase.from('daily_records').insert({ cash: cashVal, transfer: transVal, accounting_amount: kt, product_name: rec.product_name, shop_id: appUser?.shop_id, date }).select().single();
    if (!error) {
      const nr = [...inputRows];
      nr[index] = { product_name: rec.product_name, cash: 0, transfer: 0, accounting_amount: ins.accounting_amount, isNew: true, transfer_count: 0 };
      setInputRows(nr);
      await loadMonthlyResults();
      localStorage.setItem(`hkd_draft_${date}_${appUser?.id}`, JSON.stringify(nr));
    } else {
      alert("Lỗi khi lưu: " + error.message);
    }
    setSaving(null);
  };

  const doSaveAll = async () => {
    setSavingAll(true);
    try {
      for (const rec of inputRows) {
        const cashVal = Number(rec.cash) || 0;
        const transVal = Number(rec.transfer) || 0;
        if (!rec.product_name.trim()) continue;
        
        const { data: history } = await supabase.from('daily_records').select('accounting_amount').eq('product_name', rec.product_name).eq('shop_id', appUser?.shop_id).order('created_at', { ascending: false }).limit(1);
        const { value: kt } = calcKT(transVal, cashVal, (history && history.length > 0) ? history[0].accounting_amount : 0);
        const { error } = await supabase.from('daily_records').insert({ cash: cashVal, transfer: transVal, accounting_amount: kt, product_name: rec.product_name, shop_id: appUser?.shop_id, date });
        if (error) throw error;
      }
      await loadTodayRows();
      await loadMonthlyResults();
      localStorage.removeItem(`hkd_draft_${date}_${appUser?.id}`);
    } catch (err: any) {
      alert("Lỗi khi lưu tất cả: " + err.message);
    }
    setSavingAll(false);
  };

  const startEdit = (record: any) => {
    setEditingId(record.id);
    setEditFormData({ ...record });
  };

  const handleSaveEdit = async () => {
    if (!editFormData) return;
    
    // If KT is manually changed or it's 0 (day off), we use it. 
    // Otherwise, we could still use calcKT if we want auto-adjustment, 
    // but usually user wants control during edit.
    // Let's use the value from the form directly.
    
    const { error } = await supabase.from('daily_records').update({
      date: editFormData.date,
      product_name: editFormData.product_name,
      transfer: editFormData.transfer,
      cash: editFormData.cash,
      accounting_amount: editFormData.accounting_amount
    }).eq('id', editingId);

    if (!error) {
      setEditingId(null);
      await loadMonthlyResults();
    } else {
      alert("Lỗi: " + error.message);
    }
  };

  const updateRow = (index: number, field: keyof Row, val: any) => {
    const nr = [...inputRows]; (nr[index] as any)[field] = val; setInputRows(nr);
  };

  const parseMoney = (v: any) => typeof v === 'string' ? Number(v.replace(/[^0-9]/g, '')) : Number(v);

  const addEmptyRow = () => {
    const prev = inputRows[inputRows.length - 1];
    setInputRows([...inputRows, { product_name: prev?.product_name || '', cash: 0, transfer: 0, accounting_amount: 0, isNew: true, transfer_count: 0 }]);
  };

  const openAdder = (index: number) => {
    setAdderRowIndex(index);
    setAdderValues(['']);
  };

  const closeAdder = () => {
    setAdderRowIndex(null);
  };

  const handleSumAdder = () => {
    if (adderRowIndex === null) return;
    
    // Auto-append 000 to all shorthand values before summing
    const total = adderValues.reduce((s, v) => {
      let num = parseMoney(v) || 0;
      if (num > 0 && num < 10000) num = num * 1000;
      return s + num;
    }, 0);
    
    const count = adderValues.filter(v => parseMoney(v) > 0).length;
    
    updateRow(adderRowIndex, 'transfer', total);
    updateRow(adderRowIndex, 'transfer_count', count);
    closeAdder();
  };

  const toggleSelectAll = () => (selectedIds.length === monthlyRecords.length) ? setSelectedIds([]) : setSelectedIds(monthlyRecords.map(r => r.id));
  const toggleSelect = (id: string) => selectedIds.includes(id) ? setSelectedIds(selectedIds.filter(x => x !== id)) : setSelectedIds([...selectedIds, id]);

  const doDeleteSelection = async () => {
    if (selectedIds.length === 0 || !confirm(`Xóa ${selectedIds.length} bản ghi?`)) return;
    const { error } = await supabase.from('daily_records').delete().in('id', selectedIds);
    if (!error) { setSelectedIds([]); await loadMonthlyResults(); }
  };

  const monthTotalKT = monthlyRecords.reduce((s, r) => s + (r.accounting_amount || 0), 0);
  const monthlyTarget = (settings?.yearly_kt_limit || 0) / 12;
  const progressPct = monthlyTarget > 0 ? Math.min((monthTotalKT / monthlyTarget) * 100, 100) : 0;

  return (
    <div className="space-y-4">
      {/* NHẬP LIỆU */}
      <div className="bg-blue-50/50 rounded-3xl shadow-xl border border-blue-100 overflow-hidden backdrop-blur-sm transition-all hover:shadow-2xl">
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-4 flex justify-between items-center text-white shadow-md">
          <h2 className="font-black text-sm uppercase tracking-wider flex items-center gap-2">
            <span className="bg-white/20 p-1 rounded-lg">📝</span> Nhập Liệu
          </h2>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-white/20 border border-white/30 rounded-lg px-2 py-0.5 text-xs outline-none" />
        </div>
        <div className="p-2">
          <div className="space-y-2">
            {inputRows.map((rec, i) => (
              <div key={i} className="flex flex-col gap-1 pb-3 border-b last:border-0 last:pb-0">
                <input type="text" value={rec.product_name} onChange={e => updateRow(i, 'product_name', e.target.value)} placeholder="Tên hàng hóa..." className="bg-gray-50 border p-2 rounded-lg font-bold text-sm outline-none" />
                <div className="flex gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div className="relative">
                      <span className="absolute left-2 top-1 text-[8px] text-gray-400 font-bold">CK</span>
                      <input 
                        type="text" 
                        value={fmt(rec.transfer)} 
                        onFocus={e => rec.transfer === 0 && updateRow(i, 'transfer', '')}
                        onBlur={e => rec.transfer === 0 && updateRow(i, 'transfer', 0)}
                        onChange={e => updateRow(i, 'transfer', parseMoney(e.target.value))} 
                        className="w-full border p-2 pt-3 rounded-lg text-right font-bold text-sm" 
                      />
                      <button 
                        onClick={() => openAdder(i)} 
                        className="absolute left-1 bottom-1 bg-gray-100 text-[10px] w-4 h-4 rounded-full border flex items-center justify-center hover:bg-blue-100 transition-colors"
                        title="Cộng nhiều số"
                      >
                        Σ
                      </button>
                      {rec.transfer_count ? (
                        <div className="absolute right-1 -bottom-4 text-[8px] text-blue-500 font-bold whitespace-nowrap">
                          * Đã cộng {rec.transfer_count} số
                        </div>
                      ) : null}
                    </div>
                    <div className="relative">
                      <span className="absolute left-2 top-1 text-[8px] text-gray-400 font-bold">TM</span>
                      <input 
                        type="text" 
                        value={fmt(rec.cash)} 
                        onFocus={e => rec.cash === 0 && updateRow(i, 'cash', '')}
                        onBlur={e => rec.cash === 0 && updateRow(i, 'cash', 0)}
                        onChange={e => updateRow(i, 'cash', parseMoney(e.target.value))} 
                        className="w-full border p-2 pt-3 rounded-lg text-right font-bold text-sm" 
                      />
                    </div>
                  </div>
                  <button onClick={() => doSave(i)} disabled={saving === i} className="bg-blue-600 text-white w-14 h-10 rounded-lg font-bold text-xs shadow disabled:opacity-50">{saving === i ? '...' : 'Lưu'}</button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addEmptyRow} className="flex-1 bg-gray-50 border p-2 rounded-xl font-bold text-xs">+ Dòng mới</button>
            <button onClick={doSaveAll} disabled={savingAll} className="flex-1 bg-blue-700 text-white p-2 rounded-xl font-black text-xs shadow disabled:opacity-50">{savingAll ? 'Lưu tất cả...' : 'LƯU TẤT CẢ'}</button>
          </div>
        </div>
      </div>

      {/* KẾT QUẢ THÁNG */}
      <div className="bg-green-50/30 rounded-3xl shadow-xl border border-green-100 overflow-hidden backdrop-blur-sm transition-all hover:shadow-2xl">
        <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 px-5 py-4 text-white shadow-md">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h1 className="font-bold text-[10px] uppercase text-gray-400 tracking-widest mb-1 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Tháng {currentMonth.replace('-', '/')}
              </h1>
              <div className="font-black text-green-400 text-2xl drop-shadow-md">{fmt(monthTotalKT)}đ</div>
            </div>
            <div className="flex gap-2">
              {selectedIds.length > 0 && <button onClick={doDeleteSelection} className="bg-red-500 text-white px-3 py-1 text-[10px] font-bold rounded shadow animate-pulse">XÓA ({selectedIds.length})</button>}
              <button onClick={exportToExcel} className="bg-white/10 p-2 rounded-lg">📥</button>
            </div>
          </div>
          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden border border-white/5"><div className="bg-green-500 h-full transition-all duration-700" style={{ width: `${progressPct}%` }}></div></div>
          <div className="flex justify-between mt-1 text-[8px] font-bold text-gray-400 uppercase tracking-tighter">
            <span>Tiến độ: {progressPct.toFixed(1)}%</span>
            <span>Mục tiêu: {fmt(monthlyTarget)}đ</span>
          </div>
          {/* TRẠNG THÁI BÙ - Chỉ hiện khi có ít nhất 1 bản ghi KT=0 trong tháng */}
          {monthlyTarget > 0 && monthlyRecords.some(r => r.accounting_amount === 0) && (
            <div className="mt-2 text-[8px] text-orange-400 bg-orange-400/10 px-2 py-1 rounded inline-block font-bold animate-pulse">
              ⚠️ Đang kích hoạt chế độ bù KT (do có ngày nghỉ/KT=0)
            </div>
          )}
          {/* GHI CHÚ KHOẢNG AUTO */}
          <div className="mt-2 text-[8px] text-gray-400 italic border-t border-white/5 pt-1 flex justify-between">
             <span>Dải A: {fmt(settings?.range_a_min)}-{fmt(settings?.range_a_max)}</span>
             <span>Dải B: {fmt(settings?.range_b_min)}-{fmt(settings?.range_b_max)}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-[9px] uppercase font-bold text-gray-400 border-b">
                <th className="px-2 py-2 w-6"><input type="checkbox" checked={selectedIds.length === monthlyRecords.length && monthlyRecords.length > 0} onChange={toggleSelectAll} /></th>
                <th className="px-1 py-2">Ngày</th>
                <th className="px-2 py-2">Hàng</th>
                <th className="px-2 py-2 text-right">CK</th>
                <th className="px-2 py-2 text-right">TM</th>
                <th className="px-2 py-2 text-right text-green-600">KT</th>
                {isAdmin && <th className="px-2 py-2 text-center">Sửa</th>}
              </tr>
            </thead>
            <tbody className="divide-y text-[11px]">
              {monthlyRecords.length === 0 ? (
                <tr><td colSpan={isAdmin ? 6 : 5} className="text-center py-6 text-gray-400 italic">Chưa có dữ liệu</td></tr>
              ) : monthlyRecords.map((r) => {
                const isEditing = editingId === r.id;
                return (
                  <tr key={r.id} className={`${selectedIds.includes(r.id) ? 'bg-red-50' : ''} ${isEditing ? 'bg-blue-50' : ''}`}>
                    <td className="px-2 py-2">
                       {!isEditing && <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleSelect(r.id)} />}
                    </td>
                    
                    {isEditing ? (
                      <td colSpan={isAdmin ? 6 : 5} className="p-3 bg-blue-50 rounded-xl border-2 border-blue-200">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-blue-600 uppercase">Chỉnh sửa bản ghi</span>
                            <button onClick={() => setEditingId(null)} className="text-gray-400 text-lg">✕</button>
                          </div>
                          
                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Ngày (Năm-Tháng-Ngày)</label>
                            <input 
                              type="text" 
                              value={editFormData.date} 
                              onChange={e => setEditFormData({...editFormData, date: e.target.value})} 
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-blue-500 font-bold" 
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Tên hàng hóa</label>
                            <input 
                              type="text" 
                              value={editFormData.product_name} 
                              onChange={e => setEditFormData({...editFormData, product_name: e.target.value})} 
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-blue-500 font-black" 
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Tiền chuyển khoản (CK)</label>
                            <input 
                              type="text" 
                              value={fmt(editFormData.transfer)} 
                              onChange={e => setEditFormData({...editFormData, transfer: parseMoney(e.target.value)})} 
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-blue-500 font-bold text-right" 
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Tiền mặt (TM)</label>
                            <input 
                              type="text" 
                              value={fmt(editFormData.cash)} 
                              onChange={e => setEditFormData({...editFormData, cash: parseMoney(e.target.value)})} 
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-blue-500 font-bold text-right" 
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-green-600 uppercase mb-1 text-center">Mẫu KT (Có thể chỉnh 0 nếu nghỉ)</label>
                            <input 
                              type="text" 
                              value={fmt(editFormData.accounting_amount)} 
                              onChange={e => setEditFormData({...editFormData, accounting_amount: parseMoney(e.target.value)})} 
                              className="w-full border-2 border-green-400 rounded-lg px-3 py-2 text-base bg-white outline-none focus:ring-2 focus:ring-green-400 font-black text-right text-green-700" 
                            />
                          </div>

                          <div className="flex gap-2 pt-1">
                            <button onClick={handleSaveEdit} className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold text-sm shadow-md active:scale-95">LƯU THAY ĐỔI</button>
                            <button onClick={() => setEditingId(null)} className="flex-1 bg-gray-200 text-gray-600 py-2 rounded-lg font-bold text-sm active:scale-95">HỦY</button>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-1 py-2 text-gray-400 text-[9px]">
                          {(() => {
                            const d = new Date(r.date + 'T00:00:00');
                            return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                          })()}
                        </td>
                        <td className="px-2 py-2 font-medium text-gray-700 truncate max-w-[70px]">{r.product_name}</td>
                        <td className="px-2 py-2 text-right">{fmt(r.transfer)}</td>
                        <td className="px-2 py-2 text-right">{fmt(r.cash)}</td>
                        <td className="px-2 py-2 text-right font-bold text-green-700">{fmt(r.accounting_amount)}</td>
                        {isAdmin && (
                          <td className="px-2 py-2 text-center">
                            <button onClick={() => startEdit(r)}>✏️</button>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* QUICK ADDER MODAL */}
      {adderRowIndex !== null && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden animate-in zoom-in duration-200">
            <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
              <h3 className="font-black text-sm uppercase tracking-tighter">Bộ Cộng Dữ Liệu CK</h3>
              <button onClick={closeAdder} className="text-xl">✕</button>
            </div>
            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {adderValues.map((val, idx) => (
                <div key={idx} className="flex gap-2">
                  <input 
                    type="text" 
                    autoFocus={idx === adderValues.length - 1}
                    value={fmt(val)} 
                    onChange={e => {
                      const nv = [...adderValues];
                      nv[idx] = String(parseMoney(e.target.value));
                      setAdderValues(nv);
                    }}
                    placeholder="Nhập số tiền..."
                    className="flex-1 border-2 border-gray-100 p-2 rounded-xl text-right font-bold focus:border-blue-400 outline-none"
                  />
                  {idx === adderValues.length - 1 && (
                    <button 
                      onClick={() => {
                        const nv = [...adderValues];
                        if (nv[idx] !== '' && !nv[idx].endsWith('000')) {
                          nv[idx] = nv[idx] + '000';
                        }
                        setAdderValues([...nv, '']);
                      }} 
                      className="bg-blue-600 text-white w-10 h-10 rounded-xl font-bold text-xl shadow-md active:scale-95"
                    >
                      +
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="p-4 bg-gray-50 flex gap-2 border-t">
              <button onClick={handleSumAdder} className="flex-1 bg-blue-600 text-white p-3 rounded-2xl font-black text-xs shadow-lg active:scale-95">CỘNG & ĐƯA VÀO CK</button>
              <button onClick={closeAdder} className="bg-gray-200 text-gray-500 px-4 rounded-2xl font-bold text-xs uppercase">Hủy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
