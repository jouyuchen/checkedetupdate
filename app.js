const CONFIG = {
  searchUrl: 'https://alleypin.app.n8n.cloud/webhook/contract-search',
  syncUrl:   'https://alleypin.app.n8n.cloud/webhook/contract-sync'
};

let state = {};

function showScreen(id) {
  ['screen-search', 'screen-update', 'screen-success'].forEach(s =>
    document.getElementById(s).classList.add('hidden')
  );
  document.getElementById(id).classList.remove('hidden');
}

function setError(id, msg) {
  const el = document.getElementById(id);
  if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
  else { el.classList.add('hidden'); }
}

async function doSearch() {
  const password   = document.getElementById('inp-password').value.trim();
  const contractId = document.getElementById('inp-contractId').value.trim();

  setError('search-error', '');
  if (!password || !contractId) {
    setError('search-error', '請輸入密碼和續約編號');
    return;
  }

  const btn = document.getElementById('btn-search');
  btn.disabled = true;
  document.getElementById('search-loading').classList.remove('hidden');
  document.getElementById('result-section').classList.add('hidden');

  try {
    const res = await fetch(CONFIG.searchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, contractId })
    });

    if (res.status === 401) { setError('search-error', '密碼錯誤'); return; }
    if (!res.ok) { setError('search-error', `伺服器錯誤 (${res.status})`); return; }

    const data = await res.json();
    if (!data.ragic || !data.ragic.contractId) {
      setError('search-error', '找不到此續約編號，請確認後重試');
      return;
    }

    state = data;
    renderResult(data);
    renderEsign(data.esign || null);

  } catch (e) {
    setError('search-error', '連線失敗，請確認 Webhook URL');
  } finally {
    btn.disabled = false;
    document.getElementById('search-loading').classList.add('hidden');
  }
}

function classifyStatus(str) {
  if (!str) return { cls: 'yellow', label: '未知' };
  const s = str.toLowerCase();
  if (s.includes('作廢') || s.includes('void')) return { cls: 'red', label: '已作廢' };
  if (s.includes('completed') && !s.includes('pending') && !s.includes('sent'))
    return { cls: 'green', label: '全部完成' };
  if (s.includes('completed') || s.includes('sent') || s.includes('delivered'))
    return { cls: 'yellow', label: '進行中' };
  return { cls: 'yellow', label: '進行中' };
}

function renderEsign(esign) {
  const el      = document.getElementById('esign-content');
  const section = document.getElementById('esign-section');

  if (!esign || !esign.statusForAll) {
    el.innerHTML = '<div class="esign-none">— 尚未電子寄送</div>';
    section.classList.remove('hidden');
    return;
  }

  const { cls, label } = classifyStatus(esign.statusForAll);

  const pendingDays = parseFloat(esign.pendingTime);
  const hasPending  = !isNaN(pendingDays) && esign.pendingTime !== '';
  const isWarning   = hasPending && pendingDays > 3;

  const pendingHtml = hasPending ? `
    <div class="esign-row" style="margin-top:8px;">
      <span class="esign-label">Pending</span>
      <span class="badge ${isWarning ? 'red warn' : 'green'}">
        ${isWarning ? '⚠ ' : ''}${pendingDays} 天
      </span>
    </div>` : '';

  el.innerHTML = `
    <div class="esign-row">
      <span class="esign-label">Status</span>
      <span class="badge ${cls}">${label}</span>
    </div>
    <div style="font-size:0.78rem;color:var(--color-text-secondary);margin-top:7px;line-height:1.7;word-break:break-word;">
      ${esign.statusForAll}
    </div>
    ${pendingHtml}`;
  section.classList.remove('hidden');
}

