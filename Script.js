// -------------------------------------------------------
// Elementos principais
// -------------------------------------------------------
const modalidadeSelect = document.getElementById("modalidade");
const campoExtra       = document.getElementById("campo-extra");
const contrasteBtn     = document.getElementById("contrasteBtn");
const form             = document.getElementById("formInscricao");
const menuToggle       = document.getElementById("menuToggle");
const navLinks         = document.getElementById("navLinks");
const cpfInput         = document.getElementById("cpf");

// -------------------------------------------------------
// 1. Contador de inscrições por modalidade nos cards
// -------------------------------------------------------
async function carregarContadores() {
  try {
    const res   = await fetch("/api/estatisticas");
    if (!res.ok) return;
    const dados = await res.json();

    // Zera todos primeiro
    document.querySelectorAll(".game-inscritos").forEach(function (el) {
      el.textContent = "0 inscritos";
    });

    dados.porModalidade.forEach(function (m) {
      const el = document.getElementById("inscritos-" + m.modalidade);
      if (el) {
        el.textContent = m.total + (m.total === 1 ? " inscrito" : " inscritos");
      }
    });
  } catch {
    // Servidor offline — ignora silenciosamente
  }
}

carregarContadores();

// -------------------------------------------------------
// 3. Scroll spy — destaca link ativo no menu
// -------------------------------------------------------
const secoes = document.querySelectorAll("section[id]");
const linksMenu = document.querySelectorAll(".nav-links a[href^='#']");

const observerMenu = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      linksMenu.forEach(function (link) {
        link.classList.remove("ativo");
        if (link.getAttribute("href") === "#" + entry.target.id) {
          link.classList.add("ativo");
        }
      });
    }
  });
}, { rootMargin: "-40% 0px -55% 0px" });

secoes.forEach(function (s) { observerMenu.observe(s); });

// -------------------------------------------------------
// 4. Animação de entrada suave nas seções
// -------------------------------------------------------
const observerFade = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add("visivel");
      observerFade.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll(".section, .dark-card").forEach(function (el) {
  observerFade.observe(el);
});

// -------------------------------------------------------
// 5. Clicar no card de modalidade preenche o select e
//    rola até o formulário
// -------------------------------------------------------
document.querySelectorAll(".game[data-modalidade]").forEach(function (card) {
  function ativarCard() {
    const valor = card.getAttribute("data-modalidade");

    // Destaca o card selecionado
    document.querySelectorAll(".game").forEach(function (c) {
      c.classList.remove("selecionado");
    });
    card.classList.add("selecionado");

    // Preenche o select
    modalidadeSelect.value = valor;
    modalidadeSelect.dispatchEvent(new Event("change"));

    // Rola suavemente até o formulário
    document.getElementById("inscricao").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  card.addEventListener("click", ativarCard);
  card.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ativarCard();
    }
  });
});

// Sincroniza o card destacado quando o select muda manualmente
modalidadeSelect.addEventListener("change", function () {
  const valor = modalidadeSelect.value;
  document.querySelectorAll(".game").forEach(function (c) {
    if (c.getAttribute("data-modalidade") === valor) {
      c.classList.add("selecionado");
    } else {
      c.classList.remove("selecionado");
    }
  });
});

// -------------------------------------------------------
// Menu hamburguer (mobile)
// -------------------------------------------------------
menuToggle.addEventListener("click", function () {
  const aberto = navLinks.classList.toggle("aberto");
  menuToggle.setAttribute("aria-expanded", aberto);
  menuToggle.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
});

navLinks.querySelectorAll("a").forEach(function (link) {
  link.addEventListener("click", function () {
    navLinks.classList.remove("aberto");
    menuToggle.setAttribute("aria-expanded", "false");
  });
});

