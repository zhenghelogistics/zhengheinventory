import { jsonrepair } from 'jsonrepair';

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
  });

/**
 * Extract items from a packing list PDF or image.
 * Returns { supplier, reference_no, date, items: [{description, sku, quantity, unit}] }
 */
export async function extractPackingList(file, onProgress) {
  onProgress?.('Reading document…');
  const base64 = await fileToBase64(file);

  onProgress?.('Analysing with AI…');
  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mediaType: file.type || 'application/pdf' }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Extraction failed (${res.status})`);
  }

  const { text } = await res.json();
  if (!text) throw new Error('No response from AI');

  // Strip markdown code fences if present
  let clean = text;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    clean = fence[1].trim();
  } else {
    clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const start = clean.indexOf('{');
    if (start > 0) clean = clean.slice(start);
  }

  const data = JSON.parse(jsonrepair(clean));
  onProgress?.('Done');
  return data;
}

/**
 * Extract structured data from a Pulau Sambu Purchase Order PDF.
 * Returns the full PO object with vendor, consignee, items, totals, etc.
 */
export async function extractPurchaseOrder(file, onProgress) {
  onProgress?.('Reading document…');
  const base64 = await fileToBase64(file);

  onProgress?.('Analysing PO with AI…');
  const res = await fetch('/api/extractPO', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mediaType: file.type || 'application/pdf' }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Extraction failed (${res.status})`);
  }

  const { text } = await res.json();
  if (!text) throw new Error('No response from AI');

  let clean = text;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    clean = fence[1].trim();
  } else {
    clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const start = clean.indexOf('{');
    if (start > 0) clean = clean.slice(start);
  }

  const data = JSON.parse(jsonrepair(clean));
  onProgress?.('Done');
  return data;
}

/**
 * Match extracted items against existing stock lines.
 * Returns a drafts object { [lineId]: quantityString }
 */
export function matchItemsToLines(extractedItems, lines) {
  const updates = {};
  if (!extractedItems?.length || !lines?.length) return updates;

  for (const item of extractedItems) {
    if (!item.quantity && item.quantity !== 0) continue;

    // 1. Try exact SKU match
    if (item.sku) {
      const match = lines.find(
        (l) => l.sku && l.sku.trim().toLowerCase() === item.sku.trim().toLowerCase()
      );
      if (match && !updates[match.id]) {
        updates[match.id] = String(item.quantity);
        continue;
      }
    }

    // 2. Fuzzy description match (substring either way)
    if (item.description) {
      const itemDesc = item.description.trim().toLowerCase();
      const match = lines.find((l) => {
        if (updates[l.id]) return false; // already matched
        const lineDesc = (l.description || '').trim().toLowerCase();
        return lineDesc.includes(itemDesc) || itemDesc.includes(lineDesc);
      });
      if (match) updates[match.id] = String(item.quantity);
    }
  }

  return updates;
}
