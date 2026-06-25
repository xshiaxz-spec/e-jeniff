require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");
const Database  = require("better-sqlite3");
const path      = require("path");
const crypto    = require("crypto");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Admin password (scrypt hash gerado por gerar-hash.js) ──────────────────
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const ADMIN_ROUTE         = process.env.ADMIN_ROUTE || "admin";

if (!ADMIN_PASSWORD_HASH) {
  console.error("\n❌ ADMIN_PASSWORD_HASH não definido no .env");
  console.error("   Gere com: node gerar-hash.js <senha>\n");
  process.exit(1);
}

const [ADMIN_SALT_HEX, ADMIN_HASH_HEX] = ADMIN_PASSWORD_HASH.split(":");
if (!ADMIN_SALT_HEX || !ADMIN_HASH_HEX) {
  console.error("\n❌ ADMIN_PASSWORD_HASH com formato inválido (esperado salt:hash)\n");
  process.exit(1);
}

// ── Segredo HMAC para hash de CPF ──────────────────────────────────────────
const CPF_HMAC_SECRET = process.env.CPF_HMAC_SECRET;
if (!CPF_HMAC_SECRET) {
  console.error("\n❌ CPF_HMAC_SECRET não definido no .env");
  console.error("   Gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n");
  process.exit(1);
}

/** HMAC-SHA256 do CPF (somente dígitos). Nunca armazena o CPF em claro. */
function hashCpf(digits) {
  return crypto.createHmac("sha256", CPF_HMAC_SECRET).update(digits).digest("hex");
}

/** CPF mascarado para exibição: ***.***.***-XX */
function mascaraCpf(sufixo) {
  return "***.***.***-" + (sufixo || "**");
}

