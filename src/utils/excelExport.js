import * as XLSX from 'xlsx';
import { fmtDate, fmt } from './movementHelpers';

export function exportMovementsExcel(movements) {
  const rows = movements.map((m) => {
    const totalCost = (m.cost_lines || []).reduce((s, l) => s + (Number(l.amount_sgd) || 0), 0);
    const sale = Number(m.total_sale) || 0;
    const profit = sale - totalCost;
    const gp = sale > 0 ? ((profit / sale) * 100).toFixed(1) + '%' : '—';
    return {
      'Movement No.': m.movement_no,
      'Type': m.type,
      'Status': m.status,
      'Company': m.company_name || '',
      'Salesperson': m.salesperson || '',
      'Date In': fmtDate(m.date_in),
      'Date Out': fmtDate(m.date_out),
      'Total Cost (SGD)': totalCost,
      'Total Sale (SGD)': sale,
      'Profit (SGD)': profit,
      'GP%': gp,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Movements');

  // Column widths
  ws['!cols'] = [
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 24 },
    { wch: 16 }, { wch: 12 }, { wch: 12 },
    { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 10 },
  ];

  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `movements-${date}.xlsx`);
}
