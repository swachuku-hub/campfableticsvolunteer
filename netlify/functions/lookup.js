// Server-side only. Runs on Netlify's infrastructure, never shipped to the browser.
// Reads the Airtable token from an environment variable set in
// Site configuration -> Environment variables (never commit a real token to git).
//
// As of Oct 2026, Summit Volunteer Assignments is the source of truth for what
// a volunteer is actually doing (day, role, shift time, details, resources).
// HQ Volunteers still owns identity, Response Status, and the raw availability
// form answers. This function looks up the HQ Volunteers record by email, then
// follows its "Summit Volunteer Assignments" link to pull the real assignment,
// and merges the two into one payload for the front end.

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

  // Escape double quotes so a stray " in the input can't break out of the formula string
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

    // Join in EVERY linked Summit Volunteer Assignments record — a volunteer
    // can be assigned to more than one, and dropping anything past the first
    // would silently hide real assignments from them.
    for (const record of records) {
      const linkedIds = record.fields['Summit Volunteer Assignments'] || [];

      let allDays = [];
      let allRoles = [];
      let allStatuses = [];
      let allShiftTimes = [];
      let allDetails = [];
      let firstResource = '';
      let secondResource = '';
      let allAttachments3 = [];
      let allAttachments4 = [];

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

          if (af['Assignment Day']) allDays.push(...af['Assignment Day']);
          if (af['Assignment Role']) allRoles.push(...af['Assignment Role']);
          if (af['Assignment Status']) allStatuses.push(af['Assignment Status']);
          if (af['Confirmed Shift Time']) allShiftTimes.push(af['Confirmed Shift Time']);
          if (af['Assignment Details']) allDetails.push(af['Assignment Details']);
          if (af['Resources'] && !firstResource) firstResource = af['Resources'];
          else if (af['Resources'] && !secondResource) secondResource = af['Resources'];
          if (af['Resources 2'] && !firstResource) firstResource = af['Resources 2'];
          else if (af['Resources 2'] && !secondResource) secondResource = af['Resources 2'];
          if (Array.isArray(af['Resources 3'])) allAttachments3.push(...af['Resources 3']);
          if (Array.isArray(af['Resources 4'])) allAttachments4.push(...af['Resources 4']);
        } catch (err) {
          console.error('Assignment fetch error', err);
        }
      }

      // Summit Volunteer Assignments is now the single source of truth for these
      // fields. Always overwrite them here (even to blank) so a missing or
      // not-yet-filled-in assignment record never lets stale HQ Volunteers data
      // leak through onto the status page.
      record.fields['Assignment Day'] = allDays;
      record.fields['Assignment Role'] = allRoles;
      record.fields['Assignment Status'] = allStatuses.join(', ');
      record.fields['Confirmed Shift Time'] = allShiftTimes.join('  •  ');
      record.fields['Assignment Details'] = allDetails.join('\n\n');
      record.fields['Resources'] = firstResource;
      record.fields['Resources 2'] = secondResource;
      record.fields['Resources 3'] = allAttachments3;
      record.fields['Resources 4'] = allAttachments4;
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
