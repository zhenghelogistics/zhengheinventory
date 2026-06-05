import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are extracting data from a Purchase Order issued by Pulau Sambu Singapore Pte Ltd.

The PO format has:
- Header: Purchase Order number (format PSVxx-xx-xxxx), PO date, delivery date, From country, To country
- Vendor block (the "To:" section): supplier name, address, telephone, contact name
- Ship/Deliver To block: consignee name, address, telephone, contact name
- Line items table with columns: No, Item Number, Item Description, Quantity, UOM, Unit Cost, Extended Cost
  - Each item also has: NPBB reference number (format like 03260/CWC/032026), HS CODE, Product Of Origin
- Totals section: Sub Total, Discount, Freight, GST, Grand Total (with currency)
- Terms: Shipping Term, Payment Term
- Shipping notes (may be on a later page): BL consignee details, Notify Party details

Extract and return ONLY valid JSON — no explanation, no markdown:
{
  "po_number": "string",
  "po_date": "YYYY-MM-DD",
  "delivery_date": "YYYY-MM-DD or null",
  "from_country": "string",
  "to_country": "string",
  "vendor": {
    "name": "string",
    "address": "string or null",
    "contact": "string or null",
    "tel": "string or null"
  },
  "consignee": {
    "name": "string",
    "address": "string or null",
    "contact": "string or null",
    "tel": "string or null"
  },
  "shipping_term": "string or null",
  "payment_term": "string or null",
  "currency": "USD or SGD or string",
  "sub_total": number or null,
  "freight": number or null,
  "grand_total": number or null,
  "items": [
    {
      "line_no": number,
      "item_number": "string (the PG-DJT-PMP-xxxxx code)",
      "description": "string (the product description text, not including NPBB/HS/origin lines)",
      "npbb": "string or null (the NPBB:xxxxx reference)",
      "hs_code": "string or null",
      "origin": "string or null",
      "quantity": number,
      "uom": "string",
      "unit_cost": number,
      "extended_cost": number
    }
  ],
  "bl_consignee": "string or null (from the shipping notes section)",
  "notify_party": "string or null (from the shipping notes section)"
}

Rules:
- Extract ALL line items — scan every page
- item_number is the code like PG-DJT-PMP-00022, not the row number
- description should be the product text only (stop before NPBB / HS CODE lines)
- NPBB is the reference starting with numbers like 03260/CWC/032026 (include the hospital code in brackets if present)
- numbers (quantities, costs, totals) must be numbers not strings
- Return ONLY the JSON object`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { base64, mediaType } = body;
  if (!base64) return res.status(400).json({ error: 'Missing base64' });
  if (base64.length > 20_000_000) return res.status(413).json({ error: 'File too large' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const isImage = (mediaType || '').startsWith('image/');
  const docBlock = isImage
    ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }
    : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let fullText = '';
      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        temperature: 0,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: [
            docBlock,
            { type: 'text', text: 'Extract all data from this Purchase Order. Scan every page for all line items. Return only the JSON object.' },
          ],
        }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          fullText += event.delta.text;
        }
      }

      if (!fullText) throw new Error('No response from Claude');
      return res.status(200).json({ text: fullText });
    } catch (err) {
      if (attempt === maxRetries) return res.status(500).json({ error: err.message || 'Extraction failed' });
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
    }
  }
}
