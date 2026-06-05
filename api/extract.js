import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are extracting data from a packing list, delivery order, delivery note, or shipping invoice for a warehouse management system.

Extract and return ONLY valid JSON — no explanation, no markdown:
{
  "supplier": "company or sender name from the document header",
  "reference_no": "PO number, DO number, DN number, invoice number, or document reference",
  "date": "document date in YYYY-MM-DD format, or null if not found",
  "items": [
    {
      "description": "product name or item description",
      "sku": "item code, SKU, product code, or part number if shown, else null",
      "quantity": 0,
      "unit": "pcs, kg, boxes, cartons, sets, etc."
    }
  ]
}

Rules:
- Extract EVERY line item — do not skip any
- quantity must be a number (not a string)
- If a value is not found, use null
- Return ONLY the JSON object`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse body manually — Vercel Node functions don't auto-parse
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
  if (base64.length > 20_000_000) return res.status(413).json({ error: 'File too large (max ~15 MB)' });
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
        max_tokens: 4096,
        temperature: 0,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: [
            docBlock,
            { type: 'text', text: 'Extract all items from this delivery document. Return only the JSON object.' },
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
