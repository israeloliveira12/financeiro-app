/* ================= Dashboard ================= */
/* As cores dos gráficos vinham cravadas em hexadecimal, então no tema escuro
   a grade e os rótulos sumiam no fundo. Agora saem dos mesmos tokens do CSS,
   lidos na hora de desenhar — e applyTheme() recria os gráficos na troca. */
function chartColors(){
  const cs = getComputedStyle(document.documentElement);
  const v = (n, fb) => (cs.getPropertyValue(n) || '').trim() || fb;
  return {
    brand: v('--brand', '#0E7A5F'),
    bad:   v('--bad', '#B8433A'),
    warn:  v('--warn', '#B8792B'),
    info:  v('--info', '#3A5BC7'),
    ink:   v('--ink', '#1C2321'),
    soft:  v('--ink-soft', '#5B6663'),
    grid:  v('--line-soft', '#EEF2F0'),
    // Chart.js precisa de uma cor com alfa pro preenchimento sob a linha, e
    // color-mix resolve isso sem precisar converter hex pra rgba na mão.
    brandFill: 'color-mix(in srgb, ' + v('--brand', '#0E7A5F') + ' 12%, transparent)',
    track: v('--track', '#EEF2F0'),
    panel: v('--panel', '#FFFFFF'),
  };
}
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

/* Largura de barra sempre dentro de 0..100. Com estorno um percentual pode dar
   negativo (crédito maior que o gasto do mês naquela fatia), e o `Math.max(pct,3)`
   que existia pra garantir barra mínima transformava isso numa barrinha de 3%
   sugerindo gasto onde não há. */
