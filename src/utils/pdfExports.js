import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtDate, fmt } from './movementHelpers';

const BRAND = 'Zhenghe Logistics';
const PRIMARY = [30, 64, 175]; // blue-700

async function loadLogoBase64(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function header(doc, title, movement) {
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, 297, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');

  const logo = await loadLogoBase64('/zhl-logo-white.png');
  if (logo) {
    doc.addImage(logo, 'PNG', 8, 1.5, 50, 14);
  } else {
    doc.setFontSize(11);
    doc.text(BRAND, 10, 12);
  }

  doc.setFontSize(10);
  doc.text(title, 297 - 10, 12, { align: 'right' });

  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Movement No: ${movement.movement_no}`, 10, 24);
  doc.text(`Type: ${movement.type}   Status: ${movement.status}`, 10, 29);
  doc.text(`Date In: ${fmtDate(movement.date_in)}   Date Out: ${fmtDate(movement.date_out)}`, 10, 34);
  if (movement.salesperson) doc.text(`Staff: ${movement.salesperson}`, 297 - 10, 24, { align: 'right' });
  doc.text(`Printed: ${new Date().toLocaleDateString('en-SG')}`, 297 - 10, 29, { align: 'right' });

  doc.setDrawColor(200, 200, 200);
  doc.line(10, 37, 287, 37);
  return 42;
}

function supplierBlock(doc, movement, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 64, 175);
  doc.text('SUPPLIER / CUSTOMER', 10, y);
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  y += 5;
  if (movement.company_name) { doc.text(`Company: ${movement.company_name}`, 10, y); y += 4; }
  if (movement.contact_name) { doc.text(`Contact: ${movement.contact_name}`, 10, y); y += 4; }
  if (movement.phone) { doc.text(`Phone: ${movement.phone}`, 10, y); y += 4; }
  return y + 3;
}

function signatureFooter(doc, label, name, pageHeight) {
  const y = pageHeight - 25;
  doc.setDrawColor(180, 180, 180);
  doc.line(10, y, 80, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`${label}: ${name || '___________________'}`, 10, y + 5);
  doc.text(`Date: _______________`, 10, y + 10);
}

// ── GRN ──────────────────────────────────────────────────────────────────────
export async function exportGRN(movement, stockLines) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = await header(doc, 'GOODS RECEIVED NOTE', movement);

  y = supplierBlock(doc, movement, y);

  if (movement.commodity || movement.packages) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 64, 175);
    doc.text('CARGO DETAILS', 10, y);
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'normal');
    y += 5;
    const parts = [];
    if (movement.commodity) parts.push(`Commodity: ${movement.commodity}`);
    if (movement.packages) parts.push(`Packages: ${movement.packages}`);
    if (movement.weight_kg) parts.push(`Weight: ${movement.weight_kg} kg`);
    if (movement.cbm) parts.push(`CBM: ${movement.cbm}`);
    doc.text(parts.join('   '), 10, y);
    y += 8;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 64, 175);
  doc.text('STOCK RECEIVED', 10, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [['SKU', 'Description', 'Unit', 'Qty Ordered', 'Qty Received', 'Unit Cost (SGD)', 'Total (SGD)', 'Remarks']],
    body: stockLines.map((l) => [
      l.sku || '', l.description || '', l.unit || '',
      l.qty_ordered || 0, l.qty_actual || 0,
      fmt(l.unit_cost), fmt((l.qty_actual || 0) * (l.unit_cost || 0)), l.remarks || '',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    margin: { left: 10, right: 10 },
  });

  signatureFooter(doc, 'Received by', movement.salesperson, doc.internal.pageSize.height);
  doc.save(`GRN-${movement.movement_no.replace('/', '-')}.pdf`);
}

// ── Delivery Order ────────────────────────────────────────────────────────────
export async function exportDO(movement, stockLines) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = await header(doc, 'DELIVERY ORDER', movement);

  // Customer + Delivery
  const col2 = 150;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 64, 175);
  doc.text('CUSTOMER', 10, y);
  doc.text('DELIVERY ADDRESS', col2, y);
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  y += 5;
  if (movement.company_name) { doc.text(movement.company_name, 10, y); doc.text(movement.delivery_address || '', col2, y); y += 4; }
  if (movement.contact_name) { doc.text(movement.contact_name, 10, y); if (movement.delivery_contact_name) doc.text(movement.delivery_contact_name, col2, y); y += 4; }
  if (movement.phone) { doc.text(movement.phone, 10, y); if (movement.delivery_contact_number) doc.text(movement.delivery_contact_number, col2, y); y += 4; }
  if (movement.customer_ref) { doc.text(`Ref: ${movement.customer_ref}`, 10, y); y += 4; }
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['SKU', 'Description', 'Unit', 'Qty Dispatched', 'Remarks']],
    body: stockLines.map((l) => [
      l.sku || '', l.description || '', l.unit || '', l.qty_actual || 0, l.remarks || '',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    margin: { left: 10, right: 10 },
  });

  signatureFooter(doc, 'Prepared by', movement.salesperson, doc.internal.pageSize.height);
  doc.save(`DO-${movement.movement_no.replace('/', '-')}.pdf`);
}

// ── Internal Movement Report ──────────────────────────────────────────────────
export async function exportInternalReport(movement, costLines, stockLines) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = await header(doc, 'INTERNAL MOVEMENT REPORT', movement);

  // Info block
  const col2 = 150;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 64, 175);
  doc.text('SUPPLIER / CUSTOMER', 10, y);
  doc.text('DELIVERY', col2, y);
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  y += 5;
  const infoRows = [
    [movement.company_name, movement.delivery_address],
    [movement.contact_name, movement.delivery_contact_name],
    [movement.phone, movement.delivery_contact_number],
  ];
  infoRows.forEach(([l, r]) => {
    if (l || r) { if (l) doc.text(l, 10, y); if (r) doc.text(r, col2, y); y += 4; }
  });
  if (movement.notes) { doc.setFont('helvetica', 'italic'); doc.text(`Notes: ${movement.notes}`, 10, y); y += 4; }
  y += 3;

  // Cost Lines
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 64, 175);
  doc.text('COST LINES', 10, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [['Vendor', 'Service', 'Invoice No.', 'Invoice Date', 'Currency', 'Amount (Local)', 'FX Rate', 'Amount (SGD)', 'Total Payable', 'Remarks']],
    body: costLines.map((l) => [
      l.vendor || '', l.service || '', l.invoice_no || '', fmtDate(l.invoice_date),
      l.currency || 'SGD', fmt(l.amount_local), l.fx_rate || 1,
      fmt(l.amount_sgd), fmt(l.total_payable), l.remarks || '',
    ]),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    margin: { left: 10, right: 10 },
  });

  y = doc.lastAutoTable.finalY + 6;

  // Stock Lines
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 64, 175);
  doc.text('STOCK LINES', 10, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [['SKU', 'Description', 'Unit', 'Qty Ordered', 'Qty Actual', 'Unit Cost (SGD)', 'Total (SGD)', 'Remarks']],
    body: stockLines.map((l) => [
      l.sku || '', l.description || '', l.unit || '',
      l.qty_ordered || 0, l.qty_actual || 0,
      fmt(l.unit_cost), fmt((l.qty_actual || 0) * (l.unit_cost || 0)), l.remarks || '',
    ]),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 255] },
    margin: { left: 10, right: 10 },
  });

  y = doc.lastAutoTable.finalY + 6;

  // P&L
  const totalCost = costLines.reduce((s, l) => s + (Number(l.amount_sgd) || 0), 0);
  const sale = Number(movement.total_sale) || 0;
  const profit = sale - totalCost;
  const gp = sale > 0 ? ((profit / sale) * 100).toFixed(1) : '0.0';

  if (y > doc.internal.pageSize.height - 50) { doc.addPage(); y = 15; }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 64, 175);
  doc.text('P & L SUMMARY', 10, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    head: [['Total Cost (SGD)', 'Total Sale (SGD)', 'Profit (SGD)', 'GP%']],
    body: [[fmt(totalCost), fmt(sale), fmt(profit), `${gp}%`]],
    styles: { fontSize: 9, cellPadding: 3, fontStyle: 'bold' },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
    bodyStyles: { fillColor: [240, 245, 255] },
    margin: { left: 10, right: 10 },
    tableWidth: 160,
  });

  signatureFooter(doc, 'Prepared by', movement.salesperson, doc.internal.pageSize.height);
  doc.save(`Report-${movement.movement_no.replace('/', '-')}.pdf`);
}

// ── Release Order ─────────────────────────────────────────────────────────────
export async function exportReleaseOrder(movement, releaseOrder) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const pageH = doc.internal.pageSize.height;

  // Header bar
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, W, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');

  const logo = await loadLogoBase64('/zhl-logo-white.png');
  if (logo) {
    doc.addImage(logo, 'PNG', 8, 1.5, 40, 14);
  } else {
    doc.setFontSize(11);
    doc.text(BRAND, 10, 12);
  }

  doc.setFontSize(10);
  doc.text('RELEASE ORDER', W - 10, 12, { align: 'right' });

  // Sub-header
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Movement No: ${movement.movement_no}`, 10, 26);
  doc.text(`Type: ${movement.type}   Status: ${movement.status}`, 10, 31);
  doc.text(`Date In: ${fmtDate(movement.date_in)}   Date Out: ${fmtDate(movement.date_out)}`, 10, 36);
  doc.text(`Printed: ${new Date().toLocaleDateString('en-SG')}`, W - 10, 26, { align: 'right' });
  if (movement.salesperson) doc.text(`Prepared by: ${movement.salesperson}`, W - 10, 31, { align: 'right' });
  doc.setDrawColor(200, 200, 200);
  doc.line(10, 40, W - 10, 40);

  let y = 47;

  // Cargo release details table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...PRIMARY);
  doc.text('CARGO RELEASE DETAILS', 10, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Field', 'Details']],
    body: [
      ['Company', releaseOrder.company_name || ''],
      ['Collector / Driver', releaseOrder.collector_name || ''],
      ['Quantity Out', String(releaseOrder.qty_out ?? 0)],
      ['Number of Cartons', String(releaseOrder.num_cartons ?? 0)],
      ['Vehicle Number', releaseOrder.vehicle_number || ''],
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, fillColor: [245, 247, 255] }, 1: { cellWidth: 120 } },
    alternateRowStyles: {},
    margin: { left: 10, right: 10 },
  });

  y = doc.lastAutoTable.finalY + 14;

  // Two-column section: Company Stamp + Vehicle/Acknowledgement
  const colW = 85;
  const col2x = 10 + colW + 10;

  // Company Stamp box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...PRIMARY);
  doc.text('COMPANY STAMP', 10, y);
  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(250, 251, 255);
  doc.roundedRect(10, y + 4, colW, 45, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(200, 200, 200);
  doc.text('(Please affix company stamp here)', 10 + colW / 2, y + 28, { align: 'center' });

  // Collector acknowledgement box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...PRIMARY);
  doc.text('ACKNOWLEDGEMENT', col2x, y);
  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(250, 251, 255);
  doc.roundedRect(col2x, y + 4, colW, 45, 2, 2, 'FD');

  // Lines inside acknowledgement box
  doc.setDrawColor(200, 200, 200);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const ackY = y + 4;
  // Vehicle number line
  doc.text('Vehicle No.:', col2x + 4, ackY + 12);
  doc.line(col2x + 26, ackY + 13, col2x + colW - 4, ackY + 13);
  // Signature line
  doc.text('Signature:', col2x + 4, ackY + 26);
  doc.line(col2x + 22, ackY + 27, col2x + colW - 4, ackY + 27);
  // Date line
  doc.text('Date:', col2x + 4, ackY + 40);
  doc.line(col2x + 15, ackY + 41, col2x + colW - 4, ackY + 41);

  y += 65;

  // Terms / notes
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text('This release order serves as proof of cargo collection. Collector is responsible for verifying quantities before signing.', 10, y, { maxWidth: W - 20 });

  // Footer line
  doc.setDrawColor(200, 200, 200);
  doc.line(10, pageH - 12, W - 10, pageH - 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(180, 180, 180);
  doc.text(`${BRAND} · ${movement.movement_no} · Generated ${new Date().toLocaleDateString('en-SG')}`, W / 2, pageH - 7, { align: 'center' });

  doc.save(`RO-${movement.movement_no.replace('/', '-')}-${(releaseOrder.company_name || 'release').replace(/\s+/g, '-')}.pdf`);
}
