'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';

type Record = {
  id?: string;
  product_name: string;
  cash: number;
  transfer: number;
  accounting_amount: number;
  date?: string;
  isNew?: boolean;
};

export default function DailyEntryForm({ settings }: { settings: any }) {
  const { appUser } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [inputRows, setInputRows] = useState<Record[]>([]);
  const [monthlyRecords, setMonthlyRecords] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [newProductName, setNewProductName] = useState('');

  const currentMonth = date.substring(0, 7); // YYYY-MM

  useEffect(() => {
    if (appUser?.shop_id) {
      loadTodayRows();
      loadMonthlyResults();
    }
  }, [appUser, date]);

  // Load input rows: today's existing records OR previous day's product list
  const loadTodayRows = async () => {
    if (!appUser?.shop_id) return;

    // 1. Check if today already has records
    const { data: todayData } = await supabase
      .from('daily_records')
      .select('*')
      .eq('shop_id', appUser.shop_id)
      .eq('date', date);

    if (todayData && todayData.length > 0) {
      setInputRows(todayData.map(r => ({ ...r })));
      return;
    }

    // 2. If not, get the most recent day's product names to auto-fill
    const { data: recentData } = await supabase
      .from('daily_records')
      .select('product_name, date')
      .eq('shop_id', appUser.shop_id)
      .lt('date', date)
      .order('date', { ascending: false })
      .limit(20);

    if (recentData && recentData.length > 0) {
      // Get the latest date
      const latestDate = recentData[0].date;
      const products = recentData
        .filter(r => r.date === latestDate)
        .map(r => r.product_name);
      const unique = Array.from(new Set(products));
      setInputRows(unique.map(p => ({
        product_name: p,
        cash: 0,
        transfer: 0,
        accounting_amount: 0,
        isNew: true
      })));
    } else {
      // Brand new — give 1 empty row
      setInputRows([{ product_name: '', cash: 0, transfer: 0, accounting_amount: 0, isNew: true }]);
    }
  };

  // Load all records for current month, sorted newest first
  const loadMonthlyResults = async () => {
    if (!appUser?.shop_id) return;
    const startOfMonth = currentMonth + '-01';
    const { data } = await supabase
      .from('daily_records')
      .select('*')
      .eq('shop_id', appUser.shop_id)
      .gte('date', startOfMonth)
      .order('date', { ascending: false })
      .order('product_name', { ascending: true });
    if (data) setMonthlyRecords(data);
  };

  // Auto-calculate KT: >= (transfer + cash), within [min_kt, max_kt]
  const calculateAutoKT = (transfer: number, cash: number): { value: number; warning: string } => {
    const base = transfer + cash;
    const min = settings?.min_kt || 0;
    const max = settings?.max_kt || Infinity;

    if (!settings) return { value: base, warning: '' };

    if (base > max) {
      return { value: max, warning: `⚠️ Tổng (TM+CK) vượt mức tối đa ${formatCurrency(max)}đ` };
    }
    const kt = Math.max(base, min);
    return { value: kt, warning: '' };
  };

  const handleSaveRow = async (index: number) => {
    const rec = inputRows[index];
    if (!rec.product_name.trim()) {
      alert('Vui lòng nhập tên hàng hóa!');
      return;
    }
    if (!appUser?.shop_id) return;
    setSaving(true);

    const { value: kt, warning } = calculateAutoKT(rec.transfer, rec.cash);

    if (rec.id) {
      await supabase.from('daily_records').update({
        cash: rec.cash,
        transfer: rec.transfer,
        accounting_amount: kt
      }).eq('id', rec.id);
    } else {
      const { data: inserted } = await supabase.from('daily_records').insert({
        shop_id: appUser.shop_id,
        date,
        product_name: rec.product_name,
        cash: rec.cash,
        transfer: rec.transfer,
        accounting_amount: kt
      }).select().single();

      if (inserted) {
        const newRows = [...inputRows];
        newRows[index] = { ...inserted };
        setInputRows(newRows);
      }
    }

    if (warning) alert(warning);
    await loadMonthlyResults();
    setSaving(false);
  };

  const handleSaveAll = async () => {
    if (!appUser?.shop_id) return;
    setSaving(true);
    for (let i = 0; i < inputRows.length; i++) {
      const rec = inputRows[i];
      if (!rec.product_name.trim()) continue;
      const { value: kt } = calculateAutoKT(rec.transfer, rec.cash);
      if (rec.id) {
        await supabase.from('daily_records').update({
          cash: rec.cash, transfer: rec.transfer, accounting_amount: kt
        }).eq('id', rec.id);
      } else {
        await supabase.from('daily_records').insert({
          shop_id: appUser.shop_id, date, product_name: rec.product_name,
          cash: rec.cash, transfer: rec.transfer, accounting_amount: kt
        });
      }
    }
    await loadTodayRows();
    await loadMonthlyResults();
    setSaving(false);
  };

  const addEmptyRow = () => {
    setInputRows([...inputRows, { product_name: '', cash: 0, transfer: 0, accounting_amount: 0, isNew: true }]);
  };

  const formatCurrency = (val: number) => {
    if (!val && val !== 0) return '0';
    return new Intl.NumberFormat('vi-VN').format(Math.round(val));
  };

  const handleCurrencyInput = (index: number, field: 'transfer' | 'cash') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/[^0-9]/g, '');
    const newRows = [...inputRows];
    newRows[index][field] = Number(rawValue);
    setInputRows(newRows);
  };

  const handleNameChange = (index: number, val: string) => {
    const newRows = [...inputRows];
    newRows[index].product_name = val;
    setInputRows(newRows);
  };

  // Group monthly records by date for display
  const groupedByDate = monthlyRecords.reduce((acc: any, rec: any) => {
    if (!acc[rec.date]) acc[rec.date] = [];
    acc[rec.date].push(rec);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  const monthTotalKT = monthlyRecords.reduce((s, r) => s + (r.accounting_amount || 0), 0);
  const yearlyTarget = settings?.yearly_kt_limit || 0;
  const monthTarget = yearlyTarget > 0 ? yearlyTarget / 12 : 0;

  return (
    <div className="space-y-6">
      {/* === INPUT SECTION === */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex flex-wrap justify-between items-center mb-5 gap-3">
          <h2 className="text-xl font-bold">Nhập Liệu Hàng Ngày</h2>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-500">Ngày:</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="border p-2 rounded-lg font-medium bg-gray-50 text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-blue-50 border-b-2 border-blue-100">
                <th className="p-3 text-sm font-semibold text-gray-700">Nhập Hàng Hóa Hôm Nay</th>
                <th className="p-3 text-sm font-semibold text-gray-700 text-right">Tiền Chuyển Khoản</th>
                <th className="p-3 text-sm font-semibold text-gray-700 text-right">Tiền Mặt</th>
                <th className="p-3 text-sm font-semibold text-green-700 text-right">Số Tiền (Mẫu KT)</th>
                <th className="p-3 text-sm font-semibold text-gray-700 text-center">Lưu</th>
              </tr>
            </thead>
            <tbody>
              {inputRows.map((rec, index) => {
                const { value: ktValue } = calculateAutoKT(rec.transfer, rec.cash);
                return (
                  <tr key={index} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-2">
                      <input
                        type="text"
                        value={rec.product_name}
                        onChange={e => handleNameChange(index, e.target.value)}
                        placeholder="Tên hàng hóa..."
                        className="border p-2 rounded w-full text-sm"
                        disabled={!!rec.id}
                      />
                    </td>
                    <td className="p-2">
                      <div className="relative">
                        <input type="text" className="border w-full p-2 pr-7 rounded text-right text-sm"
                          value={formatCurrency(rec.transfer)}
                          onChange={handleCurrencyInput(index, 'transfer')} />
                        <span className="absolute right-2 top-2.5 text-gray-400 text-xs">đ</span>
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="relative">
                        <input type="text" className="border w-full p-2 pr-7 rounded text-right text-sm"
                          value={formatCurrency(rec.cash)}
                          onChange={handleCurrencyInput(index, 'cash')} />
                        <span className="absolute right-2 top-2.5 text-gray-400 text-xs">đ</span>
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="relative">
                        <input type="text" disabled
                          className="border w-full p-2 pr-7 rounded bg-green-50 text-green-700 font-bold text-right text-sm"
                          value={formatCurrency(ktValue)} />
                        <span className="absolute right-2 top-2.5 text-green-500 text-xs">đ</span>
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      <button onClick={() => handleSaveRow(index)} disabled={saving}
                        className="bg-blue-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                        Lưu
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3 mt-4">
          <button onClick={addEmptyRow}
            className="border border-blue-300 text-blue-600 px-4 py-2 rounded text-sm hover:bg-blue-50">
            + Thêm dòng hàng hóa
          </button>
          <button onClick={handleSaveAll} disabled={saving}
            className="bg-blue-600 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Đang lưu...' : '💾 Lưu Tất Cả'}
          </button>
        </div>
      </div>

      {/* === MONTHLY RESULTS === */}
      <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div className="flex flex-wrap justify-between items-start mb-5 gap-3">
          <div>
            <h2 className="text-xl font-bold">Kết Quả Tháng {currentMonth.replace('-', '/')}</h2>
            <p className="text-sm text-gray-500 mt-1">Mỗi tháng mới sẽ bắt đầu tính lại từ đầu</p>
          </div>
          {monthTarget > 0 && (
            <div className="text-right">
              <div className="text-sm text-gray-500">Tổng Mẫu KT Tháng Này</div>
              <div className={`text-lg font-bold ${monthTotalKT > monthTarget ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(monthTotalKT)} đ
              </div>
              <div className="text-xs text-gray-400">/ Mục tiêu: {formatCurrency(monthTarget)} đ</div>
              <div className="mt-1 h-2 bg-gray-200 rounded-full w-40 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${monthTotalKT > monthTarget ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min((monthTotalKT / monthTarget) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {sortedDates.length === 0 ? (
          <p className="text-gray-400 text-center py-10">Chưa có dữ liệu trong tháng này.</p>
        ) : (
          <div className="space-y-4">
            {sortedDates.map(d => {
              const recs = groupedByDate[d];
              const dayTotal = recs.reduce((s: number, r: any) => s + (r.accounting_amount || 0), 0);
              const isToday = d === today;
              return (
                <div key={d} className={`rounded-lg border overflow-hidden ${isToday ? 'border-blue-300' : 'border-gray-100'}`}>
                  <div className={`px-4 py-2 flex justify-between items-center text-sm font-semibold ${isToday ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-700'}`}>
                    <span>{isToday ? '📅 Hôm Nay — ' : ''}{new Date(d + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
                    <span>Tổng Mẫu KT: {formatCurrency(dayTotal)} đ</span>
                  </div>
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50/50">
                        <th className="px-4 py-2 text-gray-500 font-medium">Hàng Hóa</th>
                        <th className="px-4 py-2 text-gray-500 font-medium text-right">Tiền CK</th>
                        <th className="px-4 py-2 text-gray-500 font-medium text-right">Tiền Mặt</th>
                        <th className="px-4 py-2 text-green-600 font-medium text-right">Mẫu KT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recs.map((r: any) => (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium">{r.product_name}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(r.transfer)} đ</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(r.cash)} đ</td>
                          <td className="px-4 py-2 text-right font-bold text-green-700">{formatCurrency(r.accounting_amount)} đ</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
