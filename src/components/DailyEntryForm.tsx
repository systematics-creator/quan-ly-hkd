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
  transfer_items?: string[];
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

  const lastProductKey = `hkd_last_product_${appUser?.id}`;

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
    const lastProduct = localStorage.getItem(lastProductKey) || '';
    setInputRows([{ product_name: lastProduct, cash: 0, transfer: 0, accounting_amount: 0, isNew: true, transfer_count: 0 }]);
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

  const roundKT = (val: number) => {
    let base = Math.floor(val / 1000) * 1000;
    let thousands = Math.floor(base / 1000) % 10;
    const allowed = [0, 5, 6, 8, 9];
    if (!allowed.includes(thousands)) {
      const nearest = allowed.reduce((prev, curr) => 
        Math.abs(curr - thousands) < Math.abs(prev - thousands) ? curr : prev
      );
      base = Math.floor(base / 10000) * 10000 + (nearest * 1000);
    }
    return base;
  };

  const getMinValidKT = (transfer: number, cash: number) => {
    if (transfer === 0 && cash === 0) return 0;
    if (transfer === 0) return 0; 
    const threshold = transfer + 90000;
    let temp = threshold;
    while (roundKT(temp) < threshold) {
      temp += 1000;
    }
    return roundKT(temp);
  };

  const calcKT = (transfer: number, cash: number, prevKT?: number) => {
    const raMin = settings?.range_a_min || 1800000;
    const raMax = settings?.range_a_max || 2300000;
    const rbMin = settings?.range_b_min || 2300000;
    const rbMax = settings?.range_b_max || 3400000;

    const dateParts = date.split('-');
    const y = dateParts.length > 0 ? Number(dateParts[0]) : new Date().getFullYear();
    const m = dateParts.length > 1 ? Number(dateParts[1]) : new Date().getMonth() + 1;
    
    const daysInMonth = new Date(y, m, 0).getDate() || 30;
    const dayOfMonth = new Date(date + 'T00:00:00').getDate() || 1;
    const monthlyTarget = (settings?.yearly_kt_limit || 0) / 12;
    
    const currentMonthTotal = monthlyRecords.reduce((s, r) => s + (r.accounting_amount || 0), 0);
    const idealProgress = (monthlyTarget / daysInMonth) * dayOfMonth;
    
    const gap = idealProgress - currentMonthTotal;
    const bias = gap > 0 ? Math.min(gap / (monthlyTarget / 3), 1) : 0;
    
    const isOverTarget = currentMonthTotal > monthlyTarget;
    const isOverProgress = (currentMonthTotal - idealProgress) > (monthlyTarget * 0.1);

    const weightedRandom = () => {
      const r = Math.random();
      return r * (1 - bias) + bias;
    };

    let result = 0;
    
    // CHẾ ĐỘ PHANH TỰ ĐỘNG
    if (isOverTarget || isOverProgress) {
        if (transfer === 0) {
           result = 0; // Hãm phanh: Về 0 nếu không có CK
        } else {
           result = transfer + 90000 + Math.floor(Math.random() * 50000); // Ép vào khoảng 90k-140k
        }
    } else {
        const rand = weightedRandom();
        if (transfer < 1500000) {
          const delta = Math.max(0, raMax - raMin);
          result = raMin + Math.floor(rand * delta);
        } else {
          const delta = Math.max(0, rbMax - rbMin);
          result = rbMin + Math.floor(rand * delta);
        }
    }

    const finalResult = (transfer === 0 && cash === 0) ? 0 : roundKT(result);
    
    let adjustedFinal = finalResult;
    if (transfer > 0) {
      const minKT = transfer + 90000;
      const maxKT = transfer + 140000;
      if (adjustedFinal < minKT || adjustedFinal > maxKT) {
        let tempResult = minKT + Math.floor(Math.random() * (maxKT - minKT));
        adjustedFinal = roundKT(tempResult);
        while (adjustedFinal < minKT) {
          tempResult += 1000;
          adjustedFinal = roundKT(tempResult);
        }
      }
    }

    return { value: adjustedFinal, isCompensated: bias > 0.1 };
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
      localStorage.setItem(lastProductKey, rec.product_name);
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

  const fixInvalidKT = async () => {
    if (!isAdmin || !confirm("Hệ thống sẽ kiểm tra: 1. CK=0, TM=0 => KT=0. 2. CK>0 => KT thuộc [CK+90k, CK+140k]. Tiếp tục?")) return;
    
    let fixCount = 0;
    const toFix = monthlyRecords.filter(r => {
        const kt = Number(r.accounting_amount) || 0;
        const ck = Number(r.transfer) || 0;
        const cash = Number(r.cash) || 0;
        
        // Nguyên tắc 1: Ngày nghỉ (CK=0, TM=0) thì KT bắt buộc = 0
        if (ck === 0 && cash === 0) return kt > 0;
        
        // Nguyên tắc 2: Có CK thì KT bắt buộc nằm trong [CK+90k, CK+140k]
        if (ck > 0) return kt < ck + 90000 || kt > ck + 140000;
        
        return false;
    });
    
    if (toFix.length === 0) {
      alert("Tuyệt vời! Không có bản ghi nào vi phạm các nguyên tắc KT.");
      return;
    }

    setSavingAll(true);
    for (const r of toFix) {
      const { value: newKT } = calcKT(Number(r.transfer), Number(r.cash));
      const { error } = await supabase.from('daily_records').update({ accounting_amount: newKT }).eq('id', r.id);
      if (!error) fixCount++;
    }
    setSavingAll(false);
    
    if (fixCount > 0) {
      alert(`Đã cập nhật ${fixCount} bản ghi!`);
      await loadMonthlyResults();
    }
  };

  const fixOverTarget = async () => {
    if (!isAdmin) return;
    const monthlyTarget = (settings?.yearly_kt_limit || 0) / 12;
    const monthTotalKT = monthlyRecords.reduce((s, r) => s + (r.accounting_amount || 0), 0);
    
    if (monthTotalKT <= monthlyTarget) {
      alert("Tổng KT hiện tại chưa vượt mục tiêu, không cần tối ưu giảm!");
      return;
    }
    if (!confirm("Hệ thống sẽ ĐIỀU CHỈNH GIẢM KT của tất cả các ngày trong tháng về mức sát Mục Tiêu nhất (vẫn giữ đúng luật KT thuộc [CK + 90k, CK + 140k]). Tiếp tục?")) return;

    setSavingAll(true);
    let excess = monthTotalKT - monthlyTarget;
    let fixCount = 0;

    const workingRecords = monthlyRecords.map(r => ({...r}));
    workingRecords.sort((a, b) => b.accounting_amount - a.accounting_amount);

    for (const r of workingRecords) {
      if (excess <= 0) break;
      
      const currentKT = Number(r.accounting_amount) || 0;
      const trans = Number(r.transfer) || 0;
      const cash = Number(r.cash) || 0;
      const minKT = getMinValidKT(trans, cash);

      if (currentKT > minKT) {
        let maxCanReduce = currentKT - minKT;
        let reduceAmount = Math.min(excess, maxCanReduce);
        
        let targetNewKT = currentKT - reduceAmount;
        let newKT = roundKT(targetNewKT);
        
        while (newKT < minKT) {
           newKT += 1000;
           newKT = roundKT(newKT);
        }
        
        // Ensure newKT is strictly >= transfer + 90k (if transfer > 0)
        const threshold = trans > 0 ? trans + 90000 : 0;
        if (threshold > 0 && newKT < threshold) {
            newKT = minKT;
        }

        const actualReduced = currentKT - newKT;
        
        if (actualReduced > 0) {
           excess -= actualReduced;
           const { error } = await supabase.from('daily_records').update({ accounting_amount: newKT }).eq('id', r.id);
           if (!error) fixCount++;
        }
      }
    }

    setSavingAll(false);
    if (fixCount > 0) {
      alert(`Đã tối ưu giảm KT cho ${fixCount} bản ghi! Tổng KT mới sẽ gần sát với mục tiêu.`);
      await loadMonthlyResults();
    } else {
      alert("Không thể giảm thêm được nữa vì các bản ghi đều đã ở mức tối thiểu (KT sát CK).");
    }
  };

  const updateRow = (index: number, field: keyof Row, val: any) => {
    const nr = [...inputRows]; 
    (nr[index] as any)[field] = val; 
    if (field === 'product_name' && val) {
      localStorage.setItem(lastProductKey, val);
    }
    setInputRows(nr);
  };

  const parseMoney = (v: any) => typeof v === 'string' ? Number(v.replace(/[^0-9]/g, '')) : Number(v);

  const addEmptyRow = () => {
    const prev = inputRows[inputRows.length - 1];
    setInputRows([...inputRows, { product_name: prev?.product_name || '', cash: 0, transfer: 0, accounting_amount: 0, isNew: true, transfer_count: 0 }]);
  };

  const openAdder = (index: number) => {
    setAdderRowIndex(index);
    const row = inputRows[index];
    if (row.transfer_items && row.transfer_items.length > 0) {
      setAdderValues(row.transfer_items);
    } else {
      setAdderValues(['']);
    }
  };

  const closeAdder = () => {
    setAdderRowIndex(null);
  };

  const handleSumAdder = () => {
    if (adderRowIndex === null) return;
    
    const items = adderValues.filter(v => v.trim() !== '');
    // Auto-append 000 to all shorthand values before summing
    const total = items.reduce((s, v) => {
      let num = parseMoney(v) || 0;
      if (num > 0 && num < 10000) num = num * 1000;
      return s + num;
    }, 0);
    
    const count = items.length;
    
    const nr = [...inputRows];
    nr[adderRowIndex] = { 
      ...nr[adderRowIndex], 
      transfer: total, 
      transfer_count: count,
      transfer_items: items.length > 0 ? items : undefined
    };
    setInputRows(nr);
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
 
  // Persistence: Save to localStorage
  useEffect(() => {
    if (inputRows.length > 0) {
      const hasContent = inputRows.some(r => r.product_name !== '' || r.cash !== 0 || r.transfer !== 0);
      if (hasContent) {
        localStorage.setItem(`hkd_draft_${date}_${appUser?.id}`, JSON.stringify(inputRows));
      }
    }
  }, [inputRows, date, appUser]);

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
                        readOnly={!!(rec.transfer_items && rec.transfer_items.length > 0)}
                        onClick={() => rec.transfer_items && rec.transfer_items.length > 0 && openAdder(i)}
                        onFocus={e => rec.transfer === 0 && !rec.transfer_items && updateRow(i, 'transfer', '')}
                        onBlur={e => rec.transfer === 0 && updateRow(i, 'transfer', 0)}
                        onChange={e => updateRow(i, 'transfer', parseMoney(e.target.value))} 
                        className={`w-full border p-2 pt-3 rounded-lg text-right font-bold text-sm ${rec.transfer_items?.length ? 'cursor-pointer bg-blue-50 border-blue-200 text-blue-700' : ''}`} 
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
              {isAdmin && <button onClick={fixOverTarget} className="bg-purple-500/20 hover:bg-purple-500/40 text-purple-400 border border-purple-500/30 px-2 py-1 text-[8px] font-bold rounded flex items-center gap-1 transition-colors"><span>🎯</span> TỐI ƯU MỤC TIÊU</button>}
              {isAdmin && <button onClick={fixInvalidKT} className="bg-orange-500/20 hover:bg-orange-500/40 text-orange-400 border border-orange-500/30 px-2 py-1 text-[8px] font-bold rounded flex items-center gap-1 transition-colors"><span>🛠️</span> FIX KT</button>}
              {selectedIds.length > 0 && <button onClick={doDeleteSelection} className="bg-red-500 text-white px-3 py-1 text-[10px] font-bold rounded shadow animate-pulse">XÓA ({selectedIds.length})</button>}
              <button onClick={exportToExcel} className="bg-white/10 p-2 rounded-lg">📥</button>
            </div>
          </div>
          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden border border-white/5"><div className="bg-green-500 h-full transition-all duration-700" style={{ width: `${progressPct}%` }}></div></div>
          <div className="flex justify-between mt-1 text-[8px] font-bold text-gray-400 uppercase tracking-tighter">
            <span>Tiến độ: {progressPct.toFixed(1)}%</span>
            <span>Mục tiêu: {fmt(monthlyTarget)}đ</span>
          </div>
          {/* TRẠNG THÁI BÙ/PHANH */}
          {monthlyTarget > 0 && monthTotalKT > monthlyTarget && (
            <div className="mt-2 text-[8px] text-red-400 bg-red-400/10 px-2 py-1 rounded inline-block font-bold animate-pulse">
              🛑 Đang kích hoạt chế độ PHANH HÃM (Do đã vượt mục tiêu tháng)
            </div>
          )}
          {monthlyTarget > 0 && monthTotalKT <= monthlyTarget && monthlyRecords.some(r => r.accounting_amount === 0) && (
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
                        <td className="px-1 py-2 text-sky-500 font-bold text-[9px]">
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
                    value={val === '' ? '' : fmt(val)} 
                    onChange={e => {
                      const nv = [...adderValues];
                      nv[idx] = e.target.value.replace(/[^0-9]/g, '');
                      setAdderValues(nv);
                    }}
                    placeholder="Số tiền..."
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
