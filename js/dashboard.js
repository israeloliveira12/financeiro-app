/* ================= Dashboard ================= */
function deltaHTML(curr, prev, goodWhenUp){
  curr = num(curr); prev = num(prev);
  if(Math.abs(prev) < 1){
    if(Math.abs(curr) < 1) return '';
    return `<div class="delta neutral">novo vs. mês anterior</div>`;
  }
  const pct = ((curr-prev)/Math.abs(prev))*100;
  const up = pct>=0;
  const good = goodWhenUp ? up : !up;
  const cls = Math.abs(pct)<1 ? 'neutral' : (good?'pos':'neg');
  const arrow = Math.abs(pct)<1 ? '·' : (up?'▲':'▼');
  return `<div class="delta ${cls}">${arrow} ${up?'+':''}${pct.toFixed(0)}% vs. mês anterior</div>`;
}

function renderTopDespesas(mm){
  const el = document.getElementById('top-despesas-panel');
  const all = [...mm.fixed, ...mm.variable].slice().sort((a,b)=>b.amount-a.amount).slice(0,5);
  if(!all.length){ el.innerHTML = `<div class="empty">Nenhuma despesa lançada este mês.</div>`; return; }
  el.innerHTML = all.map((e,i)=>`
    <div class="kv">
      <span><strong>${i+1}.</strong>&nbsp; ${e.desc}</span>
      <span style="font-family:var(--mono);font-weight:600;">${fmt.format(e.amount)}</span>
    </div>
  `).join('');
}