// ── Banco de dados SQLite ──────────────────────────────────────────────────
const db = new Database(path.join(__dirname, "inscricoes.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS inscricoes (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    nome               TEXT    NOT NULL,
    matricula          TEXT    NOT NULL,
    cpf_hash           TEXT    NOT NULL DEFAULT '',
    cpf_sufixo         TEXT    NOT NULL DEFAULT '',
    email              TEXT    NOT NULL,
    modalidade         TEXT    NOT NULL,
    campo_extra_label  TEXT,
    campo_extra_valor  TEXT,
    data_inscricao     TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chaves (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    modalidade   TEXT NOT NULL,
    fase         TEXT NOT NULL DEFAULT 'oitavas',
    posicao      INTEGER NOT NULL,
    jogador1_id  INTEGER REFERENCES inscricoes(id) ON DELETE SET NULL,
    jogador2_id  INTEGER REFERENCES inscricoes(id) ON DELETE SET NULL,
    placar1      INTEGER,
    placar2      INTEGER,
    vencedor_id  INTEGER REFERENCES inscricoes(id) ON DELETE SET NULL,
    status       TEXT NOT NULL DEFAULT 'aguardando',
    data_partida TEXT,
    criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
`);

// Migração transparente: se ainda existir coluna "cpf" em claro, converte e remove.
(function migrarCpf() {
  const cols = db.pragma("table_info(inscricoes)").map(function (c) { return c.name; });
  if (!cols.includes("cpf")) return;

  if (!cols.includes("cpf_hash"))   db.exec("ALTER TABLE inscricoes ADD COLUMN cpf_hash   TEXT NOT NULL DEFAULT ''");
  if (!cols.includes("cpf_sufixo")) db.exec("ALTER TABLE inscricoes ADD COLUMN cpf_sufixo TEXT NOT NULL DEFAULT ''");

  console.log("🔄 Migrando CPFs para hash+sufixo...");
  const rows   = db.prepare("SELECT id, cpf FROM inscricoes").all();
  const update = db.prepare("UPDATE inscricoes SET cpf_hash = ?, cpf_sufixo = ? WHERE id = ?");

  db.transaction(function () {
    for (const row of rows) {
      const d = String(row.cpf).replace(/\D/g, "");
      update.run(hashCpf(d), d.slice(9), row.id);
    }
    try {
      db.exec("ALTER TABLE inscricoes DROP COLUMN cpf");
    } catch {
      // SQLite < 3.35 — recria tabela sem a coluna
      db.exec(`
        CREATE TABLE inscricoes_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL, matricula TEXT NOT NULL,
          cpf_hash TEXT NOT NULL DEFAULT '', cpf_sufixo TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL, modalidade TEXT NOT NULL,
          campo_extra_label TEXT, campo_extra_valor TEXT, data_inscricao TEXT NOT NULL
        );
        INSERT INTO inscricoes_new
          SELECT id, nome, matricula, cpf_hash, cpf_sufixo,
                 email, modalidade, campo_extra_label, campo_extra_valor, data_inscricao
          FROM inscricoes;
        DROP TABLE inscricoes;
        ALTER TABLE inscricoes_new RENAME TO inscricoes;
      `);
    }
  })();
  console.log("✅ " + rows.length + " CPF(s) migrado(s). Dado em claro removido.");
})();

// ── Helpers de validação ───────────────────────────────────────────────────
function cpfValido(cpf) {
  const n = cpf.replace(/\D/g, "");
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(n[i]) * (10 - i);
  let r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(n[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(n[i]) * (11 - i);
  r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
  return r === parseInt(n[10]);
}

function sanitizar(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[<>]/g, "").replace(/[\x00-\x1F\x7F]/g, "").trim();
}

const MODALIDADES_VALIDAS = ["lol", "valorant", "cs2", "freefire", "xadrez"];

// ── Helmet ─────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy:     false,
  crossOriginEmbedderPolicy: false,
  xContentTypeOptions:       true,
  xFrameOptions:             { action: "sameorigin" },
  referrerPolicy:            { policy: "same-origin" },
}));

// ── CORS ───────────────────────────────────────────────────────────────────
const origensPermitidas = [
  /^https:\/\/e-jeniff(-[a-z0-9-]+)?\.vercel\.app$/,
  "https://e-jeniff.onrender.com",
];

app.use(cors({
  origin: function (origin, cb) {
    if (!origin) return cb(null, true);
    const ok = origensPermitidas.some(function (o) {
      return typeof o === "string" ? o === origin : o.test(origin);
    });
    ok ? cb(null, true) : cb(new Error("CORS: origem não permitida — " + origin));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-admin-token"],
  credentials: false,
}));

app.use(express.json({ limit: "20kb" }));

// ── Rate limiting ──────────────────────────────────────────────────────────
app.use("/api", rateLimit({ windowMs: 15*60*1000, max: 100, standardHeaders: true, legacyHeaders: false,
  message: { erro: "Muitas requisições. Tente novamente em alguns minutos." } }));

app.use("/api/inscricoes", rateLimit({ windowMs: 10*60*1000, max: 10,
  message: { erro: "Limite de inscrições atingido. Aguarde alguns minutos." } }));

app.use("/api/admin/login", rateLimit({ windowMs: 15*60*1000, max: 5,
  message: { erro: "Muitas tentativas de login. Tente novamente em 15 minutos." } }));

// ── Arquivos estáticos ─────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "..")));

// ── Sessões admin (em memória, 2h) ─────────────────────────────────────────
const sessoes = new Map();

function gerarToken() { return crypto.randomBytes(32).toString("hex"); }

function autenticarAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token) return res.status(401).json({ erro: "Acesso não autorizado. Faça login." });
  const sessao = sessoes.get(token);
  if (!sessao) return res.status(401).json({ erro: "Sessão inválida ou expirada." });
  if (Date.now() > sessao.expira) {
    sessoes.delete(token);
    return res.status(401).json({ erro: "Sessão expirada. Faça login novamente." });
  }
  next();
}

// ── POST /api/admin/login ──────────────────────────────────────────────────
app.post("/api/admin/login", (req, res) => {
  const { senha } = req.body;
  if (!senha) return res.status(400).json({ erro: "Senha obrigatória." });

  const salt = Buffer.from(ADMIN_SALT_HEX, "hex");
  crypto.scrypt(String(senha), salt, 64, (err, derivedKey) => {
    if (err) return res.status(500).json({ erro: "Erro interno de autenticação." });
    let ok = false;
    try { ok = crypto.timingSafeEqual(derivedKey, Buffer.from(ADMIN_HASH_HEX, "hex")); } catch {}
    if (!ok) return res.status(401).json({ erro: "Senha incorreta." });
    const token = gerarToken();
    sessoes.set(token, { expira: Date.now() + 2 * 60 * 60 * 1000 });
    return res.json({ token });
  });
});

// ── POST /api/admin/logout ─────────────────────────────────────────────────
app.post("/api/admin/logout", (req, res) => {
  const token = req.headers["x-admin-token"];
  if (token) sessoes.delete(token);
  return res.json({ mensagem: "Logout realizado." });
});

// ── POST /api/inscricoes — inscrever (público) ─────────────────────────────
app.post("/api/inscricoes", (req, res) => {
  const { nome, matricula, cpf, email, modalidade, campoExtraLabel, campoExtraValor } = req.body;

  if (!nome || !matricula || !cpf || !email || !modalidade)
    return res.status(400).json({ erro: "Todos os campos obrigatórios devem ser preenchidos." });
  if (typeof nome !== "string" || nome.length > 150)
    return res.status(400).json({ erro: "Nome inválido." });
  if (typeof matricula !== "string" || matricula.length > 30)
    return res.status(400).json({ erro: "Matrícula inválida." });
  if (!MODALIDADES_VALIDAS.includes(modalidade))
    return res.status(400).json({ erro: "Modalidade inválida." });
  if (!cpfValido(cpf))
    return res.status(400).json({ erro: "CPF inválido." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)
    return res.status(400).json({ erro: "E-mail inválido." });

  const existe = db
    .prepare("SELECT id FROM inscricoes WHERE matricula = ? AND modalidade = ?")
    .get(matricula.trim(), modalidade);
  if (existe)
    return res.status(409).json({ erro: "Esta matrícula já está inscrita nessa modalidade." });

  const digits     = cpf.replace(/\D/g, "");
  const cpfHashVal = hashCpf(digits);
  const cpfSufixo  = digits.slice(9);

  const resultado = db.prepare(`
    INSERT INTO inscricoes
      (nome, matricula, cpf_hash, cpf_sufixo, email, modalidade,
       campo_extra_label, campo_extra_valor, data_inscricao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sanitizar(nome), sanitizar(matricula),
    cpfHashVal, cpfSufixo,
    sanitizar(email).toLowerCase(), modalidade,
    campoExtraLabel ? sanitizar(campoExtraLabel).slice(0, 100) : null,
    campoExtraValor ? sanitizar(campoExtraValor).slice(0, 200) : null,
    new Date().toISOString()
  );

  return res.status(201).json({
    mensagem: "Inscrição realizada com sucesso!",
    id: resultado.lastInsertRowid,
    cpfSufixo, // retorna só o sufixo — frontend exibe máscara
  });
});

