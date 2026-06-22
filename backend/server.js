require("dotenv").config();

const express       = require("express");
const cors          = require("cors");
const helmet        = require("helmet");
const rateLimit     = require("express-rate-limit");
const Database      = require("better-sqlite3");
const path          = require("path");
const crypto        = require("crypto");
const { Resend }    = require("resend");

const app  = express();
const PORT = 3000;

// -------------------------------------------------------
// Senha do admin (via .env)
// -------------------------------------------------------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ejiniff@admin2026";

// -------------------------------------------------------
// Configuração de e-mail — Resend
// -------------------------------------------------------
const resend = new Resend(process.env.RESEND_API_KEY);

const MODALIDADES_NOME = {
  lol:      "League of Legends",
  valorant: "Valorant",
  cs2:      "Counter-Strike 2",
  freefire: "Free Fire",
  xadrez:   "Xadrez Arena",
};

async function enviarEmailConfirmacao(inscricao) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("⚠️  RESEND_API_KEY não configurada — e-mail não enviado.");
    return;
  }

  // Busca os dados completos do banco para garantir que estão corretos
  const dados = db.prepare("SELECT * FROM inscricoes WHERE id = ?").get(inscricao.id);
  if (!dados) {
    console.warn("⚠️  Inscrição não encontrada no banco para envio de e-mail.");
    return;
  }

  const modalidadeNome = MODALIDADES_NOME[dados.modalidade] || dados.modalidade;
  const dataFormatada  = new Date(dados.data_inscricao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  // Formata CPF para exibição: 000.000.000-00
  const cpfFormatado = dados.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

  const campoExtraHtml = dados.campo_extra_label && dados.campo_extra_valor
    ? `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:0.9rem;white-space:nowrap;">${dados.campo_extra_label}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #1f2937;font-weight:bold;font-size:0.9rem;">${dados.campo_extra_valor}</td>
      </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Confirmação de Inscrição — e-JINIFF 2026</title>
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0d1117;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:580px;" cellpadding="0" cellspacing="0">

        <!-- HEADER -->
        <tr>
          <td style="background:#05080d;border-radius:16px 16px 0 0;border:1px solid #00a859;border-bottom:none;padding:28px 36px;text-align:center;">
            <div style="font-size:2rem;font-weight:bold;color:#00ff88;letter-spacing:-0.5px;">e-JINIFF 2026</div>
            <div style="font-size:0.82rem;color:#6b7280;margin-top:4px;">Instituto Federal Fluminense — Campus Quissamã</div>
          </td>
        </tr>

        <!-- BANNER VERDE -->
        <tr>
          <td style="background:linear-gradient(135deg,#00a859,#00ff88);padding:20px 36px;text-align:center;">
            <div style="font-size:1.6rem;">✅</div>
            <div style="font-size:1.1rem;font-weight:bold;color:#05080d;margin-top:6px;">Inscrição confirmada!</div>
          </td>
        </tr>

        <!-- CORPO -->
        <tr>
          <td style="background:#111827;border:1px solid #1f2937;border-top:none;border-bottom:none;padding:32px 36px;">

            <p style="margin:0 0 6px;font-size:1.05rem;">Olá, <strong style="color:#00ff88;">${dados.nome}</strong>! 👋</p>
            <p style="margin:0 0 24px;color:#9ca3af;font-size:0.95rem;line-height:1.6;">
              Agradecemos sua participação nos <strong style="color:#f5f5f5;">Jogos Internos e-JINIFF 2026</strong>!
              Sua inscrição foi registrada com sucesso em nosso sistema. Confira seus dados abaixo.
            </p>

            <!-- TABELA DE DADOS -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;border-radius:10px;border:1px solid #1f2937;overflow:hidden;margin-bottom:24px;">
              <thead>
                <tr>
                  <td colspan="2" style="background:#0d1117;padding:12px 14px;border-bottom:1px solid #1f2937;">
                    <span style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:#4b5563;font-weight:bold;">Dados da inscrição</span>
                  </td>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding:10px 14px;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:0.9rem;white-space:nowrap;">Nome completo</td>
                  <td style="padding:10px 14px;border-bottom:1px solid #1f2937;font-weight:bold;font-size:0.9rem;">${dados.nome}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:0.9rem;">Matrícula</td>
                  <td style="padding:10px 14px;border-bottom:1px solid #1f2937;font-weight:bold;font-size:0.9rem;">${dados.matricula}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:0.9rem;">CPF</td>
                  <td style="padding:10px 14px;border-bottom:1px solid #1f2937;font-weight:bold;font-size:0.9rem;">${cpfFormatado}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:0.9rem;">E-mail</td>
                  <td style="padding:10px 14px;border-bottom:1px solid #1f2937;font-weight:bold;font-size:0.9rem;">${dados.email}</td>
                </tr>
                <tr>
                  <td style="padding:10px 14px;border-bottom:1px solid #1f2937;color:#9ca3af;font-size:0.9rem;">Modalidade</td>
                  <td style="padding:10px 14px;border-bottom:1px solid #1f2937;font-size:0.9rem;">
                    <span style="background:#00a85920;color:#00ff88;border:1px solid #00a859;border-radius:20px;padding:3px 12px;font-weight:bold;font-size:0.82rem;">${modalidadeNome}</span>
                  </td>
                </tr>
                ${campoExtraHtml}
                <tr>
                  <td style="padding:10px 14px;color:#9ca3af;font-size:0.9rem;">Data da inscrição</td>
                  <td style="padding:10px 14px;font-size:0.9rem;">${dataFormatada}</td>
                </tr>
              </tbody>
            </table>

            <!-- AVISO -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fbbf2415;border:1px solid #fbbf2440;border-radius:10px;margin-bottom:24px;">
              <tr>
                <td style="padding:14px 18px;">
                  <span style="font-size:1rem;">📢</span>
                  <span style="font-size:0.88rem;color:#fbbf24;margin-left:8px;font-weight:bold;">Próximos passos</span>
                  <p style="margin:8px 0 0;color:#d1d5db;font-size:0.88rem;line-height:1.6;">
                    Fique atento aos comunicados da equipe organizadora sobre datas, horários e local das seletivas.
                    As informações serão divulgadas pelos canais oficiais do IFF Campus Quissamã.
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#6b7280;font-size:0.85rem;line-height:1.6;">
              Se você não realizou essa inscrição ou há algum dado incorreto, entre em contato com a equipe organizadora o quanto antes.
            </p>

          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#05080d;border-radius:0 0 16px 16px;border:1px solid #1f2937;border-top:none;padding:20px 36px;text-align:center;">
            <p style="margin:0;color:#374151;font-size:0.8rem;">© 2026 Jogos Internos e-JINIFF — IFF Campus Quissamã</p>
            <p style="margin:6px 0 0;color:#374151;font-size:0.75rem;">Este é um e-mail automático, não responda.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { error } = await resend.emails.send({
    from: `${process.env.EMAIL_NOME || "e-JINIFF 2026"} <onboarding@resend.dev>`,
    to: "inscricoes.ejiniff@gmail.com",
    subject: `Nova inscrição — ${dados.nome} — ${modalidadeNome} | e-JINIFF 2026`,
    html,
  });

  if (error) throw new Error(error.message);

  console.log(`📧 E-mail enviado para ${dados.email} (${dados.nome} — ${modalidadeNome})`);
}
// -------------------------------------------------------
// Banco de dados SQLite
// -------------------------------------------------------
const db = new Database(path.join(__dirname, "inscricoes.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS inscricoes (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    nome               TEXT    NOT NULL,
    matricula          TEXT    NOT NULL,
    cpf                TEXT    NOT NULL,
    email              TEXT    NOT NULL,
    modalidade         TEXT    NOT NULL,
    campo_extra_label  TEXT,
    campo_extra_valor  TEXT,
    data_inscricao     TEXT    NOT NULL
  )
`);

