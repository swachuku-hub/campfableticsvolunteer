  const assignmentRoles = f['Assignment Role'] || [];
  const assignmentDays = f['Assignment Day'] || [];
  const hasConfirmedAssignment = assignmentRoles.length > 0 || !!f['Confirmed Shift Time'];

  if (hasConfirmedAssignment) {
    const roleLabel = assignmentRoles.length ? assignmentRoles.join(', ') : 'Assignment pending final confirmation';
    const dayLabel = assignmentDays.length ? assignmentDays.join(', ') : '';
    html += `
      <div class="assignment-box">
        <div class="label">Confirmed Assignment</div>
        <div class="value">${escapeHtml(roleLabel)}</div>
        ${dayLabel ? `<div style="margin-top:4px; font-size:11px; font-weight:700; color:var(--spice); text-transform:uppercase; letter-spacing:0.03em;">${escapeHtml(dayLabel)}</div>` : ''}
        ${f['Confirmed Shift Time'] ? `<div class="value" style="margin-top:6px; font-size:13px; font-weight:400; color:#3a3a35;">${escapeHtml(f['Confirmed Shift Time'])}</div>` : ''}
        ${f['Assignment Details'] ? `<div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--line); font-size:13px; line-height:1.6; color:#3a3a35; white-space:pre-wrap;">${escapeHtml(f['Assignment Details'])}</div>` : ''}
      </div>`;
  } else {
    html += `<p class="empty-note" style="margin-top:14px;">No confirmed assignment yet — the Summit team will follow up before October.</p>`;
  }
  if (!hasConfirmedAssignment) {
    html += `<div class="card"><h2>Your Availability</h2>`;
    html += dayBlock('Monday, October 5 — Arrival Day', f['Oct 5 Support Opportunities'], f['Oct 5 Availability Window']);
    html += dayBlock('Tuesday, October 6 — Brand and Business Updates', f['Oct 6 Support Opportunities'], f['Oct 6 Availability Window']);
    html += dayBlock('Wednesday, October 7 — Business Acumen', f['Oct 7 Support Opportunities'], f['Oct 7 Availability Window']);
    html += dayBlock('Thursday, October 8 — Learning and Development and Awards Night', f['Oct 8 Support Opportunities'], f['Oct 8 Availability Window']);
    html += `</div>`;
  }