// ── Helpers de projeção (nunca expõe cpf_hash) ────────────────────────────
function projetar(row) {
  const { cpf_hash, cpf_sufixo, ...resto } = row;
  return { ...resto, cpf: mascaraCpf(cpf_sufixo) };
}

// ── GET /api/inscricoes — listar (protegido) ───────────────────────────────
app.get("/api/inscricoes", autenticarAdmin, (req, res) => {
  const { modalidade } = req.query;
  let rows;
  if (modalidade) {
    if (!MODALIDADES_VALIDAS.includes(modalidade))
      return res.status(400).json({ erro: "Modalidade inválida." });
    rows = db.prepare(
      "SELECT id, nome, matricula, cpf_hash, cpf_sufixo, email, modalidade, " +
      "campo_extra_label, campo_extra_valor, data_inscricao " +
      "FROM inscricoes WHERE modalidade = ? ORDER BY data_inscricao DESC"
    ).all(modalidade);
  } else {
    rows = db.prepare(
      "SELECT id, nome, matricula, cpf_hash, cpf_sufixo, email, modalidade, " +
      "campo_extra_label, campo_extra_valor, data_inscricao " +
      "FROM inscricoes ORDER BY data_inscricao DESC"
    ).all();
  }
  return res.json(rows.map(projetar));
});