// -------------------------------------------------------
// Helmet — headers de segurança HTTP
// -------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    xContentTypeOptions: true,
    xFrameOptions: { action: "sameorigin" },
    referrerPolicy: { policy: "same-origin" },
  })
);

// -------------------------------------------------------
// CORS — permite mesma origem
// -------------------------------------------------------
app.use(cors());

// -------------------------------------------------------
// Limite de tamanho de payload (evita ataques de payload gigante)
// -------------------------------------------------------
app.use(express.json({ limit: "20kb" }));

// -------------------------------------------------------
// Rate limiting geral — 100 req / 15 min por IP
// -------------------------------------------------------
const limiterGeral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muitas requisições. Tente novamente em alguns minutos." },
});
app.use("/api", limiterGeral);

// Rate limiting mais restrito para inscrições — 10 req / 10 min por IP
const limiterInscricao = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { erro: "Limite de inscrições atingido. Aguarde alguns minutos." },
});
app.use("/api/inscricoes", limiterInscricao);

// Rate limiting para login — 5 tentativas / 15 min por IP
const limiterLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { erro: "Muitas tentativas de login. Tente novamente em 15 minutos." },
});
app.use("/api/admin/login", limiterLogin);

// -------------------------------------------------------
// Arquivos estáticos
// -------------------------------------------------------
app.use(express.static(path.join(__dirname, "..")));

