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
    if (!appUser?.shop_id) return;
    const { data: todayData } = await supabase
      .from('daily_records').select('*')
      .eq('shop_id', appUser.shop_id).eq('date', date);

    if (todayData && todayData.length > 0) {
      setInputRows(todayData.map(r => ({ ...r })));
      return;
    }
    const { data: recentData } = await supabase
      .from('daily_records').select('product_name, date')
      .eq('shop_id', appUser.shop_id).lt('date', date)
      .order('date', { ascending: false }).limit(20);

    if (recentData && recentData.length > 0) {
      const latestDate = recentData[0].date;
      const products = recentData.filter(r => r.date === latestDate).map(r => r.product_name);
      setInputRows(Array.from(new Set(products)).map(p => ({
        product_name: p, cash: 0, transfer: 0, accounting_amount: 0, isNew: true
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
      .order('product_name', { ascending: true });
    if (data) setMonthlyRecords(data);
  };

  const calcKT = (transfer: number, cash: number) => {
    const base = transfer + cash;
    const min = settings?.min_kt || 0;
    const max = settings?.max_kt || Infinity;
    if (base > max) return { value: max, warn: `Tổng vượt mức tối đa ${fmt(max)}đ` };
    return { value: Math.max(base, min), warn: '' };
  };

  const doSave = async (index: number) => {
    const rec = inputRows[index];
    if (!rec.product_name.trim()) { alert('Nhập tên hàng hóa!'); return; }
    setSaving(index);
    const { value: kt, warn } = calcKT(rec.transfer, rec.cash);
    if (rec.id) {
      await supabase.from('daily_records').update({ cash: rec.cash, transfer: rec.transfer, accounting_amount: kt }).eq('id', rec.id);
    } else {
      const { data: ins } = await supabase.from('daily_records').insert({
        shop_id: appUser?.shop_id, date, product_name: rec.product_name,
        cash: rec.cash, transfer: rec.transfer, accounting_amount: kt
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
      const { value: kt } = calcKT(rec.transfer, rec.cash);
      if (rec.id) {
        await supabase.from('daily_records').update({ cash: rec.cash, transfer: rec.transfer, accounting_amount: kt }).eq('id', rec.id);
      } else {
        await supabase.from('daily_records').insert({
          shop_id: appUser?.shop_id, date, product_name: rec.product_name,
          cash: rec.cash, transfer: rec.transfer, accounting_amount: kt
        });
      }
    }
    await loadTodayRows();
    await loadMonthlyResults();
    setSavingAll(false);
  };

  const updateRow = (index: number, field: keyof Row, val: any) => {
    const nr = [...inputRows]; (nr[index] as any)[field] = val; setInputRows(nr);
  };

  const parseMoney = (v: string) => Number(v.replace(/[^0-9]/g, ''));

  const addEmptyRow = () =>
    setInputRows([...inputRows, { product_name: '', cash: 0, transfer: 0, accounting_amount: 0, isNew: true }]);

  // Monthly grouped
  const grouped: Record<string, any[]> = {};
  for (const r of monthlyRecords) { if (!grouped[r.date]) grouped[r.date] = []; grouped[r.date].push(r); }
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const monthTotalKT = monthlyRecords.reduce((s, r) => s + (r.accounting_amount || 0), 0);
  const monthTarget = settings?.yearly_kt_limit ? settings.yearly_kt_limit / 12 : 0;
  const pct = monthTarget > 0 ? Math.min((monthTotalKT / monthTarget) * 100, 100) : 0;

  return (
    <div className="space-y-5">

      {/* ===== INPUT SECTION ===== */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 flex justify-between items-center">
          <h2 className="text-white font-bold text-base">📝 Nhập Liệu Hàng Ngày</h2>
          <input
            type="date" value={date}
            onChange={e => setDate(e.target.value)}
            className="text-sm bg-white/20 text-white rounded-lg px-2 py-1 border border-white/30 focus:outline-none"
          />
        </div>

        <div className="p-4 space-y-3">
          {inputRows.map((rec, i) => {
            const { value: kt } = calcKT(rec.transfer, rec.cash);
            const isSavingThis = saving === i;
            return (
              <div key={i} className="rounded-xl border border-gray-200 overflow-hidden">
                {/* Product name row */}
                <div className="bg-gray-50 px-3 py-2 border-b border-gray-100">
                  <input
                    type="text"
                    value={rec.product_name}
                    onChange={e => updateRow(i, 'product_name', e.target.value)}
                    placeholder="Tên hàng hóa..."
                    disabled={!!rec.id}
                    className="w-full bg-transparent font-semibold text-gray-800 text-sm focus:outline-none disabled:text-gray-600"
                  />
                </div>
                {/* Money inputs */}
                <div className="grid grid-cols-2 divide-x divide-gray-100">
                  <div className="p-3">
                    <label className="text-xs text-gray-400 block mb-1">Tiền Chuyển Khoản</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={fmt(rec.transfer)}
                        onChange={e => updateRow(i, 'transfer', parseMoney(e.target.value))}
                        className="w-full text-right font-bold text-gray-800 text-base focus:outline-none"
                      />
                      <span className="text-gray-400 text-xs shrink-0">đ</span>
                    </div>
                  </div>
                  <div className="p-3">
                    <label className="text-xs text-gray-400 block mb-1">Tiền Mặt</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={fmt(rec.cash)}
                        onChange={e => updateRow(i, 'cash', parseMoney(e.target.value))}
                        className="w-full text-right font-bold text-gray-800 text-base focus:outline-none"
                      />
                      <span className="text-gray-400 text-xs shrink-0">đ</span>
                    </div>
                  </div>
                </div>
                {/* KT + Save row */}
                <div className="bg-green-50 border-t border-green-100 px-3 py-2 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-green-600">Mẫu KT (tự động)</span>
                    <div className="font-bold text-green-700 text-lg">{fmt(kt)}<span className="text-xs font-normal ml-1">đ</span></div>
                  </div>
                  <button
                    onClick={() => doSave(i)}
                    disabled={isSavingThis}
                    className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-bold active:bg-blue-700 disabled:opacity-50"
                  >
                    {isSavingThis ? '...' : '💾 Lưu'}
                  </button>
                </div>
              </div>
            );
          })}

          {/* Bottom actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={addEmptyRow}
              className="flex-1 border-2 border-dashed border-blue-200 text-blue-500 rounded-xl py-3 text-sm font-semibold hover:border-blue-400 active:bg-blue-50"
            >
              + Thêm hàng hóa
            </button>
            <button
              onClick={doSaveAll}
              disabled={savingAll}
              className="flex-1 bg-blue-600 text-white rounded-xl py-3 text-sm font-bold active:bg-blue-700 disabled:opacity-50"
            >
              {savingAll ? 'Đang lưu...' : '💾 Lưu Tất Cả'}
            </button>
          </div>
        </div>
      </div>

      {/* ===== MONTHLY RESULTS ===== */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-gray-700 to-gray-600 px-4 py-3 flex justify-between items-center flex-wrap gap-2">
          <h2 className="text-white font-bold text-base">📊 Kết Quả Tháng {currentMonth.replace('-', '/')}</h2>
          {monthTarget > 0 && (
            <div className="text-right">
              <div className="text-white/80 text-xs">Tổng Mẫu KT</div>
              <div className={`font-bold text-sm ${monthTotalKT > monthTarget ? 'text-red-300' : 'text-green-300'}`}>
                {fmt(monthTotalKT)} đ
              </div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {monthTarget > 0 && (
          <div className="px-4 pt-3 pb-1">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>0</span>
              <span>{Math.round(pct)}% mục tiêu tháng</span>
              <span>{fmt(monthTarget)} đ</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        <div className="p-4 space-y-3">
          {sortedDates.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">Chưa có dữ liệu trong tháng này.</p>
          ) : sortedDates.map(d => {
            const recs = grouped[d];
            const dayTotalKT = recs.reduce((s: number, r: any) => s + (r.accounting_amount || 0), 0);
            const isToday = d === today;
            return (
              <div key={d} className={`rounded-xl border overflow-hidden ${isToday ? 'border-blue-300' : 'border-gray-100'}`}>
                <div className={`px-3 py-2 flex justify-between items-center text-sm font-semibold ${isToday ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-700'}`}>
                  <span>
                    {isToday ? '📅 Hôm Nay · ' : ''}
                    {new Date(d + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                  </span>
                  <span className={`font-bold text-sm ${isToday ? 'text-white' : 'text-green-600'}`}>{fmt(dayTotalKT)} đ</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {recs.map((r: any) => (
                    <div key={r.id} className="px-3 py-2 flex justify-between items-center">
                      <div>
                        <div className="font-medium text-sm text-gray-800">{r.product_name}</div>
                        <div className="text-xs text-gray-400">CK: {fmt(r.transfer)} đ · TM: {fmt(r.cash)} đ</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-700 text-sm">{fmt(r.accounting_amount)} đ</div>
                        <div className="text-xs text-gray-400">Mẫu KT</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