// ── GET /api/inscricoes/:id — buscar por ID (protegido) ────────────────────
app.get("/api/inscricoes/:id", autenticarAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ erro: "ID inválido." });
  const row = db.prepare(
    "SELECT id, nome, matricula, cpf_hash, cpf_sufixo, email, modalidade, " +
    "campo_extra_label, campo_extra_valor, data_inscricao " +
    "FROM inscricoes WHERE id = ?"
  ).get(id);
  if (!row) return res.status(404).json({ erro: "Inscrição não encontrada." });
  return res.json(projetar(row));
});

// ── PUT /api/inscricoes/:id — editar (protegido, CPF preservado) ───────────
// O CPF NÃO é aceito nesta rota — o hash existente é mantido intacto (LGPD).
app.put("/api/inscricoes/:id", autenticarAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ erro: "ID inválido." });

  const { nome, matricula, email, modalidade, campoExtraLabel, campoExtraValor } = req.body;

  if (!nome || !matricula || !email || !modalidade)
    return res.status(400).json({ erro: "Todos os campos obrigatórios devem ser preenchidos." });
  if (typeof nome !== "string" || nome.length > 150)
    return res.status(400).json({ erro: "Nome inválido." });
  if (typeof matricula !== "string" || matricula.length > 30)
    return res.status(400).json({ erro: "Matrícula inválida." });
  if (!MODALIDADES_VALIDAS.includes(modalidade))
    return res.status(400).json({ erro: "Modalidade inválida." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)
    return res.status(400).json({ erro: "E-mail inválido." });

  const duplicado = db
    .prepare("SELECT id FROM inscricoes WHERE matricula = ? AND modalidade = ? AND id != ?")
    .get(matricula.trim(), modalidade, id);
  if (duplicado)
    return res.status(409).json({ erro: "Já existe outra inscrição com essa matrícula nessa modalidade." });

  const resultado = db.prepare(`
    UPDATE inscricoes SET
      nome = ?, matricula = ?, email = ?, modalidade = ?,
      campo_extra_label = ?, campo_extra_valor = ?
    WHERE id = ?
  `).run(
    sanitizar(nome), sanitizar(matricula),
    sanitizar(email).toLowerCase(), modalidade,
    campoExtraLabel ? sanitizar(campoExtraLabel).slice(0, 100) : null,
    campoExtraValor ? sanitizar(campoExtraValor).slice(0, 200) : null,
    id
  );

  if (resultado.changes === 0)
    return res.status(404).json({ erro: "Inscrição não encontrada." });

  return res.json({ mensagem: "Inscrição atualizada com sucesso." });
});

// ── DELETE /api/inscricoes/:id — remover (protegido) ──────────────────────
app.delete("/api/inscricoes/:id", autenticarAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ erro: "ID inválido." });
  const resultado = db.prepare("DELETE FROM inscricoes WHERE id = ?").run(id);
  if (resultado.changes === 0)
    return res.status(404).json({ erro: "Inscrição não encontrada." });
  return res.json({ mensagem: "Inscrição removida com sucesso." });
});

// ── DELETE /api/reset — zerar banco (protegido) ────────────────────────────
app.delete("/api/reset", autenticarAdmin, (req, res) => {
  try {
    db.prepare("DELETE FROM inscricoes").run();
    const seq = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'"
    ).get();
    if (seq) db.prepare("DELETE FROM sqlite_sequence WHERE name = 'inscricoes'").run();
    return res.json({ mensagem: "Banco de dados resetado com sucesso." });
  } catch (err) {
    console.error("Erro ao resetar banco:", err);
    return res.status(500).json({ erro: "Erro interno ao resetar o banco." });
  }
});

// ── GET /api/estatisticas — público (sem dados pessoais) ──────────────────
app.get("/api/estatisticas", (req, res) => {
  const stats = db.prepare(
    "SELECT modalidade, COUNT(*) as total FROM inscricoes GROUP BY modalidade ORDER BY total DESC"
  ).all();
  const { total: totalGeral } = db.prepare("SELECT COUNT(*) as total FROM inscricoes").get();
  return res.json({ totalGeral, porModalidade: stats });
});

// ══════════════════════════════════════════════════════════════════════════
// SISTEMA DE CHAVEAMENTO & RESULTADOS
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/config — lê configurações públicas ────────────────────────────
app.get("/api/config", (req, res) => {
  const rows = db.prepare("SELECT chave, valor FROM configuracoes").all();
  const cfg  = {};
  rows.forEach(function (r) { cfg[r.chave] = r.valor; });
  return res.json(cfg);
});

