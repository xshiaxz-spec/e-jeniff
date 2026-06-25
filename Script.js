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

// Ativa skeleton nos badges de inscritos antes de carregar
function mostrarSkeletonContadores() {
  document.querySelectorAll(".game-inscritos").forEach(function (el) {
    el.innerHTML = '<span class="skeleton-badge"></span>';
    el.classList.add("skeleton-loading");
  });
  const statTotal = document.getElementById("stat-total");
  if (statTotal) {
    statTotal.innerHTML = '<span class="skeleton-stat"></span>';
    statTotal.classList.add("skeleton-loading");
  }
}

async function carregarContadores() {
  mostrarSkeletonContadores();
  try {
    const res   = await fetch("https://e-jeniff.onrender.com/api/estatisticas");
    if (!res.ok) {
      // servidor offline — limpa skeleton com fallback
      document.querySelectorAll(".game-inscritos").forEach(function (el) {
        el.classList.remove("skeleton-loading");
        el.textContent = "— inscritos";
      });
      const statTotal = document.getElementById("stat-total");
      if (statTotal) { statTotal.classList.remove("skeleton-loading"); statTotal.textContent = "—"; }
      return;
    }
    const dados = await res.json();

    // Zera todos primeiro
    document.querySelectorAll(".game-inscritos").forEach(function (el) {
      el.classList.remove("skeleton-loading");
      el.textContent = "0 inscritos";
    });

    let total = 0;
    dados.porModalidade.forEach(function (m) {
      total += m.total;
      const el = document.getElementById("inscritos-" + m.modalidade);
      if (el) {
        el.classList.remove("skeleton-loading");
        el.textContent = m.total + (m.total === 1 ? " inscrito" : " inscritos");
      }
    });

    // Atualiza stat total no hero
    const statTotal = document.getElementById("stat-total");
    if (statTotal) {
      statTotal.classList.remove("skeleton-loading");
      statTotal.textContent = total > 0 ? total : "0";
    }

  } catch {
    // Servidor offline — remove skeleton silenciosamente
    document.querySelectorAll(".game-inscritos").forEach(function (el) {
      el.classList.remove("skeleton-loading");
      el.textContent = "— inscritos";
    });
    const statTotal = document.getElementById("stat-total");
    if (statTotal) { statTotal.classList.remove("skeleton-loading"); statTotal.textContent = "—"; }
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

document.querySelectorAll(".fade-up").forEach(function (el) {
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
// Tooltips de ajuda por modalidade
// -------------------------------------------------------
const tooltipsAjuda = {
  lol: {
    titulo: "Rotas no LoL",
    itens: [
      { nome: "Topo",    desc: "Jogador da rota superior, geralmente tanques ou lutadores." },
      { nome: "Selva",   desc: "Controla o mapa, faz objetivos e dá suporte às rotas (jungler)." },
      { nome: "Meio",    desc: "Rota central, mages ou assassinos que dominam o meio do mapa." },
      { nome: "ADC",     desc: "Atirador da rota inferior, faz dano físico a distância no late game." },
      { nome: "Suporte", desc: "Acompanha o ADC, protege aliados e controla visão do mapa." },
    ],
  },
  valorant: {
    titulo: "Agentes no Valorant",
    itens: [
      { nome: "Duelista",    desc: "Entra primeiro e cria espaço — ex: Jett, Reyna, Neon." },
      { nome: "Controlador", desc: "Fecha visão com smokes e controla o mapa — ex: Brimstone, Omen." },
      { nome: "Iniciador",   desc: "Abre jogadas e reúne informação — ex: Sova, Breach, Fade." },
      { nome: "Sentinela",   desc: "Defende flancos e âncora a equipe — ex: Sage, Killjoy, Cypher." },
    ],
  },
  cs2: {
    titulo: "Funções no CS2",
    itens: [
      { nome: "IGL",          desc: "In-Game Leader — lidera estratégias e calls durante a partida." },
      { nome: "AWPer",        desc: "Especialista na sniper AWP, responsável por picks e controle de distância." },
      { nome: "Entry Fragger",desc: "Entra primeiro no site para abrir o round para a equipe." },
      { nome: "Support",      desc: "Usa granadas e utilitários para apoiar entradas e plays." },
      { nome: "Lurker",       desc: "Age separado do time, flanqueia e pressiona o adversário." },
    ],
  },
  freefire: {
    titulo: "Funções no Free Fire",
    itens: [
      { nome: "Rushador", desc: "Avança e pressiona inimigos em combate próximo." },
      { nome: "Suporte",  desc: "Cura aliados e fornece cobertura durante a partida." },
      { nome: "Atirador", desc: "Faz dano a longa distância com rifles e snipers." },
      { nome: "Capitão",  desc: "Lidera o squad, define rotações e decisões táticas." },
    ],
  },
};

// -------------------------------------------------------
// Abre/fecha tooltip ao clicar no botão "?"
// -------------------------------------------------------
function configurarTooltip(btn) {
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    btn.classList.toggle("ativo");
    var tooltip = btn.querySelector(".help-tooltip");
    if (tooltip) {
      tooltip.style.display = btn.classList.contains("ativo") ? "block" : "none";
    }
  });
}

document.addEventListener("click", function () {
  document.querySelectorAll(".help-btn.ativo").forEach(function (btn) {
    btn.classList.remove("ativo");
    var tooltip = btn.querySelector(".help-tooltip");
    if (tooltip) tooltip.style.display = "none";
  });
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

  // Monta os itens do tooltip para este jogo
  const infoJogo = tooltipsAjuda[jogo];
  const tooltipItensHtml = infoJogo
    ? infoJogo.itens.map(function (item) {
        return `<div class="help-tooltip-item">
          <strong>${item.nome}</strong>
          <span>${item.desc}</span>
        </div>`;
      }).join("")
    : "";

  const tooltipHtml = infoJogo
    ? `<button type="button" class="help-btn" aria-label="O que é cada opção?" tabindex="0">
        ?
        <div class="help-tooltip" role="tooltip">
          <div class="help-tooltip-title">${infoJogo.titulo}</div>
          ${tooltipItensHtml}
        </div>
      </button>`
    : "";

  campoExtra.innerHTML = `
    <label for="campoExtraValor">
      <span class="label-with-help">
        ${label}
        ${tooltipHtml}
      </span>
      <select id="campoExtraValor" name="campoExtraValor" required>
        <option value="">Selecione</option>
        ${opcoesHtml}
      </select>
    </label>
  `;

  // Ativa o comportamento de toggle no botão recém-criado
  var btn = campoExtra.querySelector(".help-btn");
  if (btn) configurarTooltip(btn);

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
    const res   = await fetch("https://e-jeniff.onrender.com/api/inscricoes", {
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

  // Dispara o confete
  dispararConfete();

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

// -------------------------------------------------------
// Avatares da equipe — iniciais + gradiente por hue
// -------------------------------------------------------
document.querySelectorAll(".member-avatar").forEach(function (el) {
  var initials = el.getAttribute("data-initials") || "?";
  var hue      = parseInt(el.getAttribute("data-hue") || "158", 10);

  el.textContent = initials;
  el.style.background =
    "linear-gradient(135deg, hsl(" + hue + ", 65%, 28%), hsl(" + hue + ", 85%, 44%))";
});

// -------------------------------------------------------
// Partículas animadas no hero
// -------------------------------------------------------
(function () {
  var canvas = document.getElementById("hero-particles");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  var particles = [];
  var NUM = 55;
  var mouse = { x: -9999, y: -9999 };

  function resize() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  window.addEventListener("resize", resize);
  resize();

  // Cria partículas com posições e velocidades aleatórias
  for (var i = 0; i < NUM; i++) {
    particles.push({
      x:     Math.random() * canvas.width,
      y:     Math.random() * canvas.height,
      r:     Math.random() * 1.6 + 0.4,
      vx:    (Math.random() - 0.5) * 0.35,
      vy:    (Math.random() - 0.5) * 0.35,
      alpha: Math.random() * 0.45 + 0.1,
    });
  }

  // Rastreia posição do mouse para efeito de repulsão suave
  canvas.closest(".hero").addEventListener("mousemove", function (e) {
    var rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  canvas.closest(".hero").addEventListener("mouseleave", function () {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  function distancia(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Desenha linhas entre partículas próximas
    for (var i = 0; i < particles.length; i++) {
      for (var j = i + 1; j < particles.length; j++) {
        var d = distancia(particles[i], particles[j]);
        if (d < 110) {
          ctx.beginPath();
          ctx.strokeStyle = "rgba(0, 230, 118, " + (0.07 * (1 - d / 110)) + ")";
          ctx.lineWidth = 0.6;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Desenha e move cada partícula
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];

      // Repulsão suave do mouse
      var dm = distancia(p, mouse);
      if (dm < 90) {
        var force = (90 - dm) / 90;
        p.vx += ((p.x - mouse.x) / dm) * force * 0.06;
        p.vy += ((p.y - mouse.y) / dm) * force * 0.06;
      }

      // Limite de velocidade
      var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > 1.2) { p.vx *= 1.2 / speed; p.vy *= 1.2 / speed; }

      p.x += p.vx;
      p.y += p.vy;

      // Rebate nas bordas
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      // Desenha o ponto
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 230, 118, " + p.alpha + ")";
      ctx.fill();
    }

    requestAnimationFrame(loop);
  }

  loop();
})();

// -------------------------------------------------------
// Validação em tempo real nos campos do formulário
// -------------------------------------------------------
function setStatus(statusId, inputEl, estado, msg) {
  var statusEl = document.getElementById(statusId);
  if (!statusEl) return;

  statusEl.textContent = msg;
  statusEl.className   = "input-status show " + estado;
  inputEl.classList.remove("valid", "invalid");
  inputEl.classList.add(estado === "ok" ? "valid" : "invalid");
}

function clearStatus(statusId, inputEl) {
  var statusEl = document.getElementById(statusId);
  if (statusEl) { statusEl.className = "input-status"; statusEl.textContent = ""; }
  inputEl.classList.remove("valid", "invalid");
}

// Nome — mínimo 3 chars e pelo menos duas palavras
document.getElementById("nome").addEventListener("input", function () {
  var v = this.value.trim();
  if (!v) { clearStatus("status-nome", this); return; }
  var ok = v.length >= 3 && v.split(" ").filter(function (w) { return w.length > 0; }).length >= 2;
  setStatus("status-nome", this, ok ? "ok" : "error", ok ? "✓" : "✗");
});

// Matrícula — ao menos 4 caracteres
document.getElementById("matricula").addEventListener("input", function () {
  var v = this.value.trim();
  if (!v) { clearStatus("status-matricula", this); return; }
  var ok = v.length >= 4;
  setStatus("status-matricula", this, ok ? "ok" : "error", ok ? "✓" : "✗");
});

// CPF — validação completa ao terminar de digitar
document.getElementById("cpf").addEventListener("input", function () {
  var v = this.value.trim();
  if (!v) { clearStatus("status-cpf", this); return; }
  // Só valida quando tiver os 14 chars (000.000.000-00)
  if (v.length < 14) { clearStatus("status-cpf", this); return; }
  var ok = cpfValido(v);
  setStatus("status-cpf", this, ok ? "ok" : "error", ok ? "✓" : "✗");
});

// E-mail — regex simples
document.getElementById("email").addEventListener("input", function () {
  var v = this.value.trim();
  if (!v) { clearStatus("status-email", this); return; }
  var ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 200;
  setStatus("status-email", this, ok ? "ok" : "error", ok ? "✓" : "✗");
});

// -------------------------------------------------------
// Barra de progresso de scroll
// -------------------------------------------------------
(function () {
  var bar = document.getElementById("scroll-progress");
  if (!bar) return;
  window.addEventListener("scroll", function () {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width = pct + "%";
  }, { passive: true });
})();

// -------------------------------------------------------
// Scroll to top
// -------------------------------------------------------
(function () {
  var btn = document.getElementById("scroll-top");
  if (!btn) return;

  window.addEventListener("scroll", function () {
    if (window.scrollY > 400) {
      btn.classList.add("visivel");
    } else {
      btn.classList.remove("visivel");
    }
  }, { passive: true });

  btn.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
})();


// -------------------------------------------------------
// Confete ao enviar inscrição
// -------------------------------------------------------
function dispararConfete() {
  var canvas = document.getElementById("confetti-canvas");
  if (!canvas) return;

  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.classList.add("ativo");

  var ctx = canvas.getContext("2d");
  var pieces = [];
  var COLORS = ["#00e676","#00a855","#4a90d9","#fbbf24","#f87171","#a78bfa","#fff"];
  var COUNT  = 130;

  for (var i = 0; i < COUNT; i++) {
    pieces.push({
      x:      Math.random() * canvas.width,
      y:      Math.random() * canvas.height - canvas.height,
      w:      Math.random() * 10 + 5,
      h:      Math.random() * 5  + 3,
      color:  COLORS[Math.floor(Math.random() * COLORS.length)],
      rot:    Math.random() * Math.PI * 2,
      vx:     (Math.random() - 0.5) * 3,
      vy:     Math.random() * 4 + 2,
      vrot:   (Math.random() - 0.5) * 0.15,
      alpha:  1,
    });
  }

  var start = null;
  var DURACAO = 3200;

  function desenhar(ts) {
    if (!start) start = ts;
    var elapsed = ts - start;
    var progresso = elapsed / DURACAO;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    pieces.forEach(function (p) {
      p.x   += p.vx;
      p.y   += p.vy;
      p.rot += p.vrot;
      // Fade out na segunda metade
      p.alpha = progresso < 0.6 ? 1 : 1 - ((progresso - 0.6) / 0.4);

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (elapsed < DURACAO) {
      requestAnimationFrame(desenhar);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.classList.remove("ativo");
    }
  }

  requestAnimationFrame(desenhar);
}

// -------------------------------------------------------
// Tema de cor por modalidade na seção de inscrição
// -------------------------------------------------------
(function () {
  var secao = document.getElementById("inscricao");
  if (!secao) return;

  // Aplica tema quando um card de modalidade é selecionado
  document.querySelectorAll(".game[data-modalidade]").forEach(function (card) {
    card.addEventListener("click", function () {
      var mod = card.getAttribute("data-modalidade");
      secao.setAttribute("data-theme", mod || "default");
    });
  });

  // Sincroniza com o select manual também
  var sel = document.getElementById("modalidade");
  if (sel) {
    sel.addEventListener("change", function () {
      secao.setAttribute("data-theme", sel.value || "default");
    });
  }
})();
