// Server-side only. Runs on Netlify's infrastructure, never shipped to the browser.
// Reads the Airtable token from an environment variable set in
// Site configuration -> Environment variables (never commit a real token to git).
//
// Summit Volunteer Assignments is the source of truth for what a volunteer is
// actually doing. As of Oct 2026 this is one row PER TASK, not one row per
// person — a volunteer can have many linked assignment records (e.g. 8+ for
// someone staffing several days). This function looks up the HQ Volunteers
// record by email, follows every linked assignment record, and returns them
// as a sorted list of tasks for the front end to render individually.

function formatClockTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

// Each weekday has its own Start/End datetime field pair on the Assignments
// table. Show every one that's actually filled in — not just the first
// match — since completeness matters more than brevity here.
const DAY_TIME_FIELDS = [
  ['Sunday', 'Sunday Shift Time', 'Sunday Shift End'],
  ['Monday, October 5', 'Monday Shift Time', 'Monday Shift End'],
  ['Tuesday, October 6', 'Tuesday Shift Time', 'Tuesday Shift End'],
  ['Wednesday, October 7', 'Wednesday Shift Time', 'Wednesday Shift End'],
  ['Thursday, October 8', 'Thursday Shift Time', 'Thursday Shift End'],
  ['Friday', 'Friday Shift Time', 'Friday Shift End']
];
const DAY_ORDER = DAY_TIME_FIELDS.map(d => d[0]);

function buildShiftTimes(af) {
  const entries = [];
  for (const [dayLabel, startKey, endKey] of DAY_TIME_FIELDS) {
    const start = formatClockTime(af[startKey]);
    const end = formatClockTime(af[endKey]);
    if (start || end) {
      entries.push({ day: dayLabel, range: [start, end].filter(Boolean).join(' – ') });
    }
  }
  return entries;
}

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
  const VOLUNTEER_TABLE_ID = process.env.AIRTABLE_VOLUNTEER_TABLE_ID || 'tblVsVMTQE4RrKAMc';
  const ASSIGNMENTS_TABLE_ID = process.env.AIRTABLE_ASSIGNMENTS_TABLE_ID || 'tbl1Bi6unaNaJEpjy';

  if (!TOKEN) {
    console.error('AIRTABLE_TOKEN environment variable is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured' }) };
  }

  const safeEmail = email.replace(/"/g, '\\"');
  const formula = encodeURIComponent(`LOWER({Work Email}) = "${safeEmail}"`);
  const volunteerUrl = `https://api.airtable.com/v0/${BASE_ID}/${VOLUNTEER_TABLE_ID}?filterByFormula=${formula}`;

  try {
    const res = await fetch(volunteerUrl, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('Airtable error', res.status, text);
      return { statusCode: 502, body: JSON.stringify({ error: 'Lookup failed' }) };
    }
    const data = await res.json();
    const records = data.records || [];

    for (const record of records) {
      const linkedIds = record.fields['Summit Volunteer Assignments'] || [];
      const tasks = [];
      let allLinks = [];
      let allAttachments = [];

      for (const assignmentId of linkedIds) {
        try {
          const aRes = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/${ASSIGNMENTS_TABLE_ID}/${assignmentId}`,
            { headers: { Authorization: `Bearer ${TOKEN}` } }
          );
          if (!aRes.ok) {
            console.error('Assignment fetch failed', aRes.status, await aRes.text());
            continue;
          }
          const aData = await aRes.json();
          const af = aData.fields || {};
          const days = af['Assignment Day'] || [];
          const dayIndexes = days.map(d => DAY_ORDER.indexOf(d)).filter(i => i >= 0);

          tasks.push({
            days,
            role: (af['Assignment Role'] || []).join(', ') || 'Assignment pending final confirmation',
            status: af['Assignment Status'] || '',
            shiftLead: !!af['Shift Lead'],
            shiftTimes: buildShiftTimes(af),
            details: af['Assignment Details'] || '',
            sortKey: dayIndexes.length ? Math.min(...dayIndexes) : 99
          });

          if (af['Resources']) allLinks.push(af['Resources']);
          if (af['Resources 2']) allLinks.push(af['Resources 2']);
          if (Array.isArray(af['Resources 3'])) allAttachments.push(...af['Resources 3']);
          if (Array.isArray(af['Resources 4'])) allAttachments.push(...af['Resources 4']);
        } catch (err) {
          console.error('Assignment fetch error', err);
        }
      }

      tasks.sort((a, b) => a.sortKey - b.sortKey);

      const dedupedLinks = [...new Set(allLinks)];
      const seenAttachmentIds = new Set();
      const dedupedAttachments = allAttachments.filter(att => {
        if (!att || !att.id) return true;
        if (seenAttachmentIds.has(att.id)) return false;
        seenAttachmentIds.add(att.id);
        return true;
      });

      record.fields['Tasks'] = tasks;
      record.fields['Resources'] = dedupedLinks;
      record.fields['Resources 2'] = [];
      record.fields['Resources 3'] = dedupedAttachments;
      record.fields['Resources 4'] = [];
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 502, body: JSON.stringify({ error: 'Lookup failed' }) };
  }
};