// ── PUT /api/config — salva configurações (protegido) ─────────────────────
app.put("/api/config", autenticarAdmin, (req, res) => {
  const permitidas = ["inscricoes_abertas", "chaveamento_visivel", "resultados_visiveis"];
  const upsert = db.prepare(
    "INSERT INTO configuracoes (chave, valor) VALUES (?, ?) " +
    "ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor"
  );
  db.transaction(function () {
    for (const [k, v] of Object.entries(req.body)) {
      if (permitidas.includes(k)) upsert.run(k, String(v));
    }
  })();
  return res.json({ mensagem: "Configurações salvas." });
});

// ── GET /api/chaves — público: retorna chaves de uma modalidade ────────────
app.get("/api/chaves", (req, res) => {
  const { modalidade } = req.query;
  if (!modalidade || !MODALIDADES_VALIDAS.includes(modalidade))
    return res.status(400).json({ erro: "Modalidade inválida." });

  const rows = db.prepare(`
    SELECT c.*,
      i1.nome AS nome1, i1.campo_extra_valor AS funcao1,
      i2.nome AS nome2, i2.campo_extra_valor AS funcao2,
      iv.nome AS nome_vencedor
    FROM chaves c
    LEFT JOIN inscricoes i1 ON c.jogador1_id = i1.id
    LEFT JOIN inscricoes i2 ON c.jogador2_id = i2.id
    LEFT JOIN inscricoes iv ON c.vencedor_id = iv.id
    WHERE c.modalidade = ?
    ORDER BY c.fase, c.posicao
  `).all(modalidade);
  return res.json(rows);
});

// ── POST /api/chaves/gerar — gera chaveamento (protegido) ──────────────────
app.post("/api/chaves/gerar", autenticarAdmin, (req, res) => {
  const { modalidade, tipo } = req.body; // tipo: "eliminatorio"
  if (!modalidade || !MODALIDADES_VALIDAS.includes(modalidade))
    return res.status(400).json({ erro: "Modalidade inválida." });

  const inscritos = db.prepare(
    "SELECT id, nome FROM inscricoes WHERE modalidade = ? ORDER BY RANDOM()"
  ).all(modalidade);

  if (inscritos.length < 2)
    return res.status(400).json({ erro: "São necessários ao menos 2 inscritos para gerar o chaveamento." });

  // Elimina chaves antigas desta modalidade
  db.prepare("DELETE FROM chaves WHERE modalidade = ?").run(modalidade);

  // Determina a fase inicial com base no número de inscritos
  const n = inscritos.length;
  let fase = "final";
  if (n > 2)  fase = "semifinal";
  if (n > 4)  fase = "quartas";
  if (n > 8)  fase = "oitavas";
  if (n > 16) fase = "dezesseis";

  const insert = db.prepare(`
    INSERT INTO chaves (modalidade, fase, posicao, jogador1_id, jogador2_id, status, criado_em)
    VALUES (?, ?, ?, ?, ?, 'aguardando', datetime('now'))
  `);

  // Preenche confrontos em pares; jogador sem adversário recebe "bye"
  db.transaction(function () {
    for (let i = 0; i < inscritos.length; i += 2) {
      const j1 = inscritos[i];
      const j2 = inscritos[i + 1] || null;
      insert.run(modalidade, fase, Math.floor(i / 2) + 1, j1.id, j2 ? j2.id : null);
    }
  })();

  const chaves = db.prepare("SELECT * FROM chaves WHERE modalidade = ? ORDER BY posicao").all(modalidade);
  return res.status(201).json({ mensagem: "Chaveamento gerado com sucesso.", total: chaves.length, chaves });
});

