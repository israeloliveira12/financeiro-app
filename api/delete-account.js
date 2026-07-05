// Function serverless do Vercel (Node.js, sem dependências externas — só fetch nativo).
// Exclui de vez o usuário logado no Supabase Auth. Como a tabela financeiro_state
// tem "on delete cascade" na referência a auth.users, os dados financeiros somem
// junto automaticamente.
//
// Precisa da variável de ambiente SUPABASE_SERVICE_ROLE_KEY configurada no Vercel
// (Project Settings -> Environment Variables). Essa chave nunca é exposta ao navegador:
// só existe aqui, rodando no servidor do Vercel.

const SUPABASE_URL = 'https://requjwthyczhwrelmpmx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlcXVqd3RoeWN6aHdyZWxtcG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNTA1NjUsImV4cCI6MjA5ODgyNjU2NX0._Z9xhE23kMgrPWMzj5C6ET5okuHciEpv0MLa5AUPO68';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.replace('Bearer ', '').trim();
  if (!accessToken) {
    res.status(401).json({ error: 'Token de acesso ausente' });
    return;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    res.status(500).json({ error: 'Servidor não configurado (falta SUPABASE_SERVICE_ROLE_KEY).' });
    return;
  }

  try {
    // 1. Descobre quem é o dono desse token de acesso.
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!userRes.ok) {
      res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login de novo e tente outra vez.' });
      return;
    }
    const user = await userRes.json();

    // 2. Exclui o usuário (o cascade do banco apaga os dados financeiros junto).
    const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (!delRes.ok) {
      const errText = await delRes.text();
      res.status(500).json({ error: 'Não consegui excluir a conta: ' + errText });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Erro inesperado.' });
  }
}
