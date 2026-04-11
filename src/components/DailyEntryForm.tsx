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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>(null);

  const currentMonth = date.substring(0, 7);

  useEffect(() => {
    if (appUser?.shop_id) {
      loadTodayRows();
      loadMonthlyResults();
    }
  }, [appUser, date]);

  const loadTodayRows = async () => {
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

    let result = 0;
    if (transfer < 1500000) {
      const delta = Math.max(0, raMax - raMin - 2);
      result = raMin + 1 + Math.floor(Math.random() * (delta + 1));
    } else {
      const delta = Math.max(0, rbMax - rbMin);
      result = rbMin + Math.floor(Math.random() * (delta + 1));
    }

    if (Math.abs(result - (prevKT || 0)) < 100) result += 333;

    const min = settings?.min_kt || 0;
    const max = settings?.max_kt || Infinity;
    const finalVal = Math.max(min, Math.min(max, result));
    return { value: finalVal };
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
    if (!rec.product_name.trim() || (rec.cash === 0 && rec.transfer === 0)) { alert('Nhập dữ liệu!'); return; }
    setSaving(index);
    const { data: history } = await supabase.from('daily_records').select('accounting_amount').eq('product_name', rec.product_name).eq('shop_id', appUser?.shop_id).order('created_at', { ascending: false }).limit(1);
    const lastKT = (history && history.length > 0) ? history[0].accounting_amount : 0;
    const { value: kt } = calcKT(rec.transfer, rec.cash, lastKT);
    const { data: ins, error } = await supabase.from('daily_records').insert({ cash: rec.cash, transfer: rec.transfer, accounting_amount: kt, product_name: rec.product_name, shop_id: appUser?.shop_id, date }).select().single();
    if (!error) {
      const nr = [...inputRows];
      nr[index] = { product_name: rec.product_name, cash: 0, transfer: 0, accounting_amount: ins.accounting_amount, isNew: true };
      setInputRows(nr);
      await loadMonthlyResults();
    }
    setSaving(null);
  };

  const doSaveAll = async () => {
    setSavingAll(true);
    for (const rec of inputRows) {
      if (!rec.product_name.trim() || (rec.cash === 0 && rec.transfer === 0)) continue;
      const { data: history } = await supabase.from('daily_records').select('accounting_amount').eq('product_name', rec.product_name).eq('shop_id', appUser?.shop_id).order('created_at', { ascending: false }).limit(1);
      const { value: kt } = calcKT(rec.transfer, rec.cash, (history && history.length > 0) ? history[0].accounting_amount : 0);
      await supabase.from('daily_records').insert({ cash: rec.cash, transfer: rec.transfer, accounting_amount: kt, product_name: rec.product_name, shop_id: appUser?.shop_id, date });
    }
    await loadTodayRows();
    await loadMonthlyResults();
    setSavingAll(false);
  };

  const startEdit = (record: any) => {
    setEditingId(record.id);
    setEditFormData({ ...record });
  };

  const handleSaveEdit = async () => {
    if (!editFormData) return;
    const { value: kt } = calcKT(editFormData.transfer, editFormData.cash, editFormData.accounting_amount);
    const { error } = await supabase.from('daily_records').update({
      date: editFormData.date,
      product_name: editFormData.product_name,
      transfer: editFormData.transfer,
      cash: editFormData.cash,
      accounting_amount: kt
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
    setInputRows([...inputRows, { product_name: prev?.product_name || '', cash: 0, transfer: 0, accounting_amount: 0, isNew: true }]);
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
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-blue-600 px-4 py-3 flex justify-between items-center text-white">
          <h2 className="font-bold text-sm uppercase">📝 Nhập Liệu</h2>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-white/20 border border-white/30 rounded-lg px-2 py-0.5 text-xs outline-none" />
        </div>
        <div className="p-2">
          <div className="space-y-2">
            {inputRows.map((rec, i) => (
              <div key={i} className="flex flex-col gap-1 pb-3 border-b last:border-0 last:pb-0">
                <input type="text" value={rec.product_name} onChange={e => updateRow(i, 'product_name', e.target.value)} placeholder="Tên hàng hóa..." className="bg-gray-50 border p-2 rounded-lg font-bold text-sm outline-none" />
                <div className="flex gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div className="relative"><span className="absolute left-2 top-1 text-[8px] text-gray-400 font-bold">CK</span><input type="text" value={fmt(rec.transfer)} onChange={e => updateRow(i, 'transfer', parseMoney(e.target.value))} className="w-full border p-2 pt-3 rounded-lg text-right font-bold text-sm" /></div>
                    <div className="relative"><span className="absolute left-2 top-1 text-[8px] text-gray-400 font-bold">TM</span><input type="text" value={fmt(rec.cash)} onChange={e => updateRow(i, 'cash', parseMoney(e.target.value))} className="w-full border p-2 pt-3 rounded-lg text-right font-bold text-sm" /></div>
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
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gray-800 px-4 py-3 text-white">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h1 className="font-bold text-[10px] uppercase text-gray-400">📊 Tháng {currentMonth.replace('-', '/')}</h1>
              <div className="font-black text-green-400 text-lg">{fmt(monthTotalKT)}đ</div>
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
          {/* GHI CHÚ KHOẢNG AUTO */}
          <div className="mt-2 text-[8px] text-gray-500 italic border-t border-white/5 pt-1">
             Ghi chú: [A: {fmt(settings?.range_a_min || 1800000)}-{fmt(settings?.range_a_max || 2300000)}] | [B: {fmt(settings?.range_b_min || 2300000)}-{fmt(settings?.range_b_max || 3400000)}]
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
                      <>
                        <td className="px-1 py-1">
                          <input 
                            type="text" 
                            value={editFormData.date} 
                            onChange={e => setEditFormData({...editFormData, date: e.target.value})} 
                            className="w-full border border-blue-300 rounded px-1 py-2 text-[10px] bg-white focus:scale-110 focus:shadow-xl focus:z-50 relative transition-all outline-none" 
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input 
                            type="text" 
                            value={editFormData.product_name} 
                            onChange={e => setEditFormData({...editFormData, product_name: e.target.value})} 
                            className="w-full border border-blue-300 rounded px-2 py-2 font-bold text-sm bg-white focus:scale-125 focus:shadow-xl focus:z-50 relative transition-all outline-none min-w-[120px]" 
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input 
                            type="text" 
                            value={fmt(editFormData.transfer)} 
                            onChange={e => setEditFormData({...editFormData, transfer: parseMoney(e.target.value)})} 
                            className="w-full border border-blue-300 rounded px-1 py-2 text-right font-black text-sm bg-white focus:scale-110 focus:shadow-xl focus:z-50 relative transition-all outline-none" 
                          />
                        </td>
                        <td className="px-1 py-1 text-right font-bold text-green-600">Auto</td>
                        <td className="px-1 py-1 text-center flex gap-1 justify-center items-center h-full pt-1">
                           <button onClick={handleSaveEdit} className="text-xl active:scale-95">✅</button>
                           <button onClick={() => setEditingId(null)} className="text-xl active:scale-95">❌</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-1 py-2 text-gray-400 text-[9px]">{new Date(r.date + 'T00:00:00').toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</td>
                        <td className="px-2 py-2 font-medium text-gray-700 truncate max-w-[70px]">{r.product_name}</td>
                        <td className="px-2 py-2 text-right">{fmt(r.transfer)}</td>
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
    </div>
  );
}
