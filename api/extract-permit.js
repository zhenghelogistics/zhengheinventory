import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are extracting data from a Singapore customs export permit or similar government-issued cargo permit document.

These permits may be from TradeNet, Networked Trade Platform (NTP), or equivalent. Common permit types include OEP (One-off Export Permit), AEP (Annual Export Permit), import/export declarations.

Extract and return ONLY valid JSON — no explanation, no markdown:
{
  "permit_number": "the permit reference or declaration number, e.g. EP26XXXXXX or similar",
  "permit_type": "OEP / AEP / import / export / etc. or null",
  "issue_date": "YYYY-MM-DD or null",
  "valid_until": "YYYY-MM-DD or null",
  "declaration_date": "YYYY-MM-DD or null",
  "exporter_name": "string or null",
  "exporter_uen": "UEN or tax ID or null",
  "consignee_name": "string or null",
  "consignee_country": "string or null",
  "port_of_export": "string or null",
  "port_of_discharge": "string or null",
  "vessel": "string or null",
  "voyage": "string or null",
  "bl_number": "string or null",
  "container_no": "string or null",
  "items": [
    {
      "line_no": 1,
      "description": "product description",
      "hs_code": "HS tariff code or null",
      "quantity": 0,
      "unit": "PCS / KG / etc.",
      "value": 0,
      "currency": "SGD / USD / etc."
    }
  ],
  "total_value": 0,
  "currency": "SGD",
  "incoterms": "FOB / CIF / etc. or null",
  "remarks": "any special conditions or remarks or null"
}

Rules:
- Extract ALL line items
- Permit numbers often start with letters like EP, IP, etc. followed by digits
- Dates should be normalised to YYYY-MM-DD
- quantities and values must be numbers, not strings
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
        max_tokens: 4000,
        temperature: 0,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: [
            docBlock,
            { type: 'text', text: 'Extract all data from this permit document. Return only the JSON object.' },
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