// -------------------------------------------------------
// Helpers de validação
// -------------------------------------------------------
function cpfValido(cpf) {
  const nums = cpf.replace(/\D/g, "");
  if (nums.length !== 11 || /^(\d)\1+$/.test(nums)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(nums[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(nums[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(nums[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(nums[10]);
}

// Sanitiza string: remove tags HTML e caracteres de controle
function sanitizar(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim();
}

const MODALIDADES_VALIDAS = ["lol", "valorant", "cs2", "freefire", "xadrez"];

// -------------------------------------------------------
// Middleware de autenticação do admin (token de sessão simples)
// -------------------------------------------------------
// Armazena tokens em memória (válidos por 2 horas)
const sessoes = new Map();

function gerarToken() {
  return crypto.randomBytes(32).toString("hex");
}

function autenticarAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token) {
    return res.status(401).json({ erro: "Acesso não autorizado. Faça login." });
  }
  const sessao = sessoes.get(token);
  if (!sessao) {
    return res.status(401).json({ erro: "Sessão inválida ou expirada." });
  }
  if (Date.now() > sessao.expira) {
    sessoes.delete(token);
    return res.status(401).json({ erro: "Sessão expirada. Faça login novamente." });
  }
  next();
}

// -------------------------------------------------------
// POST /api/admin/login — autenticar admin
// -------------------------------------------------------
app.post("/api/admin/login", (req, res) => {
  const { senha } = req.body;
  if (!senha) {
    return res.status(400).json({ erro: "Senha obrigatória." });
  }

  // Comparação segura (tempo constante, evita timing attack)
  const senhaHash    = crypto.createHash("sha256").update(String(senha)).digest("hex");
  const esperadoHash = crypto.createHash("sha256").update(String(ADMIN_PASSWORD)).digest("hex");

  let ok = false;
  try {
    ok = crypto.timingSafeEqual(
      Buffer.from(senhaHash, "hex"),
      Buffer.from(esperadoHash, "hex")
    );
  } catch {
    ok = false;
  }

  if (!ok) {
    return res.status(401).json({ erro: "Senha incorreta." });
  }

  const token = gerarToken();
  sessoes.set(token, { expira: Date.now() + 2 * 60 * 60 * 1000 }); // 2 horas

  return res.json({ token });
});

// -------------------------------------------------------
// POST /api/admin/logout
// -------------------------------------------------------
app.post("/api/admin/logout", (req, res) => {
  const token = req.headers["x-admin-token"];
  if (token) sessoes.delete(token);
  return res.json({ mensagem: "Logout realizado." });
});

// -------------------------------------------------------
// POST /api/inscricoes — cadastrar nova inscrição (público)
// -------------------------------------------------------
app.post("/api/inscricoes", (req, res) => {
  const { nome, matricula, cpf, email, modalidade, campoExtraLabel, campoExtraValor } = req.body;

  if (!nome || !matricula || !cpf || !email || !modalidade) {
    return res.status(400).json({ erro: "Todos os campos obrigatórios devem ser preenchidos." });
  }

  if (typeof nome !== "string" || nome.length > 150) {
    return res.status(400).json({ erro: "Nome inválido." });
  }
  if (typeof matricula !== "string" || matricula.length > 30) {
    return res.status(400).json({ erro: "Matrícula inválida." });
  }

  if (!MODALIDADES_VALIDAS.includes(modalidade)) {
    return res.status(400).json({ erro: "Modalidade inválida." });
  }

  if (!cpfValido(cpf)) {
    return res.status(400).json({ erro: "CPF inválido." });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return res.status(400).json({ erro: "E-mail inválido." });
  }

  const existe = db
    .prepare("SELECT id FROM inscricoes WHERE matricula = ? AND modalidade = ?")
    .get(matricula.trim(), modalidade);

  if (existe) {
    return res.status(409).json({ erro: "Esta matrícula já está inscrita nessa modalidade." });
  }

  const dataInscricao = new Date().toISOString();

  const resultado = db
    .prepare(`
      INSERT INTO inscricoes
        (nome, matricula, cpf, email, modalidade, campo_extra_label, campo_extra_valor, data_inscricao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      sanitizar(nome),
      sanitizar(matricula),
      cpf.replace(/\D/g, ""),
      sanitizar(email).toLowerCase(),
      modalidade,
      campoExtraLabel ? sanitizar(campoExtraLabel).slice(0, 100) : null,
      campoExtraValor ? sanitizar(campoExtraValor).slice(0, 200) : null,
      dataInscricao
    );

  return res.status(201).json({
    mensagem: "Inscrição realizada com sucesso!",
    id: resultado.lastInsertRowid,
  });
});

// -------------------------------------------------------
// GET /api/inscricoes — listar (protegido)
// -------------------------------------------------------
app.get("/api/inscricoes", autenticarAdmin, (req, res) => {
  const { modalidade } = req.query;

  let inscricoes;
  if (modalidade) {
    if (!MODALIDADES_VALIDAS.includes(modalidade)) {
      return res.status(400).json({ erro: "Modalidade inválida." });
    }
    inscricoes = db
      .prepare("SELECT * FROM inscricoes WHERE modalidade = ? ORDER BY data_inscricao DESC")
      .all(modalidade);
  } else {
    inscricoes = db
      .prepare("SELECT * FROM inscricoes ORDER BY data_inscricao DESC")
      .all();
  }

  return res.json(inscricoes);
});

// -------------------------------------------------------
// GET /api/inscricoes/:id — buscar por ID (protegido)
// -------------------------------------------------------
app.get("/api/inscricoes/:id", autenticarAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ erro: "ID inválido." });

  const inscricao = db.prepare("SELECT * FROM inscricoes WHERE id = ?").get(id);
  if (!inscricao) return res.status(404).json({ erro: "Inscrição não encontrada." });

  return res.json(inscricao);
});

// -------------------------------------------------------
// PUT /api/inscricoes/:id — editar (protegido)
// -------------------------------------------------------
app.put("/api/inscricoes/:id", autenticarAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ erro: "ID inválido." });

  const { nome, matricula, cpf, email, modalidade, campoExtraLabel, campoExtraValor } = req.body;

  if (!nome || !matricula || !cpf || !email || !modalidade) {
    return res.status(400).json({ erro: "Todos os campos obrigatórios devem ser preenchidos." });
  }
  if (!MODALIDADES_VALIDAS.includes(modalidade)) {
    return res.status(400).json({ erro: "Modalidade inválida." });
  }
  if (!cpfValido(cpf)) {
    return res.status(400).json({ erro: "CPF inválido." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ erro: "E-mail inválido." });
  }

  const duplicado = db
    .prepare("SELECT id FROM inscricoes WHERE matricula = ? AND modalidade = ? AND id != ?")
    .get(matricula.trim(), modalidade, id);

  if (duplicado) {
    return res.status(409).json({ erro: "Já existe outra inscrição com essa matrícula nessa modalidade." });
  }

  const resultado = db
    .prepare(`
      UPDATE inscricoes SET
        nome              = ?,
        matricula         = ?,
        cpf               = ?,
        email             = ?,
        modalidade        = ?,
        campo_extra_label = ?,
        campo_extra_valor = ?
      WHERE id = ?
    `)
    .run(
      sanitizar(nome),
      sanitizar(matricula),
      cpf.replace(/\D/g, ""),
      sanitizar(email).toLowerCase(),
      modalidade,
      campoExtraLabel ? sanitizar(campoExtraLabel).slice(0, 100) : null,
      campoExtraValor ? sanitizar(campoExtraValor).slice(0, 200) : null,
      id
    );

  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "Inscrição não encontrada." });
  }

  return res.json({ mensagem: "Inscrição atualizada com sucesso." });
});

// -------------------------------------------------------
// DELETE /api/inscricoes/:id — remover (protegido)
// -------------------------------------------------------
app.delete("/api/inscricoes/:id", autenticarAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ erro: "ID inválido." });

  const resultado = db.prepare("DELETE FROM inscricoes WHERE id = ?").run(id);
  if (resultado.changes === 0) {
    return res.status(404).json({ erro: "Inscrição não encontrada." });
  }

  return res.json({ mensagem: "Inscrição removida com sucesso." });
});

// -------------------------------------------------------
// DELETE /api/reset — resetar banco (protegido)
// -------------------------------------------------------
app.delete("/api/reset", autenticarAdmin, (req, res) => {
  try {
    db.prepare("DELETE FROM inscricoes").run();
    const seqExiste = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'")
      .get();
    if (seqExiste) {
      db.prepare("DELETE FROM sqlite_sequence WHERE name = 'inscricoes'").run();
    }
    return res.json({ mensagem: "Banco de dados resetado com sucesso." });
  } catch (err) {
    console.error("Erro ao resetar banco:", err);
    return res.status(500).json({ erro: "Erro interno ao resetar o banco." });
  }
});

// -------------------------------------------------------
// GET /api/estatisticas — público (apenas contagens, sem dados pessoais)
// -------------------------------------------------------
app.get("/api/estatisticas", (req, res) => {
  const stats = db
    .prepare(`
      SELECT modalidade, COUNT(*) as total
      FROM inscricoes
      GROUP BY modalidade
      ORDER BY total DESC
    `)
    .all();

  const { total: totalGeral } = db
    .prepare("SELECT COUNT(*) as total FROM inscricoes")
    .get();

  return res.json({ totalGeral, porModalidade: stats });
});

// -------------------------------------------------------
// Página de administração — protegida pela tela de login
// -------------------------------------------------------
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// Rota 404 para API
app.use("/api", (req, res) => {
  res.status(404).json({ erro: "Rota não encontrada." });
});

// -------------------------------------------------------
// Inicia o servidor
// -------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n✅ Servidor rodando em https://e-jeniff.onrender.com`);
  console.log(`📋 Admin: https://e-jeniff.onrender.com/admin`);
  console.log(`🎮 Site:  https://e-jeniff.onrender.com/Index.html`);
  console.log(`\n🔐 Senha admin definida via .env (ADMIN_PASSWORD)\n`);
});