function renderResult({ ragic, pd, diff }) {
  const colorLabel = {
    red:    '超過 6 個月',
    yellow: '3–6 個月',
    green:  '3 個月以內'
  };

  document.getElementById('info-grid').innerHTML = `
    <div class="info-card">
      <div class="label">診所名稱</div>
      <div class="value">${ragic.clinicName || '—'}</div>
    </div>
    <div class="info-card">
      <div class="label">負責人</div>
      <div class="value">${pd.dealOwner || '—'}</div>
    </div>
    <div class="info-card">
      <div class="label">Deal</div>
      <div class="value">${pd.dealTitle || '—'}</div>
    </div>
    <div class="info-card">
      <div class="label">簽約→開始 間距</div>
      <div class="value">
        <span class="badge ${ragic.signStartColor}">${colorLabel[ragic.signStartColor]}</span>
      </div>
    </div>
  `;

  const rows = [
    { label: '簽約日期', ragicVal: ragic.signDate,  pdVal: '—',         isDiff: false },
    { label: '開始日',   ragicVal: ragic.startDate, pdVal: pd.startDate, isDiff: diff.startDate },
    { label: '結束日',   ragicVal: ragic.endDate,   pdVal: pd.endDate,   isDiff: diff.endDate }
  ];

  document.getElementById('date-tbody').innerHTML = rows.map(r => `
    <tr>
      <td class="field-name">${r.label}</td>
      <td class="ragic-val">${r.ragicVal || '—'}</td>
      <td class="pd-val ${r.isDiff ? 'diff' : 'match'}">${r.pdVal || '—'}</td>
      <td class="status-cell">
        ${r.isDiff
          ? `<span class="badge red">不一致</span>`
          : (r.pdVal && r.pdVal !== '—' ? `<span style="color:var(--color-success);font-size:0.8rem;font-weight:600;">✓</span>` : '')}
      </td>
    </tr>
  `).join('');

  document.getElementById('result-section').classList.remove('hidden');
}

function goToUpdate() {
  const { ragic } = state;
  document.getElementById('edit-signDate').value  = toInputDate(ragic.signDate);
  document.getElementById('edit-startDate').value = toInputDate(ragic.startDate);
  document.getElementById('edit-endDate').value   = toInputDate(ragic.endDate);
  showScreen('screen-update');
}

function goBack() { showScreen('screen-search'); }

async function doSync() {
  setError('sync-error', '');
  const password  = document.getElementById('inp-password').value.trim();
  const signDate  = document.getElementById('edit-signDate').value;
  const startDate = document.getElementById('edit-startDate').value;
  const endDate   = document.getElementById('edit-endDate').value;

  if (!signDate || !startDate || !endDate) {
    setError('sync-error', '請確認三個日期欄位都已填入');
    return;
  }

  const { pd, ragic } = state;
  const changed = [];
  if (signDate  !== toInputDate(ragic.signDate))  changed.push('signDate');
  if (startDate !== toInputDate(pd.startDate))    changed.push('startDate');
  if (endDate   !== toInputDate(pd.endDate))      changed.push('endDate');
  const updateinfo = changed.length > 0 ? changed.join(', ') : 'signDate, startDate, endDate';

  const btn = document.getElementById('btn-sync');
  btn.disabled = true;
  document.getElementById('sync-loading').classList.remove('hidden');

  try {
    const res = await fetch(CONFIG.syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password,
        pdTxnId:    pd.pdTxnId,
        dealTitle:  pd.dealTitle,
        dealOwner:  pd.dealOwner,
        contractId: ragic.contractId,
        signDate, startDate, endDate,
        updateinfo
      })
    });

    if (res.status === 401) { setError('sync-error', '密碼錯誤'); return; }
    if (!res.ok) { setError('sync-error', `同步失敗 (${res.status})`); return; }

    showScreen('screen-success');
  } catch (e) {
    setError('sync-error', '連線失敗，請重試');
  } finally {
    btn.disabled = false;
    document.getElementById('sync-loading').classList.add('hidden');
  }
}

function reset() {
  state = {};
  document.getElementById('inp-contractId').value = '';
  document.getElementById('result-section').classList.add('hidden');
  document.getElementById('esign-section').classList.add('hidden');
  showScreen('screen-search');
}

function toInputDate(str) {
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (isNaN(d)) return '';
  return d.toISOString().split('T')[0];
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (!document.getElementById('screen-search').classList.contains('hidden')) doSearch();
  else if (!document.getElementById('screen-update').classList.contains('hidden')) doSync();
});

// 註冊 Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}
