const HEADERS = [
  'No.', 'Description', 'Quantity', 'SKU', 'Date In', 'Date Out',
  'No. of Pkgs', 'Dimension', 'Weight', 'Expiry Date', 'Customer Name', 'Remark',
];

function esc(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportToCSV(records) {
  const rows = [HEADERS.join(',')];
  for (const r of records) {
    rows.push([
      r.id, r.description, r.quantity, r.sku, r.dateIn, r.dateOut,
      r.numPackages, r.dimension, r.weight, r.expiryDate, r.customerName, r.remark,
    ].map(esc).join(','));
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  link.href = url;
  link.download = `inventory-export-${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
