/* ================= Relatórios: Excel / CSV / PDF ================= */
function collectAllData(){
  const monthKeys = Object.keys(state.months).sort();
  const entriesFlat = [];
  monthKeys.forEach(k=>{
    const mm = state.months[k];
    ['income','fixed','variable'].forEach(kind=>{
      mm[kind].forEach(e=>{
        entriesFlat.push({
          mes: monthLabel(k),
          tipo: kind==='income' ? 'Receita' : (kind==='fixed' ? 'Despesa fixa' : 'Despesa variável'),
          descricao: e.desc,
          valor: num(e.amount),
          metodo: kind==='income' ? '' : (e.method||''),
          cartao: e.cardId ? cardName(e.cardId) : '',
          status: e.status,
          pago: num(e.paidAmount||0),
        });
      });
    });
  });
  return { monthKeys, entriesFlat, cards: state.cards, commitments: state.commitments };
}

function dateStamp(){
  return new Date().toISOString().slice(0,16).replace(/[-:T]/g,'').replace(/(\d{8})(\d{4})/,'$1-$2');
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click(); URL.revokeObjectURL(url);
}

function exportCSV(){
  const { entriesFlat, cards, commitments } = collectAllData();
  const esc = v => { const s = String(v==null?'':v); return /[",;\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  const money = v => num(v).toFixed(2).replace('.',',');
  const lines = [];

  lines.push('Lançamentos');
  lines.push(['Mês','Tipo','Descrição','Valor','Método','Cartão','Status','Pago'].join(';'));
  entriesFlat.forEach(e=>lines.push([e.mes,e.tipo,e.descricao,money(e.valor),e.metodo,e.cartao,e.status,money(e.pago)].map(esc).join(';')));

  lines.push('');
  lines.push('Compromissos');
  lines.push(['Descrição','Categoria','Tipo','Valor','Método','Cartão','Início','Parcelas'].join(';'));
  commitments.forEach(c=>{
    const catLabel = {fixed:'Despesa fixa',variable:'Despesa variável',income:'Receita'}[c.category];
    lines.push([
      c.desc, catLabel, c.type==='installment'?'Parcelado':'Mensal contínuo', money(c.amount),
      c.category==='income'?'':(c.method||''), c.cardId?cardName(c.cardId):'', c.start,
      c.type==='installment' ? `${c.startNum}/${c.total}` : ''
    ].map(esc).join(';'));
  });

  lines.push('');
  lines.push('Cartões');
  lines.push(['Nome','Banco','Fecha','Vence','Limite'].join(';'));
  cards.forEach(c=>lines.push([c.name, c.bank||'', c.closingDay||'', c.dueDay||'', c.limit?money(c.limit):''].map(esc).join(';')));

  const blob = new Blob(['﻿'+lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  downloadBlob(blob, `financeiro-dados-${dateStamp()}.csv`);
  logAudit('Exportação', 'Dados exportados em CSV.');
  save();
}

function exportExcel(){
  if(typeof XLSX === 'undefined'){
    alert('Não consegui carregar a biblioteca de Excel (verifique sua conexão) — tente novamente ou use a exportação CSV.');
    return;
  }
  const { entriesFlat, cards, commitments } = collectAllData();
  const wb = XLSX.utils.book_new();

  const wsLanc = XLSX.utils.json_to_sheet(entriesFlat.map(e=>({
    'Mês': e.mes, 'Tipo': e.tipo, 'Descrição': e.descricao, 'Valor': e.valor,
    'Método': e.metodo, 'Cartão': e.cartao, 'Status': e.status, 'Pago': e.pago
  })));
  XLSX.utils.book_append_sheet(wb, wsLanc, 'Lançamentos');

  const wsCommit = XLSX.utils.json_to_sheet(commitments.map(c=>({
    'Descrição': c.desc,
    'Categoria': {fixed:'Despesa fixa',variable:'Despesa variável',income:'Receita'}[c.category],
    'Tipo': c.type==='installment' ? 'Parcelado' : 'Mensal contínuo',
    'Valor': num(c.amount),
    'Método': c.category==='income' ? '' : (c.method||''),
    'Cartão': c.cardId ? cardName(c.cardId) : '',
    'Início': c.start,
    'Parcelas': c.type==='installment' ? `${c.startNum}/${c.total}` : ''
  })));
  XLSX.utils.book_append_sheet(wb, wsCommit, 'Compromissos');

  const wsCards = XLSX.utils.json_to_sheet(cards.map(c=>({
    'Nome': c.name, 'Banco': c.bank||'', 'Fecha dia': c.closingDay||'', 'Vence dia': c.dueDay||'', 'Limite': c.limit?num(c.limit):''
  })));
  XLSX.utils.book_append_sheet(wb, wsCards, 'Cartões');

  XLSX.writeFile(wb, `financeiro-dados-${dateStamp()}.xlsx`);
  logAudit('Exportação', 'Dados exportados em Excel.');
  save();
}

function exportPDF(){
  const { monthKeys, cards, commitments } = collectAllData();
  const now = new Date();
  let html = `<div class="pr-header"><h1>Meu Financeiro — Relatório completo</h1><span>Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span></div>`;

  html += `<h2>Cartões</h2>`;
  html += cards.length ? `<table><thead><tr><th>Nome</th><th>Banco</th><th>Fecha</th><th>Vence</th><th class="num">Limite</th></tr></thead><tbody>${
    cards.map(c=>`<tr><td>${c.name}</td><td>${c.bank||'—'}</td><td>${c.closingDay?('dia '+c.closingDay):'—'}</td><td>${c.dueDay?('dia '+c.dueDay):'—'}</td><td class="num">${c.limit?fmt.format(c.limit):'—'}</td></tr>`).join('')
  }</tbody></table>` : `<p class="pr-empty">Nenhum cartão cadastrado.</p>`;

  html += `<h2>Compromissos</h2>`;
  html += commitments.length ? `<table><thead><tr><th>Descrição</th><th>Categoria</th><th>Método</th><th class="num">Valor</th><th>Progresso</th></tr></thead><tbody>${
    commitments.map(c=>{
      const catLabel = {fixed:'Despesa fixa',variable:'Despesa variável',income:'Receita'}[c.category];
      const methodLabel = c.category==='income' ? '—' : (c.cardId?cardName(c.cardId):(c.method||'—'));
      let progress = c.type==='monthly' ? `Mensal contínuo desde ${monthLabel(c.start)}` : `Parcela inicial ${c.startNum}/${c.total} desde ${monthLabel(c.start)}`;
      if(c.endMonth) progress += ` · encerra após ${monthLabel(c.endMonth)}`;
      return `<tr><td>${c.desc}</td><td>${catLabel}</td><td>${methodLabel}</td><td class="num">${fmt.format(c.amount)}</td><td>${progress}</td></tr>`;
    }).join('')
  }</tbody></table>` : `<p class="pr-empty">Nenhum compromisso cadastrado.</p>`;

  html += `<h2>Lançamentos por mês</h2>`;
  if(!monthKeys.length){
    html += `<p class="pr-empty">Nenhum mês com lançamentos.</p>`;
  } else {
    monthKeys.forEach(k=>{
      const mm = state.months[k];
      html += `<div class="pr-month-title">${monthLabel(k)}</div>`;
      const all = [
        ...mm.income.map(e=>({...e, tipo:'Receita'})),
        ...mm.fixed.map(e=>({...e, tipo:'Despesa fixa'})),
        ...mm.variable.map(e=>({...e, tipo:'Despesa variável'})),
      ];
      if(!all.length){ html += `<p class="pr-empty">Nada lançado.</p>`; return; }
      html += `<table><thead><tr><th>Tipo</th><th>Descrição</th><th>Método</th><th class="num">Valor</th><th>Status</th></tr></thead><tbody>${
        all.map(e=>`<tr><td>${e.tipo}</td><td>${e.desc}</td><td>${e.tipo==='Receita'?'—':(e.cardId?cardName(e.cardId):(e.method||'—'))}</td><td class="num">${fmt.format(e.amount)}</td><td>${e.status}</td></tr>`).join('')
      }</tbody></table>`;
    });
  }

  document.getElementById('print-report').innerHTML = html;
  logAudit('Exportação', 'Relatório exportado em PDF.');
  save();
  setTimeout(()=> window.print(), 50);
}