function barPct(p, minimo){
  if(!isFinite(p) || p <= 0) return 0;
  return Math.min(100, Math.max(p, minimo || 0));
}
function renderTopDespesas(mm){
  const el = document.getElementById('top-despesas-panel');
  // Estorno (valor negativo) não entra: a lista é das MAIORES despesas.
  const all = [...mm.fixed, ...mm.variable].filter(e=>num(e.amount)>0).sort((a,b)=>b.amount-a.amount).slice(0,5);
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
      <div class="tl-bar-wrap" style="height:8px;"><div class="tl-bar" style="width:${esc(barPct(pct,3))}%"></div></div>
    </div>`;
  }).join('');
}
/* O painel mostrava TODO parcelamento que já existiu — quitado de dois anos atrás
   inclusive — então só crescia e empurrava os gráficos de baixo pra fora da tela.
   Agora desenha só o que ainda consome dinheiro, com teto; quitados e não-iniciados
   viram etiqueta no rodapé e só abrem sob demanda. */
const DEBT_VISIVEIS = 5;
let debtShowAll = false;
function toggleDebtAll(){ debtShowAll = !debtShowAll; renderDebtProgress(); }
// Situação de um parcelamento no mês corrente.
function debtStatus(c){
  const diff = monthDiff(c.start, todayKey());
  if(diff < 0) return { fase:'futuro' };
  const inst = c.startNum + diff;
  // Estar NA última parcela não é estar quitado — ainda falta pagar essa.
  // O cálculo antigo (cur >= total) dava "Quitado" com uma parcela em aberto.
  if(inst > c.total) return { fase:'quitado' };
  const restantes = c.total - inst + 1;
  return {
    fase:'andamento', inst, restantes,
    valor: restantes * num(c.amount),
    pct: Math.min(100, Math.max(0, ((inst-1)/c.total)*100)),
    fim: addMonthsToKey(c.start, c.total - c.startNum),
  };
}
function renderDebtProgress(){
  const el = document.getElementById('debt-progress-panel');
  const todos = state.commitments.filter(c=>c.type==='installment');
  if(!todos.length){ el.innerHTML = `<div class="empty">Nenhum parcelamento cadastrado.</div>`; return; }

  const andamento = [], quitados = [], futuros = [];
  todos.forEach(c=>{
    const st = debtStatus(c);
    if(st.fase==='andamento') andamento.push({c, st});
    else if(st.fase==='quitado') quitados.push({c, st});
    else futuros.push({c, st});
  });
  andamento.sort((a,b)=>b.st.valor - a.st.valor);

  const mostra = debtShowAll ? andamento : andamento.slice(0, DEBT_VISIVEIS);
  const linha = ({c,st}) => `<div class="debt-row">
      <div class="debt-head"><span>${esc(c.desc)}</span><span class="small">${esc(st.restantes)} restante${st.restantes>1?'s':''} · <strong>${esc(fmt.format(st.valor))}</strong></span></div>
      <div class="tl-bar-wrap" style="height:8px;"><div class="tl-bar" style="width:${esc(st.pct)}%"></div></div>
      <div class="debt-sub">parcela ${esc(st.inst)}/${esc(c.total)} · termina em ${esc(monthShort(st.fim))}</div>
    </div>`;

  let html = '';
  if(andamento.length){
    html += mostra.map(linha).join('');
    const ocultas = andamento.length - mostra.length;
    if(ocultas > 0){
      html += `<button type="button" class="linklike debt-more" onclick="toggleDebtAll()">+${esc(ocultas)} em andamento</button>`;
    } else if(debtShowAll && andamento.length > DEBT_VISIVEIS){
      html += `<button type="button" class="linklike debt-more" onclick="toggleDebtAll()">mostrar menos</button>`;
    }
    const totalFalta = andamento.reduce((s,x)=>s+x.st.valor, 0);
    html += `<div class="debt-total"><span>Total ainda a pagar</span><span class="debt-total-val">${esc(fmt.format(totalFalta))}</span></div>`;
  } else {
    html += `<div class="empty">Nenhuma parcela em andamento.</div>`;
  }

  // Quitados e não-iniciados continuam acessíveis, mas param de ocupar altura.
  const chips = [];
  if(quitados.length) chips.push(`<span class="chip-soft">${esc(quitados.length)} quitado${quitados.length>1?'s':''}</span>`);
  futuros.forEach(({c}) => chips.push(`<span class="chip-soft">${esc(c.desc)} começa em ${esc(monthShort(c.start))}</span>`));
  if(chips.length){
    html += `<div class="debt-foot"><span class="debt-chips">${chips.join('')}</span></div>`;
  }
  el.innerHTML = html;
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
  ].map(c=>`<div class="card"><div class="label">${esc(c.label)}</div><div class="value ${esc(c.cls)}">${esc(c.value)}</div>${c.delta}</div>`).join('');

  if(chart12Mode==='fluxo') renderForecastChart(); else renderSaldoTrendChart();
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
  const C = chartColors();
  return {
    color: (ctx)=> ctx.index===todayIdx ? C.brand : C.soft,
    font: (ctx)=> ({ size: 9.3, weight: ctx.index===todayIdx ? '700' : '400' }),
  };
}
function dashAfterToday(todayIdx){
  return (ctx)=> ctx.p0DataIndex >= todayIdx ? [5,4] : undefined;
}
/* Os dois gráficos de 12 meses são a mesma série vista de dois jeitos, e ocupavam
   500px de altura lado a lado. Viraram um painel só com chave Fluxo/Saldo. Só o
   visível é instanciado: num <canvas> com display:none o Chart.js mede 0x0 e
   desenha errado quando reaparece. */
let chart12Mode = 'fluxo';
function setChart12(mode){
  chart12Mode = mode;
  document.querySelectorAll('#chart12-toggle button').forEach(b=>b.classList.toggle('active', b.dataset.chart===mode));
  const fluxo = mode==='fluxo';
  document.getElementById('wrap-forecast').style.display = fluxo ? '' : 'none';
  document.getElementById('wrap-saldo').style.display = fluxo ? 'none' : '';
  document.getElementById('chart12-title').textContent = fluxo ? 'Receita x Despesas — 12 meses' : 'Tendência do saldo acumulado';
  // Destrói o que saiu de cena em vez de deixar a instância viva atrás de display:none.
  if(fluxo){ if(saldoChart){ saldoChart.destroy(); saldoChart = null; } renderForecastChart(); }
  else { if(forecastChart){ forecastChart.destroy(); forecastChart = null; } renderSaldoTrendChart(); }
}
let forecastChart = null;
function renderForecastChart(){
  const { pts, todayIdx } = forecastWindow();
  const labels = pts.map(p=>monthShort(p.key));
  const seriesFor = (field,color,align) => ({
    label: field==='income' ? 'Receita' : 'Despesas',
    data: pts.map(p=>p[field]),
    borderColor: color, backgroundColor: color, pointBackgroundColor: color,
    // Linha suavizada a pedido do usuário; o mesmo vale pro gráfico de saldo,
    // que divide o painel com este e ficaria inconsistente em bico.
    borderWidth: 2.2, pointRadius: 3, tension: 0.35,
    segment: { borderDash: dashAfterToday(todayIdx) },
    datalabels: {
      display: (ctx)=> ctx.dataset.data[ctx.dataIndex] > 0,
      color, anchor:'end', align, offset:4, font:{size:9,weight:'600'},
      formatter: (v)=> fmtCompact(v),
    }
  });
  const C = chartColors();
  const data = { labels, datasets: [ seriesFor('income',C.brand,'top'), seriesFor('expenses',C.bad,'bottom') ] };
  const options = {
    responsive:true, maintainAspectRatio:false,
    interaction:{ mode:'index', intersect:false },
    plugins:{
      legend:{display:false},
      tooltip:{ callbacks:{ label:(ctx)=> `${ctx.dataset.label}: ${fmt.format(ctx.parsed.y)}` } },
    },
    scales:{
      x:{ grid:{display:false}, ticks: todayTickOptions(todayIdx) },
      y:{ grid:{color:C.grid}, ticks:{display:false}, border:{display:false} },
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
  const C = chartColors();

  const data = { labels, datasets: [{
    label:'Saldo acumulado',
    data: series.map(p=>p.value),
    borderColor:C.brand, backgroundColor:C.brandFill, pointBackgroundColor:C.brand,
    borderWidth:2.4, pointRadius:3, tension:0.35, fill:'origin',
    segment: { borderDash: dashAfterToday(todayIdx) },
    datalabels: {
      color:C.brand,
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
      y:{ grid:{color:C.grid}, ticks:{display:false}, border:{display:false} },
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

  const C = chartColors();
  const ratio = disponivel>0 ? fixedTotal/disponivel : null;
  let label,color,soft;
  if(disponivel<=0){ label='Sem saldo disponível este mês'; color='var(--ink-soft)'; soft='var(--panel-2)'; }
  else if(estourou){ label='Estourou o disponível'; color='var(--bad)'; soft='var(--bad-soft)'; }
  else if(ratio<0.5){ label='Confortável'; color='var(--brand)'; soft='var(--brand-soft)'; }
  else if(ratio<0.75){ label='Atenção'; color='var(--warn)'; soft='var(--warn-soft)'; }
  else { label='Apertado'; color='var(--bad)'; soft='var(--bad-soft)'; }
  const pct = ratio===null?0:Math.min(100,ratio*100);
  const taxaSobra = disponivel>0 ? sobra/disponivel : null;

  document.getElementById('saude-summary').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
      <span class="health-badge" style="background:${soft};color:${color}">${esc(label)}</span>
      <span class="small">${ratio!==null ? esc((ratio*100).toFixed(0))+'% do disponível preso em fixas' : ''}</span>
    </div>
    <div class="tl-bar-wrap" style="height:10px;margin-bottom:12px;"><div class="tl-bar ${estourou?'over':''}" style="width:${esc(barPct(pct))}%;background:${disponivel<=0?'var(--line)':color}"></div></div>
    <div class="small">${taxaSobra!==null
        ? `Disponível no mês: <strong style="font-family:var(--mono)">${esc(fmt.format(disponivel))}</strong> — acumulado anterior mais a receita deste mês.<br>Sobra: <strong style="color:${sobra>=0?'var(--brand)':'var(--bad)'}">${esc((taxaSobra*100).toFixed(0))}%</strong>${estourou?' — os gastos passaram o que você tem':''}.`
        : 'Lance a receita do mês para calcular a proporção.'}</div>
  `;

  // Legenda e rosca precisam usar o MESMO denominador. Antes a legenda dividia
  // pela receita e o Chart.js pela soma das fatias — com gastos acima da receita
  // a legenda chegava a somar 120% enquanto o desenho mostrava outra proporção.
  // Uma fatia negativa (estornos acima dos gastos da categoria) não tem como
  // ser desenhada; vira zero. O clamp é feito AQUI, no array único que alimenta
  // tanto o dataset quanto a legenda, pra manter o invariante do denominador.
  const fatia = (v)=> Math.max(0, v);
  const segments = estourou
    ? [ {label:'Fixas', value:fatia(fixedTotal), color:C.info},
        {label:'Variáveis', value:fatia(variableTotal), color:C.warn} ]
    : [ {label:'Fixas', value:fatia(fixedTotal), color:C.info},
        {label:'Variáveis', value:fatia(variableTotal), color:C.warn},
        {label:'Sobra', value:fatia(sobra), color:C.brand} ];
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
        <div class="tl-bar-wrap" style="height:8px;"><div class="tl-bar ${over?'over':''}" style="width:${esc(barPct(pct,2))}%"></div></div>
      </div>`;
    }
    // "Pago" só entra na grade quando existe algo pago — sem pagamento parcial o
    // card fica idêntico ao de sempre, com as três colunas de origem.
    // !== 0 e nao > 0: um estorno já processado deixa "pago" negativo, e com o
  // teste antigo a coluna sumia — o total mostrava a diferença sem explicar de
  // onde vinha. Sem nada pago a coluna continua fora, como antes.
  const temPago = inv.pago !== 0;
    const colPago = temPago
      ? `<span class="fval pago"><span class="flabel">Pago</span>${esc(fmt.format(inv.pago))}</span>` : '';
    return `<div class="fatura-card">
      <div class="fatura-top${temPago?' has-pago':''}">
        <span class="fatura-name"><span class="tag-card" style="background:${escapeAttr(c.color||'#999')}"></span><strong>${esc(c.name)}</strong>${c.dueDay?`<span class="small">&nbsp;· vence dia ${esc(c.dueDay)}</span>`:''}</span>
        <div class="fatura-vals-row">
          ${colPago}
          <span class="fval"><span class="flabel">Lançado</span>${esc(fmt.format(inv.lancado))}</span>
          <span class="fval"><span class="flabel">Pendente</span>${esc(fmt.format(inv.pendente))}</span>
          <span class="fval total" title="${temPago?escapeAttr('Total já na fatura: '+fmt.format(inv.total)):''}"><span class="flabel">Previsto</span>${esc(fmt.format(inv.previsto))}</span>
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
      <div class="tl-bar-wrap" style="height:8px;"><div class="tl-bar ${overC?'over':''}" style="width:${esc(barPct(pctC,2))}%"></div></div>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="debt-head" style="margin-bottom:6px;">
      <span class="small">${esc(withLimit.length)} ${withLimit.length>1?'cartões':'cartão'} com limite cadastrado</span>
      <span class="small"><strong>${esc(pct.toFixed(0))}% usado</strong> · ${disponivel>=0?esc(fmt.format(disponivel))+' livre':'estourado'}</span>
    </div>
    <div class="tl-bar-wrap" style="height:10px;margin-bottom:10px;"><div class="tl-bar ${over?'over':''}" style="width:${esc(barPct(pct,2))}%"></div></div>
    <div class="small" style="margin-bottom:16px;">${esc(fmt.format(totalUsed))} usado de ${esc(fmt.format(totalLimit))} de limite total.${semLimite>0?` (${esc(semLimite)} ${semLimite>1?'cartões':'cartão'} sem limite cadastrado ${semLimite>1?'não entram':'não entra'} nessa conta.)`:''}</div>
    ${perCardHtml}
  `;
}
function payInvoice(cardId, monthKey){
  const mm = ensureMonth(monthKey);
  // Inclui os "Parcial": antes só os "Lançado" eram quitados, então uma parcela
  // adiantada pela metade ficava pra trás e a fatura nunca fechava.
  const entries = [...mm.fixed, ...mm.variable].filter(e=>(e.method==='Cartão de Crédito'||e.isCard) && e.cardId===cardId && (e.status==='Lançado' || e.status==='Parcial'));
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
  const C = chartColors();
  const chartData = { labels, datasets:[ barSeries('income',C.brand), barSeries('expenses',C.bad) ] };
  const options = {
    responsive:true, maintainAspectRatio:false,
    plugins:{
      legend:{display:false},
      tooltip:{ callbacks:{ label:(ctx)=> `${ctx.dataset.label}: ${fmt.format(ctx.parsed.y)}` } },
    },
    scales:{
      x:{ grid:{display:false}, ticks:{color:C.soft, font:{size:9.5}} },
      y:{ grid:{color:C.grid}, ticks:{display:false}, border:{display:false} },
    }
  };
  if(anoChart) anoChart.destroy();
  anoChart = new Chart(document.getElementById('chart-ano'), { type:'bar', data:chartData, options });
}