// ── PUT /api/chaves/:id — atualiza placar/vencedor (protegido) ─────────────
app.put("/api/chaves/:id", autenticarAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ erro: "ID inválido." });

  const { placar1, placar2, vencedor_id, status, data_partida } = req.body;

  const chave = db.prepare("SELECT * FROM chaves WHERE id = ?").get(id);
  if (!chave) return res.status(404).json({ erro: "Partida não encontrada." });

  // Valida vencedor_id — deve ser jogador1 ou jogador2
  if (vencedor_id && vencedor_id !== chave.jogador1_id && vencedor_id !== chave.jogador2_id)
    return res.status(400).json({ erro: "Vencedor inválido — deve ser um dos jogadores da partida." });

  const statusValidos = ["aguardando", "em_andamento", "finalizado"];
  if (status && !statusValidos.includes(status))
    return res.status(400).json({ erro: "Status inválido." });

  db.prepare(`
    UPDATE chaves SET
      placar1      = COALESCE(?, placar1),
      placar2      = COALESCE(?, placar2),
      vencedor_id  = COALESCE(?, vencedor_id),
      status       = COALESCE(?, status),
      data_partida = COALESCE(?, data_partida)
    WHERE id = ?
  `).run(
    placar1 !== undefined ? placar1 : null,
    placar2 !== undefined ? placar2 : null,
    vencedor_id || null,
    status || null,
    data_partida || null,
    id
  );

  return res.json({ mensagem: "Partida atualizada com sucesso." });
});

// ── DELETE /api/chaves — remove chaveamento de uma modalidade (protegido) ──
app.delete("/api/chaves", autenticarAdmin, (req, res) => {
  const { modalidade } = req.query;
  if (!modalidade || !MODALIDADES_VALIDAS.includes(modalidade))
    return res.status(400).json({ erro: "Modalidade inválida." });
  const r = db.prepare("DELETE FROM chaves WHERE modalidade = ?").run(modalidade);
  return res.json({ mensagem: "Chaveamento removido.", total: r.changes });
});

// ── GET /api/status — busca inscrição pública (matrícula ou e-mail) ────────
const limiterStatus = rateLimit({
  windowMs: 5 * 60 * 1000, max: 20,
  message: { erro: "Muitas consultas. Aguarde alguns minutos." },
});
app.get("/api/status", limiterStatus, (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 3)
    return res.status(400).json({ erro: "Informe sua matrícula ou e-mail para buscar." });

  const termo = q.trim().toLowerCase();

  // Busca por matrícula (exact) ou e-mail (exact)
  const row = db.prepare(`
    SELECT i.id, i.nome, i.modalidade, i.campo_extra_label, i.campo_extra_valor, i.data_inscricao,
      c.fase, c.posicao, c.placar1, c.placar2, c.status AS partida_status, c.data_partida,
      i1.nome AS adversario,
      iv.nome AS vencedor
    FROM inscricoes i
    LEFT JOIN chaves c ON (c.jogador1_id = i.id OR c.jogador2_id = i.id)
      AND c.id = (
        SELECT id FROM chaves
        WHERE (jogador1_id = i.id OR jogador2_id = i.id)
        ORDER BY id DESC LIMIT 1
      )
    LEFT JOIN inscricoes i1 ON (
      CASE WHEN c.jogador1_id = i.id THEN c.jogador2_id ELSE c.jogador1_id END = i1.id
    )
    LEFT JOIN inscricoes iv ON c.vencedor_id = iv.id
    WHERE LOWER(i.matricula) = ? OR LOWER(i.email) = ?
    LIMIT 1
  `).get(termo, termo);

  if (!row) return res.status(404).json({ erro: "Nenhuma inscrição encontrada com esses dados." });

  // Nunca retorna dados sensíveis (sem cpf_hash, cpf_sufixo, email)
  const { data_inscricao, ...resto } = row;
  return res.json({
    ...resto,
    data_inscricao: new Date(data_inscricao).toLocaleDateString("pt-BR"),
    inscrito: true,
  });
});

// ── Painel admin ───────────────────────────────────────────────────────────
app.get("/" + ADMIN_ROUTE, (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// ── 404 para rotas de API desconhecidas ────────────────────────────────────
app.use("/api", (req, res) => {
  res.status(404).json({ erro: "Rota não encontrada." });
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ Servidor rodando na porta ${PORT}`);
  console.log(`📋 Admin: https://e-jeniff.onrender.com/${ADMIN_ROUTE}`);
  console.log(`🎮 Site:  https://e-jeniff.onrender.com/`);
  console.log(`🔐 Auth:  scrypt + HMAC-SHA256 (CPF protegido)\n`);
});
