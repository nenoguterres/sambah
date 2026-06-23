(function () {
  const SIDEBAR_KEY = "sambah.sidebar.collapsed";
  const LEGACY_SIDEBAR_KEY = "sambah-shell-collapsed";

  const STORAGE_KEYS = {
    collapsed: SIDEBAR_KEY,
    openGroups: "sambah-shell-open-groups"
  };

  const modules = [
    {
      id: "central",
      label: "Central",
      shortLabel: "CTR",
      href: "/sambah-central",
      tone: "core",
      commands: [
        { label: "Visão geral", href: "/sambah-central" },
        { label: "Mesa do Xeriffe", href: "http://127.0.0.1:4173/" },
        { label: "SamBah CRM", href: "/sambah-crm" },
        { label: "SamBah Pay", href: "/sambah-pay" },
        { label: "Pérola", href: "/perola" }
      ]
    },
    {
      id: "crm",
      label: "CRM",
      shortLabel: "CRM",
      href: "/sambah-crm",
      tone: "core",
      commands: [
        { label: "Painel", href: "/sambah-crm" },
        { label: "Leads", href: "/sambah-crm#leads" },
        { label: "Oportunidades", href: "/oportunidades" },
        { label: "Clientes", href: "/sambah-crm#clientes" },
        { label: "Relatórios", href: "/admin/auditoria" },
        { label: "Atualizar CRM", action: "refresh-crm" }
      ]
    },
    {
      id: "atendimento",
      label: "Atendimento",
      shortLabel: "AT",
      href: "/atendimentos",
      tone: "core",
      commands: [
        { label: "Conversas", href: "/conversas" },
        { label: "WhatsApp", status: "preparação / integração pendente", disabled: true },
        { label: "Orçamentos", href: "/eventos" },
        { label: "Handoff humano", href: "/sambah-handoff" },
        { label: "Histórico", href: "/admin#auditLogs" }
      ]
    },
    {
      id: "pedidos",
      label: "Pedidos",
      shortLabel: "PED",
      href: "/precomandas",
      tone: "insano",
      commands: [
        { label: "Pedidos do Site", href: "/sambah-crm#pedidos" },
        { label: "Pré-comandas", href: "/sambah-crm#precomandas" },
        { label: "Operação de pedidos", href: "/sambah-crm#pedidos" },
        { label: "Cozinha", href: "/cozinha" }
      ]
    },
    {
      id: "mesa",
      label: "Mesa",
      shortLabel: "MS",
      href: "/admin#mesaBridge",
      tone: "core",
      commands: [
        { label: "Integração Mesa", href: "/admin#mesaBridge" },
        { label: "Abrir Mesa", href: "http://127.0.0.1:4173/" },
        { label: "Pedidos Site → Mesa", href: "/sambah-crm#pedidos" },
        { label: "Pré-comandas", href: "/sambah-crm#precomandas" },
        { label: "Cozinha", href: "/cozinha" },
        { label: "Status da ponte", href: "/admin#mesaBridge" }
      ]
    },
    {
      id: "perola",
      label: "Pérola",
      shortLabel: "PE",
      href: "/perola",
      tone: "core",
      commands: [
        { label: "Painel Pérola", href: "/perola" },
        { label: "Campanhas", href: "/perola#campaignsList" },
        { label: "Alerta", href: "/perola#perolaAlertPanel" },
        { label: "Giro", href: "/perola#giroBlock" },
        { label: "Radar", href: "/perola#radarInsano" },
        { label: "Auditoria", href: "/perola#auditList" }
      ]
    },
    {
      id: "pay",
      label: "Pay",
      shortLabel: "PAY",
      href: "/sambah-voice-pay",
      tone: "core",
      commands: [
        { label: "Operação", href: "/sambah-voice-pay" },
        { label: "Checkout", href: "/sambah-pay" },
        { label: "Wallet", href: "/sambah-pay" },
        { label: "Autoserve", href: "/sambah-autoserve" },
        { label: "Laboratório", href: "/sambah-voice-pay" },
        { label: "Auditoria", href: "/admin/auditoria" },
        { label: "Permissões", href: "/admin/permissoes" }
      ]
    },
    {
      id: "admin",
      label: "Admin",
      shortLabel: "ADM",
      href: "/admin",
      tone: "admin",
      commands: [
        { label: "Usuários", href: "/admin/usuarios" },
        { label: "Permissões", href: "/admin/permissoes" },
        { label: "Sessão", href: "/api/auth/me" },
        { label: "Saúde do sistema", href: "/health" },
        { label: "Logs", href: "/admin/auditoria" }
      ]
    }
  ];

  function readOpenGroups() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.openGroups) || "[]");
    } catch (error) {
      console.error("[sambah-shell] Nao foi possivel ler submenus salvos", error);
      return [];
    }
  }

  function writeOpenGroups(openGroups) {
    localStorage.setItem(STORAGE_KEYS.openGroups, JSON.stringify([...openGroups]));
  }

  function readCollapsedState() {
    const saved = localStorage.getItem(STORAGE_KEYS.collapsed);
    if (saved !== null) return saved === "true";

    const legacySaved = localStorage.getItem(LEGACY_SIDEBAR_KEY);
    if (legacySaved !== null) {
      localStorage.setItem(STORAGE_KEYS.collapsed, legacySaved);
      return legacySaved === "true";
    }

    return false;
  }

  function createLink(command) {
    if (command.action || command.disabled) {
      const button = document.createElement("button");
      button.className = "sambah-shell-subcommand";
      button.type = "button";
      button.textContent = command.label;
      if (command.action) button.dataset.action = command.action;
      if (command.status) button.dataset.status = command.status;
      if (command.disabled) {
        button.disabled = true;
        button.classList.add("is-disabled");
        button.title = command.status || "Em preparacao";
      }
      if (command.action) {
        button.addEventListener("click", () => runShellAction(command.action, button));
      }
      return button;
    }

    const link = document.createElement("a");
    link.className = "sambah-shell-subcommand";
    link.href = command.href;
    link.textContent = command.label;
    if (command.status) link.dataset.status = command.status;
    return link;
  }

  async function runShellAction(action, button) {
    if (action !== "refresh-crm") return;

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Atualizando...";
    try {
      if (typeof window.refreshSambahCrm === "function") {
        await window.refreshSambahCrm();
      } else if (typeof window.refreshDashboard === "function") {
        await window.refreshDashboard();
      } else {
        document.querySelector("#refreshAudit, #refreshLeads")?.click();
      }
    } catch (error) {
      console.error("[sambah-shell] Falha ao atualizar CRM", error);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function createModuleItem(module, activeModule, openGroups) {
    const item = document.createElement("section");
    item.className = "sambah-shell-module";
    item.dataset.module = module.id;
    if (module.id === activeModule) item.classList.add("is-active");
    if (module.tone) item.dataset.tone = module.tone;

    const button = document.createElement("button");
    button.className = "sambah-shell-module-toggle";
    button.type = "button";
    button.setAttribute("aria-expanded", String(openGroups.has(module.id)));

    const label = document.createElement("span");
    label.textContent = module.label;
    label.dataset.fullLabel = module.label;
    label.dataset.shortLabel = module.shortLabel || module.label;

    const marker = document.createElement("span");
    marker.className = "sambah-shell-caret";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = ">";

    button.append(label, marker);

    const submenu = document.createElement("div");
    submenu.className = "sambah-shell-submenu";
    submenu.hidden = !openGroups.has(module.id);
    module.commands.forEach((command) => submenu.append(createLink(command)));

    button.addEventListener("click", () => {
      const shell = document.querySelector(".sambah-shell");
      if (shell?.classList.contains("is-collapsed")) {
        shell.classList.remove("is-collapsed");
        document.body.classList.remove("sambah-shell-collapsed");
        localStorage.setItem(STORAGE_KEYS.collapsed, "false");
        const collapseButton = shell.querySelector("[data-action='toggle-sidebar']");
        if (collapseButton) {
          collapseButton.textContent = "<";
          collapseButton.setAttribute("aria-label", "Recolher barra SamBah");
        }
      }

      const isOpen = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!isOpen));
      submenu.hidden = isOpen;
      if (isOpen) openGroups.delete(module.id);
      else openGroups.add(module.id);
      writeOpenGroups(openGroups);
    });

    item.append(button, submenu);
    return item;
  }

  function renderSambahShell(activeModule = "") {
    document.querySelector(".sambah-shell")?.remove();

    const openGroups = new Set(readOpenGroups());
    if (activeModule) openGroups.add(activeModule);

    const shell = document.createElement("aside");
    shell.className = "sambah-shell sambah-sidebar";
    shell.setAttribute("aria-label", "Navegacao integrada SamBah");
    shell.dataset.activeModule = activeModule;

    const collapsed = readCollapsedState();
    shell.classList.toggle("is-collapsed", collapsed);
    document.body.classList.add("sambah-shell-mounted");
    document.body.classList.toggle("sambah-shell-collapsed", collapsed);

    const header = document.createElement("header");
    header.className = "sambah-shell-header";

    const brand = document.createElement("div");
    brand.className = "sambah-shell-brand";
    brand.innerHTML = "<strong>SamBah</strong><span>operação integrada</span>";

    const collapseButton = document.createElement("button");
    collapseButton.className = "sambah-shell-collapse";
    collapseButton.type = "button";
    collapseButton.dataset.action = "toggle-sidebar";
    collapseButton.setAttribute("aria-label", collapsed ? "Expandir barra SamBah" : "Recolher barra SamBah");
    collapseButton.textContent = collapsed ? ">" : "<";
    collapseButton.addEventListener("click", () => {
      const nextCollapsed = !shell.classList.contains("is-collapsed");
      shell.classList.toggle("is-collapsed", nextCollapsed);
      document.body.classList.toggle("sambah-shell-collapsed", nextCollapsed);
      localStorage.setItem(STORAGE_KEYS.collapsed, String(nextCollapsed));
      collapseButton.textContent = nextCollapsed ? ">" : "<";
      collapseButton.setAttribute("aria-label", nextCollapsed ? "Expandir barra SamBah" : "Recolher barra SamBah");
    });

    header.append(brand, collapseButton);

    const nav = document.createElement("nav");
    nav.className = "sambah-shell-nav";
    nav.setAttribute("aria-label", "Modulos SamBah");
    modules.forEach((module) => nav.append(createModuleItem(module, activeModule, openGroups)));

    const footer = document.createElement("footer");
    footer.className = "sambah-shell-footer";
    footer.innerHTML = "<span>Status</span><strong>Local</strong>";

    shell.append(header, nav, footer);
    document.body.prepend(shell);
    writeOpenGroups(openGroups);
    return shell;
  }

  window.renderSambahShell = renderSambahShell;
})();