// -------------------------------------------------------
// Máscara de CPF
// -------------------------------------------------------
cpfInput.addEventListener("input", function () {
  let v = cpfInput.value.replace(/\D/g, "").slice(0, 11);
  if (v.length > 9) {
    v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4");
  } else if (v.length > 6) {
    v = v.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
  } else if (v.length > 3) {
    v = v.replace(/(\d{3})(\d{0,3})/, "$1.$2");
  }
  cpfInput.value = v;
});

// -------------------------------------------------------
// Campo extra dinâmico por modalidade
// -------------------------------------------------------
modalidadeSelect.addEventListener("change", function () {
  const jogo = modalidadeSelect.value;
  campoExtra.innerHTML = "";

  const campos = {
    lol:      { label: "Rota principal",   opcoes: ["Topo", "Selva", "Meio", "ADC", "Suporte"] },
    valorant: { label: "Função principal", opcoes: ["Duelista", "Controlador", "Iniciador", "Sentinela"] },
    cs2:      { label: "Função no time",   opcoes: ["IGL", "AWPer", "Entry Fragger", "Support", "Lurker"] },
    freefire: { label: "Função no squad",  opcoes: ["Rushador", "Suporte", "Atirador", "Capitão"] },
    xadrez:   null,
  };

  if (!campos[jogo] && jogo !== "xadrez") return;

  if (jogo === "xadrez") {
    campoExtra.innerHTML = `
      <label for="campoExtraValor">
        Rating aproximado
        <input id="campoExtraValor" type="text" name="campoExtraValor"
               placeholder="Ex: 1200, 1500, iniciante" required />
      </label>
    `;
    return;
  }

  const { label, opcoes } = campos[jogo];
  const opcoesHtml = opcoes.map(function (o) {
    return `<option value="${o}">${o}</option>`;
  }).join("");

  campoExtra.innerHTML = `
    <label for="campoExtraValor">
      ${label}
      <select id="campoExtraValor" name="campoExtraValor" required>
        <option value="">Selecione</option>
        ${opcoesHtml}
      </select>
    </label>
  `;

  if (jogo === "freefire") {
    campoExtra.innerHTML += `
      <label for="campoExtraValor2">
        Patente aproximada
        <input id="campoExtraValor2" type="text" name="campoExtraValor2"
               placeholder="Ex: Diamante, Mestre, Desafiante" required />
      </label>
    `;
  }
});

// -------------------------------------------------------
// Validação de CPF
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

