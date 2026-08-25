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
      <span><strong>${i+1}.</strong>&nbsp; ${esc(e.desc)}</span>
      <span style="font-family:var(--mono);font-weight:600;">${esc(fmt.format(e.amount))}</span>
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
      <div class="debt-head"><span>${esc(d.method)}</span><span class="small">${esc(fmt.format(d.total))} · ${esc(pct.toFixed(0))}%</span></div>
      <div class="tl-bar-wrap" style="height:8px;"><div class="tl-bar" style="width:${esc(Math.max(pct,3))}%"></div></div>
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
        <div class="debt-head"><span>${esc(c.desc)}</span><span class="small">começa em ${esc(monthLabel(c.start))}</span></div>
        <div class="tl-bar-wrap" style="height:8px;"><div class="tl-bar" style="width:0%"></div></div>
      </div>`;
    }
    const cur = Math.min(c.startNum+diff, c.total);
    const pct = Math.min(100, (cur/c.total)*100);
    const rightText = cur>=c.total ? 'Quitado ✓' : `${cur}/${c.total} · ${pct.toFixed(0)}%`;
    return `<div class="debt-row">
      <div class="debt-head"><span>${esc(c.desc)}</span><span class="small">${esc(rightText)}</span></div>
      <div class="tl-bar-wrap" style="height:8px;"><div class="tl-bar" style="width:${esc(pct)}%"></div></div>
    </div>`;
  }).join('');
}

/* ---------- Card-herói: o saldo disponível e sua composição ---------- */
function renderHero(key, t){
  const acc = accumulatedUpTo(key);              // saldo disponível (inclui o orçado)
  const anterior = accumulatedUpTo(addMonthsToKey(key,-1));
  const realizado = realizedUpTo(key);           // o que de fato está na conta
  const aPagar = sumPayable(t.mm);
  const aReceber = sumReceivable(t.mm);
  document.getElementById('hero-card').innerHTML = `
    <div>
      <p class="hero-lbl">Saldo disponível</p>
      <p class="hero-big ${acc<0?'is-neg':''}">${esc(fmt.format(acc))}</p>
      <p class="hero-sub">Acumulado anterior <b>${esc(fmt.format(anterior))}</b> · receita do mês <b>${esc(fmt.format(t.income))}</b> · despesas <b>${esc(fmt.format(t.expenses))}</b></p>
    </div>
    <div class="hero-split">
      <div>
        <div class="k">Já na conta</div>
        <div class="v" title="Só o que foi recebido menos o que foi pago">${esc(fmt.format(realizado))}</div>
      </div>
      <div>
        <div class="k">Ainda a pagar</div>
        <div class="v warn">${esc(fmt.format(aPagar))}</div>
      </div>
      <div>
        <div class="k">Ainda a receber</div>
        <div class="v">${esc(fmt.format(aReceber))}</div>
      </div>
    </div>`;
}

/* ---------- Agenda: o que vence nos próximos dias ----------
   Usa duas fontes de data real: o dia de vencimento do cartão (fatura) e o
   dia de vencimento cadastrado no compromisso. Lançamentos sem data ficam de
   fora da janela e aparecem como resumo no rodapé do painel. */
function agendaItems(key, mm){
  const itens = [];
  state.cards.forEach(c=>{
    if(!c.dueDay) return;
    const aberto = faturaEmAberto(mm, c.id);
    if(aberto <= 0) return;
    const data = dueDateOf(key, c.dueDay);
    itens.push({ tipo:'fatura', titulo:`Fatura ${c.name}`, detalhe:'cartão de crédito', valor:aberto, data, cor:c.color||'#999', cardId:c.id });
  });
  ['fixed','variable','income'].forEach(cat=>{
    mm[cat].forEach(e=>{
      const quitado = cat==='income' ? e.status==='Recebido' : e.status==='Pago';
      if(quitado) return;
      if((e.method==='Cartão de Crédito'||e.isCard) && e.cardId) return; // já contado na fatura
      const c = e.commitmentId ? state.commitments.find(x=>x.id===e.commitmentId) : null;
      if(!c || !c.dueDay) return;
      itens.push({
        tipo: cat==='income'?'receita':'despesa', titulo:e.desc,
        detalhe: cat==='income' ? 'a receber' : (e.method||'a pagar'),
        valor: remaining(e), data: dueDateOf(key, c.dueDay), cor: cat==='income' ? '#0E7A5F' : '#3A5BC7'
      });
    });
  });
  return itens
    .map(i=>({...i, dias: daysUntil(i.data)}))
    // Só o que ainda está por vir. Nada de "atrasado há X dias": o status de
    // pagamento é controlado manualmente pelo usuário, então uma fatura que já
    // venceu e continua como "Lançado" não significa que ficou em atraso —
    // significa só que ele ainda não passou o status pra "Pago".
    .filter(i=>i.dias !== null && i.dias >= 0 && i.dias <= 7)
    .sort((a,b)=>a.dias-b.dias);
}
function renderAgenda(key, mm){
  const el = document.getElementById('agenda-panel');
  const itens = agendaItems(key, mm);
  const semData = [...mm.fixed, ...mm.variable].filter(e=>e.status!=='Pago').length;
  if(!itens.length){
    el.innerHTML = `<div class="empty">Nada vencendo nos próximos 7 dias.${
      semData ? ` <br><span class="small">Você tem ${esc(semData)} despesa(s) em aberto sem dia de vencimento — cadastre o dia no compromisso para elas aparecerem aqui.</span>` : ''
    }</div>`;
    return;
  }
  const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  el.innerHTML = `<div class="agenda">${itens.map(i=>{
    const urgente = i.dias <= 3;
    const acao = i.tipo==='fatura'
      ? `<button class="btn secondary btn-sm" onclick="payInvoice('${esc(i.cardId)}','${esc(key)}')">Pagar</button>` : '';
    return `<div class="ag-row">
      <div class="ag-when ${urgente?'is-urgent':''}">
        <div class="d">${esc(String(i.data.getDate()).padStart(2,'0'))}</div>
        <div class="m">${esc(MESES[i.data.getMonth()])}</div>
      </div>
      <div class="ag-main">
        <div class="t"><span class="tag-card" style="background:${escapeAttr(i.cor)}"></span>${esc(i.titulo)}</div>
        <div class="s">${esc(relativeDueLabel(i.dias))} · ${esc(i.detalhe)}</div>
      </div>
      <div class="ag-val">${esc(fmt.format(i.valor))}</div>
      ${acao}
    </div>`;
  }).join('')}</div>`;
}

function renderDashboard(){
  const key = todayKey();
  const t = monthTotals(key);
  const acc = accumulatedUpTo(key);
  const prevT = peekMonthTotals(addMonthsToKey(key,-1));
  const disponivel = disponivelDoMes(key, t.income);
  const sobraPct = disponivel>0 ? ((disponivel - t.expenses)/disponivel*100) : null;

  renderHero(key, t);
  renderAgenda(key, t.mm);

  document.getElementById('dash-cards').innerHTML = [
    {label:'Receita do mês', value: fmt.format(t.income), cls:'', delta: deltaHTML(t.income, prevT.income, true)},
    {label:'Despesas do mês', value: fmt.format(t.expenses), cls:'', delta: deltaHTML(t.expenses, prevT.expenses, false)},
    {label:'Saldo do mês', value: fmt.format(t.balance), cls: t.balance>=0?'pos':'neg', delta: deltaHTML(t.balance, prevT.balance, true)},
    {label:'Taxa de sobra', value: sobraPct===null ? '—' : sobraPct.toFixed(0)+'%', cls: (sobraPct||0)>=0?'pos':'neg',
     delta: `<div class="delta neutral">sobre o disponível do mês</div>`},
  ].map(c=>`<div class="card"><div class="label">${esc(c.label)}</div><div class="value ${esc(c.cls)}">${esc(c.value)}</div>${c.delta}</div>`).join('');

  renderForecastChart();
  renderSaldoTrendChart();
  renderTopDespesas(t.mm);
  renderDebtProgress();
  renderSaude(key,t);
  renderCardsSummary();
  renderAno();
}

let dashboardMode = 'mes';
function setDashboardMode(mode){
  dashboardMode = mode;
  document.querySelectorAll('#dash-mode-toggle button').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
  document.getElementById('dash-mode-mes').style.display = mode==='mes' ? '' : 'none';
  document.getElementById('dash-mode-ano').style.display = mode==='ano' ? '' : 'none';
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

// Estiliza o eixo X pra destacar o mês de "hoje" (cor + negrito), já que o marcador
// vertical tracejado do SVG antigo não existe mais sem o plugin de anotação.
function todayTickOptions(todayIdx){
  return {
    color: (ctx)=> ctx.index===todayIdx ? '#0E7A5F' : '#5B6663',
    font: (ctx)=> ({ size: 9.3, weight: ctx.index===todayIdx ? '700' : '400' }),
  };
}
function dashAfterToday(todayIdx){
  return (ctx)=> ctx.p0DataIndex >= todayIdx ? [5,4] : undefined;
}
let forecastChart = null;
function renderForecastChart(){
  const { pts, todayIdx } = forecastWindow();
  const labels = pts.map(p=>monthShort(p.key));
  const seriesFor = (field,color,align) => ({
    label: field==='income' ? 'Receita' : 'Despesas',
    data: pts.map(p=>p[field]),
    borderColor: color, backgroundColor: color, pointBackgroundColor: color,
    borderWidth: 2.2, pointRadius: 3, tension: 0,
    segment: { borderDash: dashAfterToday(todayIdx) },
    datalabels: {
      display: (ctx)=> ctx.dataset.data[ctx.dataIndex] > 0,
      color, anchor:'end', align, offset:4, font:{size:9,weight:'600'},
      formatter: (v)=> fmtCompact(v),
    }
  });
  const data = { labels, datasets: [ seriesFor('income','#0E7A5F','top'), seriesFor('expenses','#B8433A','bottom') ] };
  const options = {
    responsive:true, maintainAspectRatio:false,
    interaction:{ mode:'index', intersect:false },
    plugins:{
      legend:{display:false},
      tooltip:{ callbacks:{ label:(ctx)=> `${ctx.dataset.label}: ${fmt.format(ctx.parsed.y)}` } },
    },
    scales:{
      x:{ grid:{display:false}, ticks: todayTickOptions(todayIdx) },
      y:{ grid:{color:'#EEF2F0'}, ticks:{display:false}, border:{display:false} },
    }
  };
  if(forecastChart) forecastChart.destroy();
  forecastChart = new Chart(document.getElementById('chart-forecast'), { type:'line', data, options });
}

let saldoChart = null;
function renderSaldoTrendChart(){
  const { pts, todayIdx } = forecastWindow();
  const before = addMonthsToKey(pts[0].key,-1);
  let running = accumulatedUpTo(before);
  const series = pts.map(p=>{ running += (p.income - p.expenses); return { key:p.key, value:running }; });
  const labels = series.map(p=>monthShort(p.key));

  const data = { labels, datasets: [{
    label:'Saldo acumulado',
    data: series.map(p=>p.value),
    borderColor:'#0E7A5F', backgroundColor:'rgba(14,122,95,0.08)', pointBackgroundColor:'#0E7A5F',
    borderWidth:2.4, pointRadius:3, tension:0, fill:'origin',
    segment: { borderDash: dashAfterToday(todayIdx) },
    datalabels: {
      color:'#0E7A5F',
      anchor: (ctx)=> ctx.dataset.data[ctx.dataIndex] >= 0 ? 'end' : 'start',
      align: (ctx)=> ctx.dataset.data[ctx.dataIndex] >= 0 ? 'top' : 'bottom',
      offset:4, font:{size:9,weight:'600'},
      formatter: (v)=> fmtCompact(v),
    }
  }] };
  const options = {
    responsive:true, maintainAspectRatio:false,
    interaction:{ mode:'index', intersect:false },
    plugins:{
      legend:{display:false},
      tooltip:{ callbacks:{ label:(ctx)=> `Saldo: ${fmt.format(ctx.parsed.y)}` } },
    },
    scales:{
      x:{ grid:{display:false}, ticks: todayTickOptions(todayIdx) },
      y:{ grid:{color:'#EEF2F0'}, ticks:{display:false}, border:{display:false} },
    }
  };
  if(saldoChart) saldoChart.destroy();
  saldoChart = new Chart(document.getElementById('chart-saldo'), { type:'line', data, options });
}

let saudeDonutChart = null;
function renderSaudeDonut(segments, donutBase){
  const wrap = document.getElementById('saude-donut-row');
  if(donutBase<=0){ wrap.style.display='none'; return; }
  wrap.style.display='flex';
  if(saudeDonutChart) saudeDonutChart.destroy();
  saudeDonutChart = new Chart(document.getElementById('saude-donut'), {
    type:'doughnut',
    data:{
      labels: segments.map(s=>s.label),
      datasets:[{ data: segments.map(s=>s.value), backgroundColor: segments.map(s=>s.color), borderWidth:0 }]
    },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'74%',
      plugins:{
        legend:{display:false}, datalabels:{display:false},
        tooltip:{ callbacks:{ label:(ctx)=> `${ctx.label}: ${fmt.format(ctx.parsed)}` } },
      }
    }
  });
}
function renderSaude(key,t){
  const fixedTotal = sumEntries(t.mm.fixed);
  const variableTotal = sumEntries(t.mm.variable);
  // Base = o que o usuário tem disponível no mês (acumulado dos meses anteriores
  // + receita deste mês), decisão explícita dele. Antes a base era só a receita.
  const disponivel = disponivelDoMes(key, t.income);
  const gastos = fixedTotal + variableTotal;
  const sobra = disponivel - gastos;
  const estourou = sobra < 0;

  const ratio = disponivel>0 ? fixedTotal/disponivel : null;
  let label,color;
  if(disponivel<=0){ label='Sem saldo disponível este mês'; color='var(--ink-soft)'; }
  else if(estourou){ label='Estourou o disponível'; color='var(--bad)'; }
  else if(ratio<0.5){ label='Confortável'; color='var(--brand)'; }
  else if(ratio<0.75){ label='Atenção'; color='var(--warn)'; }
  else { label='Apertado'; color='var(--bad)'; }
  const pct = ratio===null?0:Math.min(100,ratio*100);
  const taxaSobra = disponivel>0 ? sobra/disponivel : null;

  document.getElementById('saude-summary').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
      <span class="health-badge" style="background:${disponivel<=0?'#EEF1F0':color};color:${disponivel<=0?'var(--ink-soft)':'#fff'}">${esc(label)}</span>
      <span class="small">${ratio!==null ? esc((ratio*100).toFixed(0))+'% do disponível preso em fixas' : ''}</span>
    </div>
    <div class="tl-bar-wrap" style="height:10px;margin-bottom:12px;"><div class="tl-bar ${estourou?'over':''}" style="width:${esc(pct)}%;background:${disponivel<=0?'#ccc':color}"></div></div>
    <div class="small">${taxaSobra!==null
        ? `Disponível no mês: <strong style="font-family:var(--mono)">${esc(fmt.format(disponivel))}</strong> — acumulado anterior mais a receita deste mês.<br>Sobra: <strong style="color:${sobra>=0?'var(--brand)':'var(--bad)'}">${esc((taxaSobra*100).toFixed(0))}%</strong>${estourou?' — os gastos passaram o que você tem':''}.`
        : 'Lance a receita do mês para calcular a proporção.'}</div>
  `;

  // Legenda e rosca precisam usar o MESMO denominador. Antes a legenda dividia
  // pela receita e o Chart.js pela soma das fatias — com gastos acima da receita
  // a legenda chegava a somar 120% enquanto o desenho mostrava outra proporção.
  const segments = estourou
    ? [ {label:'Fixas', value:fixedTotal, color:'#3A5BC7'},
        {label:'Variáveis', value:variableTotal, color:'#B8792B'} ]
    : [ {label:'Fixas', value:fixedTotal, color:'#3A5BC7'},
        {label:'Variáveis', value:variableTotal, color:'#B8792B'},
        {label:'Sobra', value:sobra, color:'#0E7A5F'} ];
  const soma = segments.reduce((s,x)=>s+x.value,0);

  document.getElementById('saude-legend').innerHTML = segments.filter(s=>s.value>0).map(s=>`
    <div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;">
      <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${escapeAttr(s.color)};vertical-align:middle;"></span>${esc(s.label)}</span>
      <span style="font-family:var(--mono);font-weight:600;white-space:nowrap;">${esc(fmt.format(s.value))} · ${esc(soma>0?(s.value/soma*100).toFixed(0):0)}%</span>
    </div>`).join('') + (estourou
      ? `<div class="saude-alert">Gastos ${esc(fmt.format(-sobra))} acima do disponível.</div>` : '');
  renderSaudeDonut(segments, soma);
}