function renderMethodBreakdown(mm, targetId){
  const el = document.getElementById(targetId);
  const totals = {};
  [...mm.fixed, ...mm.variable].forEach(e=>{
    const label = e.method || (e.isCard ? 'Cartão de Crédito' : 'Outro');
    totals[label] = (totals[label]||0) + num(e.amount);
  });
  const data = Object.entries(totals).map(([method,total])=>({method,total})).sort((a,b)=>b.total-a.total);
  if(!data.length){ el.innerHTML = `<div class="empty">Nenhuma despesa lançada este mês.</div>`; return; }
  const totalAll = data.reduce((s,d)=>s+d.total,0);
  el.innerHTML = data.map(d=>{
    // A barra mostra a fatia daquele método sobre o total de despesas do mês
    // (soma de todas as barras = 100%) — não é relativo ao maior método.
    const pct = totalAll>0 ? (d.total/totalAll*100) : 0;
    return `<div class="debt-row">
      <div class="debt-head"><span>${d.method}</span><span class="small">${fmt.format(d.total)} · ${pct.toFixed(0)}%</span></div>
      <div class="tl-bar-wrap" style="height:8px;"><div class="tl-bar" style="width:${Math.max(pct,3)}%"></div></div>
    </div>`;
  }).join('');
}
function renderDebtProgress(){
  const el = document.getElementById('debt-progress-panel');
  const installments = state.commitments.filter(c=>c.type==='installment');
  if(!installments.length){ el.innerHTML = `<div class="empty">Nenhum parcelamento cadastrado.</div>`; return; }
  el.innerHTML = installments.map(c=>{
    const diff = monthDiff(c.start, todayKey());
    if(diff < 0){
      return `<div class="debt-row">
        <div class="debt-head"><span>${c.desc}</span><span class="small">começa em ${monthLabel(c.start)}</span></div>
        <div class="tl-bar-wrap" style="height:8px;"><div class="tl-bar" style="width:0%"></div></div>
      </div>`;
    }
    const cur = Math.min(c.startNum+diff, c.total);
    const pct = Math.min(100, (cur/c.total)*100);
    const rightText = cur>=c.total ? 'Quitado ✓' : `${cur}/${c.total} · ${pct.toFixed(0)}%`;
    return `<div class="debt-row">
      <div class="debt-head"><span>${c.desc}</span><span class="small">${rightText}</span></div>
      <div class="tl-bar-wrap" style="height:8px;"><div class="tl-bar" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function renderDashboard(){
  const key = todayKey();
  const t = monthTotals(key);
  const acc = accumulatedUpTo(key);
  const prevT = peekMonthTotals(addMonthsToKey(key,-1));
  document.getElementById('dash-cards').innerHTML = [
    {label:'Receita do mês', value: fmt.format(t.income), cls:'', delta: deltaHTML(t.income, prevT.income, true)},
    {label:'Despesas do mês', value: fmt.format(t.expenses), cls:'', delta: deltaHTML(t.expenses, prevT.expenses, false)},
    {label:'Saldo do mês', value: fmt.format(t.balance), cls: t.balance>=0?'pos':'neg', delta: deltaHTML(t.balance, prevT.balance, true)},
    {label:'Saldo acumulado', value: fmt.format(acc), cls: acc>=0?'pos':'neg', delta:''},
  ].map(c=>`<div class="card"><div class="label">${c.label}</div><div class="value ${c.cls}">${c.value}</div>${c.delta}</div>`).join('');

  renderForecastChart();
  renderSaldoTrendChart();
  renderTopDespesas(t.mm);
  renderDebtProgress();
  renderSaude(key,t);
  renderCardsSummary();
  renderTimeline(key);
  renderAno();
}

let dashboardMode = 'mes';
function setDashboardMode(mode){
  dashboardMode = mode;
  document.querySelectorAll('#dash-mode-toggle button').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
  document.getElementById('dash-mode-mes').style.display = mode==='mes' ? '' : 'none';
  document.getElementById('dash-mode-ano').style.display = mode==='ano' ? '' : 'none';
  document.getElementById('dash-timeline-wrap').style.display = mode==='mes' ? '' : 'none';
}

function forecastWindow(){
  const months = [];
  for(let i=-5;i<=6;i++) months.push(addMonthsToKey(todayKey(), i));
  const todayIdx = 5;
  const pts = months.map((key,idx)=>{
    const projected = idx>todayIdx;
    const t = peekMonthTotals(key);
    let income = t.income;
    if(projected && !state.months[key] && state.projections[key]!==undefined) income = state.projections[key];
    return { key, income, expenses:t.expenses, projected };
  });
  return { pts, todayIdx };
}

function renderForecastChart(){
  const { pts, todayIdx } = forecastWindow();
  const n = pts.length;
  const W=620,H=250,padL=40,padR=12,padT=18,padB=28;
  const maxVal = Math.max(1, ...pts.map(p=>Math.max(p.income,p.expenses))) * 1.12;
  const stepX = (W-padL-padR)/(n-1);
  const x = i => padL + stepX*i;
  const y = v => padT + (H-padT-padB) * (1 - v/maxVal);
  const pathFor = (field, from, to) => {
    let d='';
    for(let i=from;i<=to;i++) d += (i===from?'M':'L') + x(i).toFixed(1)+' '+y(pts[i][field]).toFixed(1)+' ';
    return d.trim();
  };
  const grid = [0,0.25,0.5,0.75,1].map(f=>{
    const yy = padT + (H-padT-padB)*(1-f);
    return `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W-padR}" y2="${yy.toFixed(1)}" stroke="#EEF2F0" stroke-width="1"/>`;
  }).join('');
  const todayX = x(todayIdx).toFixed(1);
  const labels = pts.map((p,i)=>`<text x="${x(i).toFixed(1)}" y="${H-7}" font-size="9.3" fill="#5B6663" text-anchor="middle">${monthShort(p.key)}</text>`).join('');
  const dots = (field,color) => pts.map((p,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(p[field]).toFixed(1)}" r="2.6" fill="${color}"/>`).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
    ${grid}
    <line x1="${todayX}" y1="${padT}" x2="${todayX}" y2="${H-padB}" stroke="#DCE2DF" stroke-width="1.4" stroke-dasharray="3 3"/>
    <text x="${todayX}" y="${padT-5}" font-size="9.5" fill="#5B6663" text-anchor="middle">hoje</text>
    <path d="${pathFor('income',0,todayIdx)}" fill="none" stroke="#0E7A5F" stroke-width="2.2"/>
    <path d="${pathFor('income',todayIdx,n-1)}" fill="none" stroke="#0E7A5F" stroke-width="2.2" stroke-dasharray="5 4"/>
    <path d="${pathFor('expenses',0,todayIdx)}" fill="none" stroke="#B8433A" stroke-width="2.2"/>
    <path d="${pathFor('expenses',todayIdx,n-1)}" fill="none" stroke="#B8433A" stroke-width="2.2" stroke-dasharray="5 4"/>
    ${dots('income','#0E7A5F')}${dots('expenses','#B8433A')}
    ${labels}
  </svg>`;
  document.getElementById('chart-forecast').innerHTML = svg;
}

function renderSaldoTrendChart(){
  const { pts, todayIdx } = forecastWindow();
  const before = addMonthsToKey(pts[0].key,-1);
  let running = accumulatedUpTo(before);
  const series = pts.map(p=>{
    running += (p.income - p.expenses);
    return { key:p.key, value:running, projected:p.projected };
  });
  const n = series.length;
  const W=620,H=250,padL=52,padR=12,padT=18,padB=28;
  const vals = series.map(p=>p.value);
  const maxVal = Math.max(...vals, 0);
  const minVal = Math.min(...vals, 0);
  const range = (maxVal-minVal) || 1;
  const stepX = (W-padL-padR)/(n-1);
  const x = i => padL + stepX*i;
  const y = v => padT + (H-padT-padB) * (1 - (v-minVal)/range);
  const pathFor = (from,to) => {
    let d='';
    for(let i=from;i<=to;i++) d += (i===from?'M':'L') + x(i).toFixed(1)+' '+y(series[i].value).toFixed(1)+' ';
    return d.trim();
  };
  const zeroY = y(0).toFixed(1);
  const zeroLine = minVal<0 ? `<line x1="${padL}" y1="${zeroY}" x2="${W-padR}" y2="${zeroY}" stroke="#B8433A" stroke-width="1" stroke-dasharray="3 3" opacity=".5"/>` : '';
  const todayX = x(todayIdx).toFixed(1);
  const labels = series.map((p,i)=>`<text x="${x(i).toFixed(1)}" y="${H-7}" font-size="9.3" fill="#5B6663" text-anchor="middle">${monthShort(p.key)}</text>`).join('');
  const areaPath = `M${x(0).toFixed(1)} ${y(0).toFixed(1)} ` + series.map((p,i)=>`L${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ') + ` L${x(n-1).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
    <path d="${areaPath}" fill="#0E7A5F" opacity="0.07"/>
    ${zeroLine}
    <line x1="${todayX}" y1="${padT}" x2="${todayX}" y2="${H-padB}" stroke="#DCE2DF" stroke-width="1.4" stroke-dasharray="3 3"/>
    <path d="${pathFor(0,todayIdx)}" fill="none" stroke="#0E7A5F" stroke-width="2.4"/>
    <path d="${pathFor(todayIdx,n-1)}" fill="none" stroke="#0E7A5F" stroke-width="2.4" stroke-dasharray="5 4"/>
    ${labels}
  </svg>`;
  document.getElementById('chart-saldo').innerHTML = svg;
}

function donutSVG(segments, size, thickness){
  const r = (size-thickness)/2;
  const cx = size/2, cy = size/2;
  const circumference = 2*Math.PI*r;
  const total = segments.reduce((s,x)=>s+x.value,0) || 1;
  let acc = 0;
  const arcs = segments.filter(s=>s.value>0).map(s=>{
    const len = (s.value/total)*circumference;
    const dasharray = `${len.toFixed(2)} ${(circumference-len).toFixed(2)}`;
    const dashoffset = (-acc).toFixed(2);
    acc += len;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thickness}" stroke-dasharray="${dasharray}" stroke-dashoffset="${dashoffset}" transform="rotate(-90 ${cx} ${cy})"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="flex-shrink:0;">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#EEF2F0" stroke-width="${thickness}"/>
    ${arcs}
  </svg>`;
}
function renderSaude(key,t){
  const fixedTotal = sumEntries(t.mm.fixed);
  const variableTotal = sumEntries(t.mm.variable);
  const ratio = t.income>0 ? fixedTotal/t.income : null;
  const savings = t.income>0 ? t.balance/t.income : null;
  let label,color;
  if(ratio===null){ label='Sem receita lançada este mês'; color='var(--ink-soft)'; }
  else if(ratio<0.5){ label='Confortável'; color='var(--brand)'; }
  else if(ratio<0.75){ label='Atenção'; color='var(--warn)'; }
  else { label='Apertado'; color='var(--bad)'; }
  const pct = ratio===null?0:Math.min(100,ratio*100);

  const sobra = t.income>0 ? Math.max(0, t.income-fixedTotal-variableTotal) : 0;
  const donutBase = t.income>0 ? t.income : (fixedTotal+variableTotal);
  const segments = [
    {label:'Fixas', value:fixedTotal, color:'var(--info)'},
    {label:'Variáveis', value:variableTotal, color:'var(--warn)'},
    {label:'Sobra', value:sobra, color:'var(--brand)'},
  ];
  const donutHtml = donutBase>0 ? `
    <div style="display:flex;align-items:center;gap:18px;margin-top:16px;">
      ${donutSVG(segments, 108, 16)}
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;">
        ${segments.filter(s=>s.value>0).map(s=>`
          <div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${s.color};vertical-align:middle;"></span>${s.label}</span>
            <span style="font-family:var(--mono);font-weight:600;white-space:nowrap;">${fmt.format(s.value)} · ${(s.value/donutBase*100).toFixed(0)}%</span>
          </div>`).join('')}
      </div>
    </div>
  ` : '';

  document.getElementById('saude-panel').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <span class="health-badge" style="background:${ratio===null?'#EEF1F0':color};color:${ratio===null?'var(--ink-soft)':'#fff'}">${label}</span>
      <span class="small">${ratio!==null ? (ratio*100).toFixed(0)+'% da renda comprometida com fixas' : ''}</span>
    </div>
    <div class="tl-bar-wrap" style="height:10px;margin-bottom:12px;"><div class="tl-bar" style="width:${pct}%;background:${ratio===null?'#ccc':color}"></div></div>
    <div class="small">${savings!==null ? `Taxa de sobra do mês: <strong style="color:${savings>=0?'var(--brand)':'var(--bad)'}">${(savings*100).toFixed(0)}%</strong> da renda${savings<0?' — mês fechando no vermelho':''}.` : 'Lance a receita do mês para calcular a taxa de sobra.'}</div>
    ${donutHtml}
  `;
}

function renderFaturasInto(mm, targetId, monthKey){
  const el = document.getElementById(targetId);
  if(!state.cards.length){ el.innerHTML = `<div class="empty">Cadastre seus cartões na aba "Cartões" para ver as faturas aqui.</div>`; return; }
  const cards = state.cards.map(c=>{
    const inv = cardInvoiceTotals(mm, c.id);
    const payBtn = inv.lancado>0 ? `<button class="btn secondary" onclick="payInvoice('${c.id}','${monthKey}')">Pagar fatura</button>` : `<span></span>`;
    let limitHtml = '';
    if(c.limit){
      const used = cardLimitUsage(c.id);
      const pct = Math.min(100, (used/c.limit)*100);
      const over = used > c.limit;
      const disponivel = c.limit - used;
      limitHtml = `<div class="fatura-limit">
        <div class="debt-head" style="margin-bottom:5px;">
          <span class="small">Limite do cartão</span>
          <span class="small"><strong>${pct.toFixed(0)}% usado</strong> · ${disponivel>=0?fmt.format(disponivel)+' livre':'estourado'}</span>
        </div>
        <div class="tl-bar-wrap" style="height:8px;"><div class="tl-bar ${over?'over':''}" style="width:${Math.max(pct,2)}%"></div></div>
      </div>`;
    }
    return `<div class="fatura-card">
      <div class="fatura-top">
        <span class="fatura-name"><span class="tag-card" style="background:${c.color||'#999'}"></span><strong>${c.name}</strong>${c.dueDay?`<span class="small">&nbsp;· vence dia ${c.dueDay}</span>`:''}</span>
        <div class="fatura-vals-row">
          <span class="fval"><span class="flabel">Lançado</span>${fmt.format(inv.lancado)}</span>
          <span class="fval"><span class="flabel">Pendente</span>${fmt.format(inv.pendente)}</span>
          <span class="fval total"><span class="flabel">Previsto</span>${fmt.format(inv.previsto)}</span>
        </div>
        ${payBtn}
      </div>
      ${limitHtml}
    </div>`;
  }).join('');
  el.innerHTML = `<div class="fatura-list">${cards}</div>`;
}
function renderCardsSummary(){
  const el = document.getElementById('cards-summary-panel');
  if(!state.cards.length){
    el.innerHTML = `<div class="empty">Cadastre seus cartões na aba "Cartões" para ver o resumo aqui.</div>`;
    return;
  }
  const withLimit = state.cards.filter(c=>c.limit);
  if(!withLimit.length){
    el.innerHTML = `<div class="empty">Cadastre o limite de crédito dos seus cartões (aba "Cartões") para ver aqui quanto ainda está disponível no total.</div>`;
    return;
  }
  const totalLimit = withLimit.reduce((s,c)=>s+num(c.limit),0);
  const totalUsed = withLimit.reduce((s,c)=>s+cardLimitUsage(c.id),0);
  const pct = Math.min(100, (totalUsed/totalLimit)*100);
  const over = totalUsed > totalLimit;
  const disponivel = totalLimit - totalUsed;
  const semLimite = state.cards.length - withLimit.length;
  const perCardHtml = withLimit.map(c=>{
    const usedC = cardLimitUsage(c.id);
    const pctC = Math.min(100, (usedC/c.limit)*100);
    const overC = usedC > c.limit;
    return `<div class="debt-row">
      <div class="debt-head"><span><span class="tag-card" style="background:${c.color||'#999'}"></span>${c.name}</span><span class="small">${pctC.toFixed(0)}% usado</span></div>
      <div class="tl-bar-wrap" style="height:8px;"><div class="tl-bar ${overC?'over':''}" style="width:${Math.max(pctC,2)}%"></div></div>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="debt-head" style="margin-bottom:6px;">
      <span class="small">${withLimit.length} ${withLimit.length>1?'cartões':'cartão'} com limite cadastrado</span>
      <span class="small"><strong>${pct.toFixed(0)}% usado</strong> · ${disponivel>=0?fmt.format(disponivel)+' livre':'estourado'}</span>
    </div>
    <div class="tl-bar-wrap" style="height:10px;margin-bottom:10px;"><div class="tl-bar ${over?'over':''}" style="width:${Math.max(pct,2)}%"></div></div>
    <div class="small" style="margin-bottom:16px;">${fmt.format(totalUsed)} usado de ${fmt.format(totalLimit)} de limite total.${semLimite>0?` (${semLimite} ${semLimite>1?'cartões':'cartão'} sem limite cadastrado ${semLimite>1?'não entram':'não entra'} nessa conta.)`:''}</div>
    ${perCardHtml}
  `;
}
function payInvoice(cardId, monthKey){
  const mm = ensureMonth(monthKey);
  const entries = [...mm.fixed, ...mm.variable].filter(e=>(e.method==='Cartão de Crédito'||e.isCard) && e.cardId===cardId && e.status==='Lançado');
  if(!entries.length) return;
  const card = state.cards.find(c=>c.id===cardId);
  const snapshot = entries.map(e=>({ e, status:e.status, paidAmount:e.paidAmount }));
  entries.forEach(e=>{ e.status='Pago'; e.paidAmount = e.amount; });
  save();
  renderDashboard();
  renderMes();
  const plural = entries.length>1 ? 'lançamentos' : 'lançamento';
  showUndoToast(`${entries.length} ${plural} de "${card?card.name:'cartão'}" marcado(s) como pago em ${monthLabel(monthKey)}.`, () => {
    snapshot.forEach(s=>{ s.e.status = s.status; s.e.paidAmount = s.paidAmount; });
    save();
    renderDashboard();
    renderMes();
  });
}

function renderTimeline(key){
  let tl = '';
  const previews = Array.from({length:6},(_,i)=>{
    const k = addMonthsToKey(key,i);
    return { k, committed: peekCommittedForMonth(k,'fixed') };
  });
  const maxCommitted = Math.max(1, ...previews.map(p=>p.committed));
  previews.forEach(p=>{
    const k = p.k;
    const committed = p.committed;
    let expected;
    if(state.projections[k] !== undefined) expected = state.projections[k];
    else if(state.months[k]) expected = sumEntries(state.months[k].income);
    else expected = peekCommittedForMonth(k,'income');
    const expectedNum = num(expected);
    const base = expectedNum>0 ? expectedNum : maxCommitted;
    const pct = Math.min(100, (committed/(base||1))*100);
    const over = expectedNum>0 && committed>expectedNum;
    const livre = expectedNum - committed;
    tl += `<div class="tl-row">
      <div class="tl-month">${monthShort(k)}</div>
      <div class="tl-bar-wrap"><div class="tl-bar ${over?'over':''}" style="width:${Math.max(pct,3)}%"></div></div>
      <div class="tl-nums">
        <span title="Comprometido (fixo)">${fmt.format(committed)}</span>
        <span class="rs-wrap"><span class="rs-prefix">R$</span><input type="number" step="0.01" value="${expected||''}" placeholder="renda esp." onchange="setProjection('${k}',this.value)"></span>
        <span title="Livre estimado" style="color:${livre<0?'var(--bad)':'var(--brand)'};font-weight:600;">${expectedNum?fmt.format(livre):'—'}</span>
      </div>
    </div>`;
  });
  document.getElementById('dash-timeline').innerHTML = tl;
}
function setProjection(key,val){ state.projections[key] = num(val); save(); renderDashboard(); }

function renderAno(){
  document.getElementById('ano-label').textContent = currentYear;
  const data = [];
  for(let m=1;m<=12;m++){
    const key = `${currentYear}-${String(m).padStart(2,'0')}`;
    data.push({key, ...peekMonthTotals(key)});
  }
  const totalIncome = data.reduce((s,d)=>s+d.income,0);
  const totalExpense = data.reduce((s,d)=>s+d.expenses,0);
  document.getElementById('ano-total-income').textContent = fmt.format(totalIncome);
  document.getElementById('ano-total-expense').textContent = fmt.format(totalExpense);
  document.getElementById('ano-total-saldo').textContent = fmt.format(totalIncome-totalExpense);

  const accEndOfYear = accumulatedUpTo(`${currentYear}-12`);
  document.getElementById('dash-cards-ano').innerHTML = [
    {label:'Receita do ano', value: fmt.format(totalIncome), cls:''},
    {label:'Despesas do ano', value: fmt.format(totalExpense), cls:''},
    {label:'Saldo do ano', value: fmt.format(totalIncome-totalExpense), cls: (totalIncome-totalExpense)>=0?'pos':'neg'},
    {label:'Acumulado até dez/'+String(currentYear).slice(2), value: fmt.format(accEndOfYear), cls: accEndOfYear>=0?'pos':'neg'},
  ].map(c=>`<div class="card"><div class="label">${c.label}</div><div class="value ${c.cls}">${c.value}</div></div>`).join('');

  renderAnoChart(data);
}
document.getElementById('ano-prev').onclick = ()=>{ currentYear--; renderAno(); };
document.getElementById('ano-next').onclick = ()=>{ currentYear++; renderAno(); };

function renderAnoChart(data){
  const n = data.length;
  const W=900,H=260,padL=36,padR=12,padT=18,padB=28;
  const maxVal = Math.max(1, ...data.map(d=>Math.max(d.income,d.expenses))) * 1.15;
  const groupW = (W-padL-padR)/n;
  const barW = groupW*0.32;
  const y = v => padT + (H-padT-padB) * (1 - v/maxVal);
  const baseY = H-padB;
  const bars = data.map((d,i)=>{
    const gx = padL + groupW*i;
    const incX = gx + groupW*0.5 - barW - 1.5;
    const expX = gx + groupW*0.5 + 1.5;
    const incY = y(d.income), expY = y(d.expenses);
    return `
      <rect x="${incX.toFixed(1)}" y="${incY.toFixed(1)}" width="${barW.toFixed(1)}" height="${(baseY-incY).toFixed(1)}" rx="2" fill="#0E7A5F"/>
      <rect x="${expX.toFixed(1)}" y="${expY.toFixed(1)}" width="${barW.toFixed(1)}" height="${(baseY-expY).toFixed(1)}" rx="2" fill="#B8433A"/>
      <text x="${(gx+groupW/2).toFixed(1)}" y="${H-7}" font-size="9.5" fill="#5B6663" text-anchor="middle">${MONTH_NAMES[keyParts(d.key).m-1].slice(0,3)}</text>
    `;
  }).join('');
  const svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;">
    <line x1="${padL}" y1="${baseY}" x2="${W-padR}" y2="${baseY}" stroke="#EEF2F0" stroke-width="1"/>
    ${bars}
  </svg>`;
  document.getElementById('chart-ano').innerHTML = svg;
}