// -------------------------------------------------------
// Envio do formulário
// -------------------------------------------------------
form.addEventListener("submit", async function (e) {
  e.preventDefault();

  const nome      = document.getElementById("nome").value.trim();
  const matricula = document.getElementById("matricula").value.trim();
  const cpf       = document.getElementById("cpf").value.trim();
  const email     = document.getElementById("email").value.trim();
  const jogo      = modalidadeSelect.value;

  if (!nome || !matricula || !cpf || !email || !jogo) {
    mostrarMensagem("❌ Preencha todos os campos obrigatórios.", "erro");
    return;
  }

  if (!cpfValido(cpf)) {
    mostrarMensagem("❌ CPF inválido. Verifique o número digitado.", "erro");
    return;
  }

  const valorExtraEl  = campoExtra.querySelector("[name='campoExtraValor']");
  const valorExtra2El = campoExtra.querySelector("[name='campoExtraValor2']");
  const labelExtra    = campoExtra.querySelector("label");

  let campoExtraLabel = null;
  let campoExtraValor = null;

  if (labelExtra && valorExtraEl) {
    campoExtraLabel = labelExtra.childNodes[0].textContent.trim();
    campoExtraValor = valorExtraEl.value;

    if (!campoExtraValor) {
      mostrarMensagem("❌ Preencha o campo de função/posição.", "erro");
      return;
    }

    if (valorExtra2El) {
      if (!valorExtra2El.value.trim()) {
        mostrarMensagem("❌ Preencha a patente aproximada.", "erro");
        return;
      }
      campoExtraValor += " | Patente: " + valorExtra2El.value.trim();
    }
  }

  const payload = { nome, matricula, cpf, email, modalidade: jogo, campoExtraLabel, campoExtraValor };

  const btnEnviar = form.querySelector('button[type="submit"]');
  btnEnviar.disabled = true;
  btnEnviar.textContent = "Enviando...";

  try {
    const res   = await fetch("/api/inscricoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const dados = await res.json();

    if (res.ok) {
      // Envia e-mail de confirmação via EmailJS direto para o aluno
      const nomeModalidadeEmail = nomesModalidade[jogo] || jogo;
      const campoExtraTexto = campoExtraLabel && campoExtraValor
        ? campoExtraLabel + ": " + campoExtraValor
        : "—";

      emailjs.send("service_fhnacmg", "template_5v9ppbu", {
        to_email:          email,
        nome:              nome,
        matricula:         matricula,
        cpf:               cpf,
        modalidade:        nomeModalidadeEmail,
        campo_extra_label: campoExtraLabel || "—",
        campo_extra_valor: campoExtraValor  || "—",
        data:              new Date().toLocaleString("pt-BR"),
      }).catch(function (err) {
        console.warn("Aviso: e-mail não enviado —", err);
      });

      // Confirmação visual + reset
      mostrarConfirmacao(email, jogo);
      form.reset();
      campoExtra.innerHTML = "";
      document.querySelectorAll(".game").forEach(function (c) { c.classList.remove("selecionado"); });
      carregarContadores();
    } else {
      mostrarMensagem("❌ " + dados.erro, "erro");
    }
  } catch {
    mostrarMensagem("❌ Não foi possível conectar ao servidor. Verifique se ele está rodando.", "erro");
  } finally {
    btnEnviar.disabled = false;
    btnEnviar.textContent = "Enviar inscrição";
  }
});

// -------------------------------------------------------
// 6. Confirmação visual com e-mail
// -------------------------------------------------------
const nomesModalidade = {
  lol: "League of Legends", valorant: "Valorant", cs2: "Counter-Strike 2",
  freefire: "Free Fire", xadrez: "Xadrez Arena",
};

function mostrarConfirmacao(email, modalidade) {
  const div   = document.getElementById("confirmacao-inscricao");
  const texto = document.getElementById("confirmacao-texto");

  texto.textContent = `Sua inscrição em ${nomesModalidade[modalidade] || modalidade} foi registrada. Uma confirmação foi enviada para ${email}.`;
  div.hidden = false;
  div.scrollIntoView({ behavior: "smooth", block: "nearest" });

  setTimeout(function () { div.hidden = true; }, 10000);
}

// -------------------------------------------------------
// Feedback de erro no formulário
// -------------------------------------------------------
function mostrarMensagem(texto, tipo) {
  const anterior = form.querySelector(".msg-feedback");
  if (anterior) anterior.remove();

  const msg = document.createElement("div");
  msg.className = "msg-feedback";
  msg.setAttribute("role", "alert");
  msg.textContent = texto;
  msg.style.cssText = `
    padding: 14px 18px; border-radius: 8px; font-weight: bold; font-size: 0.95rem;
    background: ${tipo === "sucesso" ? "#00a85920" : "#ff4d4d20"};
    color: ${tipo === "sucesso" ? "#00ff88" : "#ff4d4d"};
    border: 1px solid ${tipo === "sucesso" ? "#00a859" : "#ff4d4d"};
  `;

  form.appendChild(msg);
  msg.scrollIntoView({ behavior: "smooth", block: "nearest" });
  setTimeout(function () { msg.remove(); }, 6000);
}

// -------------------------------------------------------
// Alto contraste — persiste via localStorage
// -------------------------------------------------------
if (localStorage.getItem("contraste") === "ativo") {
  document.body.classList.add("contraste");
}

contrasteBtn.addEventListener("click", function () {
  const ativo = document.body.classList.toggle("contraste");
  localStorage.setItem("contraste", ativo ? "ativo" : "");
});
