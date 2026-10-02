// Server-side only. Runs on Netlify's infrastructure, never shipped to the browser.
// Reads the Airtable token from an environment variable set in
// Site configuration -> Environment variables (never commit a real token to git).

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const email = ((event.queryStringParameters && event.queryStringParameters.email) || '')
    .trim()
    .toLowerCase();

  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing email' }) };
  }

  const TOKEN = process.env.AIRTABLE_TOKEN;
  const BASE_ID = process.env.AIRTABLE_BASE_ID || 'app0NzUIKpN6hEYJc';
  const TABLE_ID = process.env.AIRTABLE_VOLUNTEER_TABLE_ID || 'tblVsVMTQE4RrKAMc';

  if (!TOKEN) {
    console.error('AIRTABLE_TOKEN environment variable is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) };
  }

  // Escape double quotes so a stray " in the input can't break out of the formula string
  const safeEmail = email.replace(/"/g, '\\"');
  const formula = encodeURIComponent(`LOWER({Work Email}) = "${safeEmail}"`);
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?filterByFormula=${formula}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Airtable error', res.status, text);
      return { statusCode: 502, body: JSON.stringify({ error: 'Lookup failed' }) };
    }
    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: data.records || [] })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Lookup failed' }) };
  }
};
