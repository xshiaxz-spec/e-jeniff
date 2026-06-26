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
  )
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
  // desenvolvimento local (Live Server)
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
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

// ── Tabelas extras (jogos) ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS jogos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo      TEXT NOT NULL,
    modalidade  TEXT NOT NULL,
    fase        TEXT NOT NULL DEFAULT 'Fase de Grupos',
    data_hora   TEXT,
    local       TEXT,
    status      TEXT NOT NULL DEFAULT 'agendado',
    observacoes TEXT,
    criado_em   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jogos_participantes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    jogo_id      INTEGER NOT NULL REFERENCES jogos(id) ON DELETE CASCADE,
    inscricao_id INTEGER NOT NULL REFERENCES inscricoes(id) ON DELETE CASCADE,
    resultado    TEXT,
    UNIQUE(jogo_id, inscricao_id)
  );
`);

// ── Arquivos estáticos ─────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "..")));

// ── Sessões admin (em memória, 2h) ─────────────────────────────────────────
const sessoes = new Map();

// ── Sessões aluno (em memória, 4h) ─────────────────────────────────────────
const sessoesAluno = new Map();

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

function autenticarAluno(req, res, next) {
  const token = req.headers["x-aluno-token"];
  if (!token) return res.status(401).json({ erro: "Acesso não autorizado. Faça login." });
  const sessao = sessoesAluno.get(token);
  if (!sessao) return res.status(401).json({ erro: "Sessão inválida ou expirada." });
  if (Date.now() > sessao.expira) {
    sessoesAluno.delete(token);
    return res.status(401).json({ erro: "Sessão expirada. Faça login novamente." });
  }
  req.alunoMatricula = sessao.matricula;
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

// ── Painel admin ───────────────────────────────────────────────────────────
app.get("/" + ADMIN_ROUTE, (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

// ══════════════════════════════════════════════════════════════════════════
// ÁREA DO ALUNO
// ══════════════════════════════════════════════════════════════════════════

// Hash de matrícula para token de sessão (HMAC — nunca armazena em claro)
const MAT_HMAC_SECRET = process.env.MAT_HMAC_SECRET || CPF_HMAC_SECRET;
function hashMatricula(mat) {
  return crypto.createHmac("sha256", MAT_HMAC_SECRET).update(mat.trim().toLowerCase()).digest("hex");
}

// Rate limit para login de aluno
app.use("/api/aluno/login", rateLimit({ windowMs: 15*60*1000, max: 10,
  message: { erro: "Muitas tentativas. Tente novamente em 15 minutos." } }));

// POST /api/aluno/login — autentica apenas pela matrícula
app.post("/api/aluno/login", (req, res) => {
  const { matricula } = req.body;
  if (!matricula || typeof matricula !== "string" || matricula.trim().length < 3)
    return res.status(400).json({ erro: "Matrícula inválida." });

  const mat = matricula.trim();
  const row = db.prepare(
    "SELECT id, nome, matricula, modalidade, campo_extra_label, campo_extra_valor, data_inscricao " +
    "FROM inscricoes WHERE LOWER(matricula) = LOWER(?) LIMIT 1"
  ).get(mat);

  if (!row)
    return res.status(401).json({ erro: "Matrícula não encontrada. Verifique se está inscrito." });

  const token = gerarToken();
  sessoesAluno.set(token, { matricula: mat, expira: Date.now() + 4 * 60 * 60 * 1000 });
  return res.json({ token, nome: row.nome.split(" ")[0] });
});

// POST /api/aluno/logout
app.post("/api/aluno/logout", (req, res) => {
  const token = req.headers["x-aluno-token"];
  if (token) sessoesAluno.delete(token);
  return res.json({ mensagem: "Logout realizado." });
});

// GET /api/aluno/perfil — dados do aluno autenticado + jogos
app.get("/api/aluno/perfil", autenticarAluno, (req, res) => {
  const mat = req.alunoMatricula;

  // Todas as inscrições do aluno
  const inscricoes = db.prepare(
    "SELECT id, nome, modalidade, campo_extra_label, campo_extra_valor, data_inscricao " +
    "FROM inscricoes WHERE LOWER(matricula) = LOWER(?)"
  ).all(mat);

  if (inscricoes.length === 0)
    return res.status(404).json({ erro: "Nenhuma inscrição encontrada para essa matrícula." });

  const nomeAluno = inscricoes[0].nome;

  // Jogos vinculados a qualquer inscrição do aluno
  const ids = inscricoes.map(function(i){ return i.id; });
  const placeholders = ids.map(function(){ return "?"; }).join(",");

  const jogos = ids.length > 0
    ? db.prepare(
        "SELECT j.id, j.titulo, j.modalidade, j.fase, j.data_hora, j.local, " +
        "j.status, j.observacoes, jp.resultado " +
        "FROM jogos j " +
        "JOIN jogos_participantes jp ON jp.jogo_id = j.id " +
        "WHERE jp.inscricao_id IN (" + placeholders + ") " +
        "ORDER BY j.data_hora ASC"
      ).all(...ids)
    : [];

  return res.json({
    nome: nomeAluno,
    matricula: mat,
    inscricoes: inscricoes.map(function(i) {
      return {
        id: i.id,
        modalidade: i.modalidade,
        funcao: i.campo_extra_label && i.campo_extra_valor
          ? i.campo_extra_label + ": " + i.campo_extra_valor
          : null,
        data_inscricao: i.data_inscricao,
      };
    }),
    jogos: jogos,
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — GESTÃO DE JOGOS/PARTIDAS
// ══════════════════════════════════════════════════════════════════════════

// GET /api/jogos — listar jogos (protegido)
app.get("/api/jogos", autenticarAdmin, (req, res) => {
  const jogos = db.prepare(
    "SELECT j.*, GROUP_CONCAT(jp.inscricao_id) as participante_ids " +
    "FROM jogos j " +
    "LEFT JOIN jogos_participantes jp ON jp.jogo_id = j.id " +
    "GROUP BY j.id ORDER BY j.data_hora ASC"
  ).all();
  return res.json(jogos);
});

// POST /api/jogos — criar jogo (protegido)
app.post("/api/jogos", autenticarAdmin, (req, res) => {
  const { titulo, modalidade, fase, data_hora, local, status, observacoes, participantes } = req.body;
  if (!titulo || !modalidade)
    return res.status(400).json({ erro: "Título e modalidade são obrigatórios." });
  if (!MODALIDADES_VALIDAS.includes(modalidade))
    return res.status(400).json({ erro: "Modalidade inválida." });

  const result = db.prepare(
    "INSERT INTO jogos (titulo, modalidade, fase, data_hora, local, status, observacoes, criado_em) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    sanitizar(titulo).slice(0, 200),
    modalidade,
    sanitizar(fase || "Fase de Grupos").slice(0, 100),
    data_hora || null,
    local ? sanitizar(local).slice(0, 200) : null,
    status || "agendado",
    observacoes ? sanitizar(observacoes).slice(0, 500) : null,
    new Date().toISOString()
  );

  const jogoId = result.lastInsertRowid;

  // Vincula participantes
  if (Array.isArray(participantes) && participantes.length > 0) {
    const ins = db.prepare("INSERT OR IGNORE INTO jogos_participantes (jogo_id, inscricao_id) VALUES (?, ?)");
    db.transaction(function() {
      for (const pid of participantes) {
        const n = parseInt(pid, 10);
        if (!isNaN(n)) ins.run(jogoId, n);
      }
    })();
  }

  return res.status(201).json({ mensagem: "Jogo criado com sucesso.", id: jogoId });
});

// PUT /api/jogos/:id — editar jogo (protegido)
app.put("/api/jogos/:id", autenticarAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ erro: "ID inválido." });

  const { titulo, modalidade, fase, data_hora, local, status, observacoes, participantes } = req.body;
  if (!titulo || !modalidade)
    return res.status(400).json({ erro: "Título e modalidade são obrigatórios." });

  const result = db.prepare(
    "UPDATE jogos SET titulo=?, modalidade=?, fase=?, data_hora=?, local=?, status=?, observacoes=? WHERE id=?"
  ).run(
    sanitizar(titulo).slice(0, 200), modalidade,
    sanitizar(fase || "Fase de Grupos").slice(0, 100),
    data_hora || null,
    local ? sanitizar(local).slice(0, 200) : null,
    status || "agendado",
    observacoes ? sanitizar(observacoes).slice(0, 500) : null,
    id
  );

  if (result.changes === 0)
    return res.status(404).json({ erro: "Jogo não encontrado." });

  // Atualiza participantes
  if (Array.isArray(participantes)) {
    db.prepare("DELETE FROM jogos_participantes WHERE jogo_id = ?").run(id);
    const ins = db.prepare("INSERT OR IGNORE INTO jogos_participantes (jogo_id, inscricao_id) VALUES (?, ?)");
    db.transaction(function() {
      for (const pid of participantes) {
        const n = parseInt(pid, 10);
        if (!isNaN(n)) ins.run(id, n);
      }
    })();
  }

  return res.json({ mensagem: "Jogo atualizado com sucesso." });
});

// PUT /api/jogos/:id/resultado — atualiza resultado de participante
app.put("/api/jogos/:id/resultado", autenticarAdmin, (req, res) => {
  const jogoId = parseInt(req.params.id, 10);
  const { inscricao_id, resultado } = req.body;
  if (isNaN(jogoId) || !inscricao_id) return res.status(400).json({ erro: "Dados inválidos." });

  db.prepare("UPDATE jogos_participantes SET resultado = ? WHERE jogo_id = ? AND inscricao_id = ?")
    .run(resultado ? sanitizar(resultado).slice(0, 100) : null, jogoId, parseInt(inscricao_id, 10));
  return res.json({ mensagem: "Resultado atualizado." });
});

// DELETE /api/jogos/:id — remover jogo (protegido)
app.delete("/api/jogos/:id", autenticarAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ erro: "ID inválido." });
  const result = db.prepare("DELETE FROM jogos WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ erro: "Jogo não encontrado." });
  return res.json({ mensagem: "Jogo removido com sucesso." });
});

// Serve a página dos inscritos
app.get("/inscritos", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "pagina dos inscritos", "index.html"));
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
