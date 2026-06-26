/**
 * Cria uma inscrição de teste no banco para testar a Minha Área.
 * Uso: node criar-teste.js
 * Remove depois: node criar-teste.js --remover
 */

require("dotenv").config();
const Database = require("better-sqlite3");
const crypto   = require("crypto");
const path     = require("path");

const db = new Database(path.join(__dirname, "inscricoes.db"));

const MATRICULA = "TESTE2026";
const CPF_HMAC  = process.env.CPF_HMAC_SECRET;

if (!CPF_HMAC) {
  console.error("❌ CPF_HMAC_SECRET não definido no .env");
  process.exit(1);
}

function hashCpf(digits) {
  return crypto.createHmac("sha256", CPF_HMAC).update(digits).digest("hex");
}

if (process.argv.includes("--remover")) {
  const r = db.prepare("DELETE FROM inscricoes WHERE matricula = ?").run(MATRICULA);
  console.log(r.changes > 0
    ? "🗑  Inscrição de teste removida."
    : "⚠️  Nenhuma inscrição encontrada com essa matrícula.");
  process.exit(0);
}

// Verifica se já existe
const existe = db.prepare("SELECT id FROM inscricoes WHERE matricula = ?").get(MATRICULA);
if (existe) {
  console.log("ℹ️  Inscrição de teste já existe (matrícula: " + MATRICULA + ")");
  process.exit(0);
}

const cpfFake   = "00000000000"; // CPF inválido intencional (só para teste)
const cpfHash   = hashCpf(cpfFake);
const cpfSufixo = cpfFake.slice(9);

const cols = db.pragma("table_info(inscricoes)").map(c => c.name);
const temCpfHash = cols.includes("cpf_hash");

if (temCpfHash) {
  db.prepare(`
    INSERT INTO inscricoes
      (nome, matricula, cpf_hash, cpf_sufixo, email, modalidade,
       campo_extra_label, campo_extra_valor, data_inscricao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "Aluno Teste", MATRICULA, cpfHash, cpfSufixo,
    "teste@gsuite.iff.edu.br", "cs2",
    "Função no time", "Entry Fragger", new Date().toISOString()
  );
} else {
  // schema antigo com coluna cpf em claro
  db.prepare(`
    INSERT INTO inscricoes
      (nome, matricula, cpf, email, modalidade,
       campo_extra_label, campo_extra_valor, data_inscricao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "Aluno Teste", MATRICULA, "000.000.000-00",
    "teste@gsuite.iff.edu.br", "cs2",
    "Função no time", "Entry Fragger", new Date().toISOString()
  );
}

console.log("✅ Inscrição de teste criada!");
console.log("   Matrícula : " + MATRICULA);
console.log("   Modalidade: Counter-Strike 2");
console.log("   Nome      : Aluno Teste");
console.log("\nPara remover depois: node criar-teste.js --remover\n");