function renderFaturasInto(mm, targetId, monthKey){
  const el = document.getElementById(targetId);
  if(!state.cards.length){ el.innerHTML = `<div class="empty">Cadastre seus cartões na aba "Cartões" para ver as faturas aqui.</div>`; return; }
  const cards = state.cards.map(c=>{
    const inv = cardInvoiceTotals(mm, c.id);
    const payBtn = inv.lancado>0 ? `<button class="btn secondary" onclick="payInvoice('${esc(c.id)}','${esc(monthKey)}')">Pagar fatura</button>` : `<span></span>`;
    let limitHtml = '';
    if(c.limit){
      const used = cardLimitUsage(c.id);
      const pct = Math.min(100, (used/c.limit)*100);
      const over = used > c.limit;
      const disponivel = c.limit - used;
      limitHtml = `<div class="fatura-limit">
        <div class="debt-head" style="margin-bottom:5px;">
          <span class="small">Limite do cartão</span>
          <span class="small"><strong>${esc(pct.toFixed(0))}% usado</strong> · ${disponivel>=0?esc(fmt.format(disponivel))+' livre':'estourado'}</span>
        </div>
        <div class="tl-bar-wrap" style="height:8px;"><div class="tl-bar ${over?'over':''}" style="width:${esc(Math.max(pct,2))}%"></div></div>
      </div>`;
    }
    return `<div class="fatura-card">
      <div class="fatura-top">
        <span class="fatura-name"><span class="tag-card" style="background:${escapeAttr(c.color||'#999')}"></span><strong>${esc(c.name)}</strong>${c.dueDay?`<span class="small">&nbsp;· vence dia ${esc(c.dueDay)}</span>`:''}</span>
        <div class="fatura-vals-row">
          <span class="fval"><span class="flabel">Lançado</span>${esc(fmt.format(inv.lancado))}</span>
          <span class="fval"><span class="flabel">Pendente</span>${esc(fmt.format(inv.pendente))}</span>
          <span class="fval total"><span class="flabel">Previsto</span>${esc(fmt.format(inv.previsto))}</span>
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
      <div class="debt-head"><span><span class="tag-card" style="background:${escapeAttr(c.color||'#999')}"></span>${esc(c.name)}</span><span class="small">${esc(pctC.toFixed(0))}% usado</span></div>
      <div class="tl-bar-wrap" style="height:8px;"><div class="tl-bar ${overC?'over':''}" style="width:${esc(Math.max(pctC,2))}%"></div></div>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="debt-head" style="margin-bottom:6px;">
      <span class="small">${esc(withLimit.length)} ${withLimit.length>1?'cartões':'cartão'} com limite cadastrado</span>
      <span class="small"><strong>${esc(pct.toFixed(0))}% usado</strong> · ${disponivel>=0?esc(fmt.format(disponivel))+' livre':'estourado'}</span>
    </div>
    <div class="tl-bar-wrap" style="height:10px;margin-bottom:10px;"><div class="tl-bar ${over?'over':''}" style="width:${esc(Math.max(pct,2))}%"></div></div>
    <div class="small" style="margin-bottom:16px;">${esc(fmt.format(totalUsed))} usado de ${esc(fmt.format(totalLimit))} de limite total.${semLimite>0?` (${esc(semLimite)} ${semLimite>1?'cartões':'cartão'} sem limite cadastrado ${semLimite>1?'não entram':'não entra'} nessa conta.)`:''}</div>
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
  logAudit('Status', `Fatura de "${card?card.name:'cartão'}" paga (${entries.length} lançamento(s)) em ${monthLabel(monthKey)}.`);
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

let anoChart = null;
function renderAnoChart(data){
  const labels = data.map(d=>MONTH_NAMES[keyParts(d.key).m-1].slice(0,3));
  const barSeries = (field,color) => ({
    label: field==='income' ? 'Receita' : 'Despesas',
    data: data.map(d=>d[field]),
    backgroundColor: color, borderRadius:2, categoryPercentage:0.6, barPercentage:0.9,
    datalabels: {
      display: (ctx)=> ctx.dataset.data[ctx.dataIndex] > 0,
      color, anchor:'end', align:'top', font:{size:8,weight:'600'},
      formatter: (v)=> fmtCompact(v),
    }
  });
  const chartData = { labels, datasets:[ barSeries('income','#0E7A5F'), barSeries('expenses','#B8433A') ] };
  const options = {
    responsive:true, maintainAspectRatio:false,
    plugins:{
      legend:{display:false},
      tooltip:{ callbacks:{ label:(ctx)=> `${ctx.dataset.label}: ${fmt.format(ctx.parsed.y)}` } },
    },
    scales:{
      x:{ grid:{display:false}, ticks:{color:'#5B6663', font:{size:9.5}} },
      y:{ grid:{color:'#EEF2F0'}, ticks:{display:false}, border:{display:false} },
    }
  };
  if(anoChart) anoChart.destroy();
  anoChart = new Chart(document.getElementById('chart-ano'), { type:'bar', data:chartData, options });
}
