import crypto from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

const DEFAULT_FILES = {
  clientes: "data/clientes.json",
  leads: "data/leads.json",
  atendimentos: "data/atendimentos.json",
  eventos: "data/eventos.json",
  precomandas: "data/precomandas.json"
};

const CLIENTE_STATUSES = new Set([
  "novo",
  "novo_contato",
  "em_atendimento",
  "aguardando_dados",
  "orcamento_enviado",
  "orcamento_solicitado",
  "aguardando_resposta",
  "negociando",
  "fechado",
  "perdido",
  "retorno_futuro",
  "retornar_depois",
  "cliente_recorrente"
]);

const LEAD_STATUSES = new Set([
  "novo",
  "novo_contato",
  "em_atendimento",
  "aguardando_dados",
  "orcamento_enviado",
  "orcamento_solicitado",
  "aguardando_resposta",
  "negociando",
  "fechado",
  "perdido",
  "retorno_futuro",
  "retornar_depois",
  "cliente_recorrente"
]);

const INTERESSES = new Set([
  "pedido",
  "cardapio",
  "evento",
  "food_truck",
  "orcamento",
  "festa_xeriffe",
  "reserva_xeriffe",
  "festa_confraternizacao",
  "falar_com_neno",
  "falar_com_kazuko",
  "outro"
]);

export class CrmService {
  constructor({
    files = DEFAULT_FILES,
    whatsappNumber = "55XXXXXXXXXXX",
    now = () => new Date()
  } = {}) {
    this.files = { ...DEFAULT_FILES, ...files };
    this.whatsappNumber = whatsappNumber;
    this.now = now;
  }

  async resumo() {
    const [clientes, leads, atendimentos, eventos, precomandas] = await Promise.all([
      this.listarClientes(),
      this.listarLeads(),
      this.listarAtendimentos(),
      this.listarEventos(),
      this.listarPrecomandas()
    ]);
    const oportunidades = await this.listarOportunidades();
    const executivo = buildExecutiveDashboard({
      clientes: clientes.items,
      leads: leads.items,
      atendimentos: atendimentos.items,
      eventos: eventos.items,
      precomandas: precomandas.items,
      oportunidades: oportunidades.items,
      now: this.now
    });
    return {
      ok: true,
      clientes: clientes.items.length,
      leads: leads.items.length,
      atendimentos: atendimentos.items.length,
      eventos: eventos.items.length,
      precomandas: precomandas.items.length,
      novos: leads.items.filter((lead) => lead.status === "novo").length,
      emAtendimento: leads.items.filter((lead) => lead.status === "em_atendimento").length,
      aguardandoDados: leads.items.filter((lead) => lead.status === "aguardando_dados").length,
      orcamentosSolicitados: leads.items.filter((lead) => lead.status === "orcamento_solicitado").length,
      orcamentosEnviados: leads.items.filter((lead) => lead.status === "orcamento_enviado").length,
      aguardandoResposta: leads.items.filter((lead) => lead.status === "aguardando_resposta").length,
      leadsQuentes: leads.items.filter((lead) => lead.leadTemperature === "quente").length,
      fechados: leads.items.filter((lead) => lead.status === "fechado").length,
      perdidos: leads.items.filter((lead) => lead.status === "perdido").length,
      eventosAbertos: eventos.items.filter((evento) => !["fechado", "perdido"].includes(evento.status)).length,
      retornosHoje: leads.items.filter((lead) => isDueToday(lead.nextFollowUpAt, this.now)).length,
      clientesRecorrentes: clientes.items.filter((cliente) => cliente.status_comercial === "cliente_recorrente").length,
      proximosRetornos: leads.items.filter((lead) => Boolean(lead.nextFollowUpAt || lead.proximo_retorno)).slice(0, 8),
      dinheiroDoDia: buildDailyMoneyList(leads.items, this.now).slice(0, 5),
      retornosVencidos: buildOverdueReturns(leads.items, this.now),
      orcamentosParados: buildStalledQuotes(leads.items, this.now),
      reativacao: buildReactivationList({ clientes: clientes.items, leads: leads.items, atendimentos: atendimentos.items }),
      leadsInsanoSite: leads.items.filter((lead) => isInsanoSiteOrigin(lead)).slice(0, 12),
      comercial: buildCommercialAnswers({ clientes: clientes.items, leads: leads.items, atendimentos: atendimentos.items, eventos: eventos.items, precomandas: precomandas.items, oportunidades: oportunidades.items, now: this.now }),
      clientesPorTelefone: buildPhoneIdentity({ clientes: clientes.items, leads: leads.items, eventos: eventos.items, precomandas: precomandas.items }),
      executivo,
      leadsPrincipais: leads.items.slice(0, 20),
      ultimosAtendimentos: atendimentos.items.slice(0, 8),
      ultimasPrecomandas: precomandas.items.slice(0, 8)
    };
  }

  async listarClientes() {
    const items = await this.readCollection("clientes");
    return { ok: true, count: items.length, items };
  }

  async salvarCliente(input = {}) {
    const clientes = await this.readCollection("clientes");
    const now = this.now().toISOString();
    const whatsapp = normalizePhone(input.whatsapp || input.phone || input.from || input.customer?.phone);
    const existing = whatsapp ? clientes.find((cliente) => normalizePhone(cliente.whatsapp) === whatsapp) : null;
    if (existing) {
      existing.nome = input.nome || input.name || input.customer?.name || existing.nome;
      existing.whatsapp = whatsapp || existing.whatsapp;
      existing.origem = input.origem || input.source || existing.origem || "samBah";
      existing.ultimo_contato_em = now;
      existing.tags = mergeTags(existing.tags, input.tags);
      existing.observacoes = input.observacoes || input.notes || existing.observacoes || "";
      existing.status_comercial = normalizeClienteStatus(input.status_comercial || existing.status_comercial);
      existing.historico = addHistory(existing.historico, "contato_atualizado", input.historicoMensagem || "Contato atualizado no CRM", this.now);
      await this.writeCollection("clientes", clientes);
      return { ok: true, cliente: existing, created: false };
    }
    const cliente = {
      id: input.id || `cli_${crypto.randomUUID()}`,
      nome: input.nome || input.name || input.customer?.name || "",
      whatsapp: whatsapp || "",
      origem: input.origem || input.source || "samBah",
      primeiro_contato_em: input.primeiro_contato_em || now,
      ultimo_contato_em: input.ultimo_contato_em || now,
      tags: mergeTags([], input.tags),
      observacoes: input.observacoes || input.notes || "",
      total_pedidos: Number(input.total_pedidos) || 0,
      valor_estimado_total: Number(input.valor_estimado_total) || 0,
      status_comercial: normalizeClienteStatus(input.status_comercial),
      historico: addHistory([], "cliente_criado", input.historicoMensagem || "Cliente criado no CRM", this.now)
    };
    clientes.unshift(cliente);
    await this.writeCollection("clientes", clientes);
    return { ok: true, cliente, created: true };
  }

  async listarLeads() {
    const items = await this.readCollection("leads");
    return { ok: true, count: items.length, items };
  }

  async salvarLead(input = {}) {
    const leads = await this.readCollection("leads");
    const now = this.now().toISOString();
    const parsed = parseCommercialFields(input);
    const enriched = { ...input, ...parsed };
    const interesse = normalizeInteresse(enriched.interesse || enriched.interest || inferInteresse(enriched));
    const faltantes = missingForLead({ ...enriched, interesse });
    const pipeline = normalizePipeline(enriched.pipeline || inferPipeline({ ...enriched, interesse }));
    const status = input.status ? normalizeLeadStatus(input.status) : (faltantes.length ? "aguardando_dados" : "novo_contato");
    const score = calculateLeadScore({ ...enriched, interesse, pipeline, status, dados_faltantes: faltantes });
    const proximoPasso = input.proximo_passo || input.nextAction || suggestNextAction({ status, interesse, pipeline, dados_faltantes: faltantes, leadScore: score.score });
    const lead = {
      id: input.id || `lead_${crypto.randomUUID()}`,
      cliente_id: input.cliente_id || input.clienteId || "",
      nome: input.nome || input.name || input.customerName || "",
      customerName: input.customerName || input.nome || input.name || "",
      whatsapp: normalizePhone(input.whatsapp || input.phone),
      phone: normalizePhone(input.phone || input.whatsapp),
      origem: input.origem || input.source || "site",
      source: input.source || input.origem || "site",
      channel: input.channel || input.canal || "site",
      page: input.page || input.pagina || "",
      campaign: input.campaign || input.utm_campaign || "",
      utm_source: input.utm_source || "",
      utm_medium: input.utm_medium || "",
      utm_campaign: input.utm_campaign || input.campaign || "",
      utm_content: input.utm_content || "",
      utm_term: input.utm_term || "",
      tipo: input.tipo || input.type || "",
      operacao: input.operacao || input.operation || "",
      pipeline,
      interesse,
      mensagem_original: input.mensagem_original || input.message || input.text || "",
      notes: input.notes || input.observacoes || input.message || input.text || "",
      eventDate: enriched.eventDate || "",
      eventDateText: enriched.eventDateText || "",
      eventLocationText: enriched.eventLocationText || "",
      eventTimeText: enriched.eventTimeText || "",
      quantidade_pessoas: enriched.quantidade_pessoas || "",
      status,
      dados_faltantes: faltantes,
      proximo_passo: proximoPasso,
      nextFollowUpAt: input.nextFollowUpAt || suggestFollowUpAt({ status, now: this.now, date: input.data || input.date }),
      leadScore: score.score,
      leadTemperature: score.temperature,
      scoreReasons: score.reasons,
      mensagem_whatsapp_sugerida: input.mensagem_whatsapp_sugerida || buildSuggestedWhatsappMessage({ ...enriched, nome: input.nome || input.name, whatsapp: input.whatsapp || input.phone, interesse, pipeline, status, dados_faltantes: faltantes }),
      valor_estimado: Number(input.valor_estimado || input.valorEstimado) || 0,
      valorEstimado: Number(input.valorEstimado || input.valor_estimado) || 0,
      valorFechado: Number(input.valorFechado || input.valor_fechado) || 0,
      valor_fechado: Number(input.valor_fechado || input.valorFechado) || 0,
      probabilidade_fechamento: input.probabilidade_fechamento || defaultProbability(score.temperature),
      motivo_perda: input.motivo_perda || input.motivoPerda || "",
      motivoPerda: input.motivoPerda || input.motivo_perda || "",
      responsavel: input.responsavel || "SamBah",
      tags: mergeTags(input.tags || [], [pipeline, interesse, score.temperature]),
      criado_em: input.criado_em || input.createdAt || now,
      createdAt: input.createdAt || input.criado_em || now,
      atualizado_em: input.atualizado_em || input.updatedAt || now,
      proximo_retorno: input.proximo_retorno || "",
      observacoes: input.observacoes || input.notes || "",
      historico: addHistory(input.historico || [], "lead_criado", "Lead criado no CRM", this.now)
    };
    lead.whatsappUrl = input.whatsappUrl || buildWaUrl(this.whatsappNumber, buildSuggestedWhatsappMessage(lead));
    leads.unshift(lead);
    await this.writeCollection("leads", leads);
    return { ok: true, lead };
  }

  async atualizarLead(id, patch = {}) {
    return this.patchItem("leads", id, (lead) => {
      const merged = {
        ...lead,
        ...cleanPatch(patch),
        interesse: patch.interesse ? normalizeInteresse(patch.interesse) : lead.interesse,
        pipeline: patch.pipeline ? normalizePipeline(patch.pipeline) : lead.pipeline,
        status: patch.status ? normalizeLeadStatus(patch.status) : lead.status,
        dados_faltantes: Array.isArray(patch.dados_faltantes) ? patch.dados_faltantes : lead.dados_faltantes
      };
      const score = calculateLeadScore(merged);
      const proximoPassoChanged = patch.proximo_passo || patch.nextAction;
      return {
        ...merged,
        proximo_passo: proximoPassoChanged || suggestNextAction({ ...merged, leadScore: score.score }),
        nextFollowUpAt: patch.nextFollowUpAt || suggestFollowUpAt({ status: merged.status, now: this.now, date: merged.data || merged.date }),
        leadScore: score.score,
        leadTemperature: score.temperature,
        scoreReasons: score.reasons,
        mensagem_whatsapp_sugerida: patch.mensagem_whatsapp_sugerida || buildSuggestedWhatsappMessage(merged),
        historico: addHistory(lead.historico, "lead_atualizado", proximoPassoChanged ? "Proximo passo alterado" : `Status comercial alterado para ${merged.status}`, this.now),
        atualizado_em: this.now().toISOString()
      };
    });
  }

  async marcarLeadContatado(id) {
    return this.patchItem("leads", id, (lead) => {
      const now = this.now().toISOString();
      const merged = {
        ...lead,
        status: "em_atendimento",
        proximo_passo: "Acompanhar resposta do cliente",
        atualizado_em: now,
        updatedAt: now,
        historico: addHistory(lead.historico, "lead_contatado", "Cliente contatado pelo WhatsApp", this.now)
      };
      return {
        ...merged,
        mensagem_whatsapp_sugerida: buildSuggestedWhatsappMessage(merged)
      };
    });
  }

  async marcarLeadOrcamentoEnviado(id) {
    return this.patchItem("leads", id, (lead) => {
      const now = this.now().toISOString();
      const merged = {
        ...lead,
        status: "orcamento_enviado",
        nextFollowUpAt: addHours(this.now(), 24),
        proximo_passo: "Acompanhar resposta do cliente",
        atualizado_em: now,
        updatedAt: now,
        historico: addHistory(lead.historico, "orcamento_enviado", "Orcamento enviado", this.now)
      };
      return {
        ...merged,
        mensagem_whatsapp_sugerida: buildSuggestedWhatsappMessage(merged)
      };
    });
  }

  async marcarLeadFechado(id, valorFechado = 0) {
    const result = await this.patchItem("leads", id, (lead) => {
      const now = this.now().toISOString();
      const closedValue = Number(valorFechado || lead.valorFechado || lead.valor_fechado || lead.valor_estimado || lead.valorEstimado) || 0;
      const merged = {
        ...lead,
        status: "fechado",
        valorFechado: closedValue,
        valor_fechado: closedValue,
        proximo_passo: "Alinhar operacao e preparar atendimento",
        atualizado_em: now,
        updatedAt: now,
        historico: addHistory(lead.historico, "lead_fechado", "Oportunidade marcada como fechada", this.now)
      };
      return {
        ...merged,
        mensagem_whatsapp_sugerida: buildSuggestedWhatsappMessage(merged)
      };
    });
    if (result.ok) await this.markRelatedEventClosed(result.item);
    return result;
  }

  async marcarLeadPerdido(id, motivoPerda = "outro") {
    const motivo = normalizeLossReason(motivoPerda);
    return this.patchItem("leads", id, (lead) => {
      const now = this.now().toISOString();
      const merged = {
        ...lead,
        status: "perdido",
        motivo_perda: motivo,
        motivoPerda: motivo,
        proximo_passo: "Registrar motivo da perda",
        atualizado_em: now,
        updatedAt: now,
        historico: addHistory(lead.historico, "lead_perdido", `Oportunidade perdida: ${motivo}`, this.now)
      };
      return {
        ...merged,
        mensagem_whatsapp_sugerida: buildSuggestedWhatsappMessage(merged)
      };
    });
  }

  async markRelatedEventClosed(lead = {}) {
    const eventos = await this.readCollection("eventos");
    let changed = false;
    const updated = eventos.map((evento) => {
      if (evento.lead_id !== lead.id) return evento;
      changed = true;
      return {
        ...evento,
        status: "fechado",
        status_evento: "fechado",
        proximo_passo: "Alinhar operacao e preparar atendimento",
        atualizado_em: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
        historico: addHistory(evento.historico, "evento_fechado", "Evento relacionado marcado como fechado", this.now)
      };
    });
    if (changed) await this.writeCollection("eventos", updated);
  }

  async converterLeadEmEvento(leadId) {
    if (!leadId) return { ok: false, error: "lead_id_required" };
    const leads = await this.readCollection("leads");
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return { ok: false, error: "lead_not_found", id: leadId };

    const eventos = await this.readCollection("eventos");
    const existing = eventos.find((evento) => evento.lead_id === lead.id);
    if (existing) {
      return { ok: true, duplicated: true, event: existing, lead, warning: "event_already_exists" };
    }

    const eventResult = await this.salvarEvento({
      cliente_id: lead.cliente_id,
      lead_id: lead.id,
      nome_evento: lead.interesse || "Evento a organizar",
      interesse: lead.interesse,
      message: lead.mensagem_original,
      observacoes: lead.observacoes || lead.mensagem_original,
      origem: lead.origem
    });

    lead.status = "orcamento_solicitado";
    lead.proximo_passo = "Enviar orcamento";
    lead.atualizado_em = this.now().toISOString();
    lead.historico = addHistory(lead.historico, "lead_convertido_evento", "Lead convertido em evento", this.now);
    await this.writeCollection("leads", leads);
    return { ok: true, duplicated: false, event: eventResult.evento, lead };
  }

  async listarAtendimentos() {
    const items = await this.readCollection("atendimentos");
    return { ok: true, count: items.length, items };
  }

  async salvarAtendimento(input = {}) {
    const atendimentos = await this.readCollection("atendimentos");
    const faltantes = Array.isArray(input.faltantes) ? input.faltantes : [];
    const interesse = normalizeInteresse(input.interesse || inferInteresse(input));
    const pipeline = normalizePipeline(input.pipeline || inferPipeline({ ...input, interesse }));
    const status = input.status || (faltantes.length ? "aguardando_dados" : "registrado");
    const atendimento = {
      id: input.id || `atd_${crypto.randomUUID()}`,
      cliente_id: input.cliente_id || input.clienteId || "",
      lead_id: input.lead_id || input.leadId || "",
      canal: input.canal || input.channel || "site",
      origem: input.origem || input.source || "samBah",
      operation: input.operation || input.operacao || "",
      operacao: input.operacao || input.operation || "",
      customerName: input.customerName || input.nome || input.name || input.dados_coletados?.nome || "",
      phone: normalizePhone(input.phone || input.whatsapp || input.dados_coletados?.whatsapp),
      source: input.source || input.origem || "samBah",
      channel: input.channel || input.canal || "site",
      page: input.page || input.pagina || "",
      campaign: input.campaign || input.utm_campaign || "",
      utm_source: input.utm_source || "",
      utm_medium: input.utm_medium || "",
      utm_campaign: input.utm_campaign || input.campaign || "",
      utm_content: input.utm_content || "",
      utm_term: input.utm_term || "",
      type: input.type || input.tipo || "",
      tipo: input.tipo || input.type || "",
      mensagem_cliente: input.mensagem_cliente || input.message || input.text || input.notes || "",
      notes: input.notes || input.observacoes || input.message || input.text || input.mensagem_cliente || "",
      resposta_sambah: input.resposta_sambah || input.responseText || "",
      dados_coletados: input.dados_coletados || input.collected || {},
      faltantes,
      dados_faltantes: Array.isArray(input.dados_faltantes) ? input.dados_faltantes : faltantes,
      pipeline,
      interesse,
      status,
      proximo_passo: input.proximo_passo || input.nextAction || suggestNextAction({ status, interesse, pipeline, dados_faltantes: faltantes }),
      nextFollowUpAt: input.nextFollowUpAt || suggestFollowUpAt({ status, now: this.now }),
      mensagem_whatsapp_sugerida: input.mensagem_whatsapp_sugerida || buildSuggestedWhatsappMessage({ ...input, interesse, pipeline, status, dados_faltantes: faltantes }),
      criado_em: input.criado_em || input.createdAt || this.now().toISOString(),
      createdAt: input.createdAt || input.criado_em || this.now().toISOString(),
      historico: addHistory(input.historico || [], "atendimento_criado", "Atendimento salvo no CRM", this.now)
    };
    atendimento.whatsappUrl = input.whatsappUrl || buildWaUrl(this.whatsappNumber, buildSuggestedWhatsappMessage(atendimento));
    atendimentos.unshift(atendimento);
    await this.writeCollection("atendimentos", atendimentos);
    return { ok: true, atendimento };
  }

  async atualizarAtendimento(id, patch = {}) {
    return this.patchItem("atendimentos", id, (atendimento) => ({
      ...atendimento,
      ...cleanPatch(patch),
      atualizado_em: this.now().toISOString()
    }));
  }

  async listarEventos() {
    const items = await this.readCollection("eventos");
    const [leads, clientes] = await Promise.all([
      this.readCollection("leads"),
      this.readCollection("clientes")
    ]);
    const enriched = items.map((evento) => enrichEventContact(evento, { leads, clientes }));
    return { ok: true, count: enriched.length, items: enriched };
  }

  async salvarEvento(input = {}) {
    const eventos = await this.readCollection("eventos");
    const now = this.now().toISOString();
    const parsed = parseCommercialFields(input);
    const enriched = { ...input, ...parsed };
    const quantidade = normalizePeopleCount(enriched.quantidade_pessoas || enriched.people || inferPeople(enriched.message || enriched.text || ""));
    const faltantes = missingForEvent({ ...enriched, quantidade_pessoas: quantidade });
    const interesse = normalizeInteresse(enriched.interesse || enriched.interest || inferInteresse(enriched));
    const pipeline = normalizePipeline(enriched.pipeline || inferPipeline({ ...enriched, interesse }));
    const status = input.status || (faltantes.length ? "aguardando_dados" : "novo_contato");
    const score = calculateLeadScore({ ...enriched, interesse, pipeline, status, quantidade_pessoas: quantidade, dados_faltantes: faltantes });
    const evento = {
      id: input.id || `evt_${crypto.randomUUID()}`,
      cliente_id: input.cliente_id || input.clienteId || "",
      lead_id: input.lead_id || input.leadId || "",
      nome_evento: input.nome_evento || input.eventName || "Evento a organizar",
      customerName: input.customerName || input.nome || input.name || "",
      tipo_evento: input.tipo_evento || input.eventType || inferEventType(input),
      data: input.data || input.date || enriched.eventDate || "",
      local: input.local || input.location || input.place || enriched.eventLocationText || "",
      eventDate: enriched.eventDate || input.eventDate || "",
      eventDateText: enriched.eventDateText || input.eventDateText || "",
      eventLocationText: enriched.eventLocationText || input.eventLocationText || "",
      eventTimeText: enriched.eventTimeText || input.eventTimeText || "",
      whatsapp: normalizePhone(input.whatsapp || input.phone || ""),
      phone: normalizePhone(input.phone || input.whatsapp),
      origem: input.origem || input.source || "samBah",
      source: input.source || input.origem || "samBah",
      channel: input.channel || input.canal || "site",
      page: input.page || input.pagina || "",
      campaign: input.campaign || input.utm_campaign || "",
      utm_source: input.utm_source || "",
      utm_medium: input.utm_medium || "",
      utm_campaign: input.utm_campaign || input.campaign || "",
      utm_content: input.utm_content || "",
      utm_term: input.utm_term || "",
      tipo: input.tipo || input.type || input.tipo_evento || "",
      type: input.type || input.tipo || input.tipo_evento || "",
      quantidade_pessoas: quantidade,
      interesse,
      pipeline,
      status,
      dados_faltantes: faltantes,
      proximo_passo: input.proximo_passo || input.nextAction || suggestNextAction({ status, interesse, pipeline, dados_faltantes: faltantes, leadScore: score.score }),
      nextFollowUpAt: input.nextFollowUpAt || suggestFollowUpAt({ status, now: this.now, date: input.data || input.date }),
      leadScore: score.score,
      leadTemperature: score.temperature,
      scoreReasons: score.reasons,
      mensagem_whatsapp_sugerida: input.mensagem_whatsapp_sugerida || buildSuggestedWhatsappMessage({ ...enriched, interesse, pipeline, status, dados_faltantes: faltantes, quantidade_pessoas: quantidade }),
      valor_estimado: Number(input.valor_estimado || input.valorEstimado) || 0,
      valorEstimado: Number(input.valorEstimado || input.valor_estimado) || 0,
      valorFechado: Number(input.valorFechado || input.valor_fechado) || 0,
      valor_fechado: Number(input.valor_fechado || input.valorFechado) || 0,
      motivoPerda: input.motivoPerda || input.motivo_perda || "",
      motivo_perda: input.motivo_perda || input.motivoPerda || "",
      probabilidade_fechamento: input.probabilidade_fechamento || defaultProbability(score.temperature),
      observacoes: input.observacoes || input.notes || input.message || input.text || "",
      notes: input.notes || input.observacoes || input.message || input.text || "",
      criado_em: input.criado_em || input.createdAt || now,
      createdAt: input.createdAt || input.criado_em || now,
      atualizado_em: input.atualizado_em || now,
      historico: addHistory(input.historico || [], "evento_criado", "Evento salvo no CRM", this.now)
    };
    evento.whatsappUrl = input.whatsappUrl || buildWaUrl(this.whatsappNumber, buildSuggestedWhatsappMessage(evento));
    eventos.unshift(evento);
    await this.writeCollection("eventos", eventos);
    return { ok: true, evento };
  }

  async atualizarEvento(id, patch = {}) {
    return this.patchItem("eventos", id, (evento) => ({
      ...evento,
      ...cleanPatch(patch),
      quantidade_pessoas: patch.quantidade_pessoas ? normalizePeopleCount(patch.quantidade_pessoas) : evento.quantidade_pessoas,
      proximo_passo: patch.proximo_passo || patch.nextAction || evento.proximo_passo,
      atualizado_em: this.now().toISOString()
    }));
  }

  async listarPrecomandas() {
    const items = await this.linkExistingPrecomandas(await this.readCollection("precomandas"));
    return { ok: true, count: items.length, items };
  }

  async linkExistingPrecomandas(items = []) {
    let changed = false;
    const linked = [];
    for (const item of items) {
      const next = { ...item };
      if (!next.cliente_id && next.whatsapp) {
        const clienteResult = await this.salvarCliente({
          nome: next.nome,
          whatsapp: next.whatsapp,
          origem: "precomanda",
          tags: ["pedido"],
          historicoMensagem: "Pre-comanda antiga vinculada ao cliente"
        });
        next.cliente_id = clienteResult.cliente.id;
        next.historico = addHistory(next.historico, "saneamento", "Pre-comanda antiga vinculada ao cliente", this.now);
        changed = true;
      }
      if (!next.atendimento_id && next.cliente_id) {
        const atendimentoResult = await this.salvarAtendimento({
          cliente_id: next.cliente_id,
          canal: "site",
          origem: "precomanda",
          mensagem_cliente: next.observacoes || "Pre-comanda antiga vinculada ao atendimento",
          dados_coletados: { nome: next.nome, whatsapp: next.whatsapp },
          faltantes: next.dados_faltantes || [],
          status: next.dados_faltantes?.length ? "aguardando_dados" : "registrado"
        });
        next.atendimento_id = atendimentoResult.atendimento.id;
        next.historico = addHistory(next.historico, "saneamento", "Atendimento criado para pre-comanda antiga", this.now);
        changed = true;
      }
      linked.push(next);
    }
    if (changed) await this.writeCollection("precomandas", linked);
    return linked;
  }

  async salvarPrecomanda(input = {}) {
    const precomandas = await this.readCollection("precomandas");
    const now = this.now().toISOString();
    const customer = input.customer || {};
    const nome = input.nome || input.name || customer.name || "";
    const whatsapp = normalizePhone(input.whatsapp || input.telefone || input.phone || customer.phone);
    let clienteId = input.cliente_id || input.clienteId || "";
    let atendimentoId = input.atendimento_id || input.atendimentoId || "";
    if (!clienteId && whatsapp) {
      const clienteResult = await this.salvarCliente({
        nome,
        whatsapp,
        origem: input.origem || input.source || "precomanda",
        tags: ["pedido"],
        historicoMensagem: "Pré-comanda vinculada ao cliente"
      });
      clienteId = clienteResult.cliente.id;
    }
    const itens = normalizeItems(input.itens || input.items);
    const faltantes = missingForPrecomanda({ ...input, nome, whatsapp, itens, customer });
    const interesse = "pedido";
    const pipeline = normalizePipeline(input.pipeline || inferPipeline({ ...input, interesse }));
    const status = input.status || (faltantes.length ? "aguardando_dados" : "nova");
    if (!atendimentoId && clienteId) {
      const atendimentoResult = await this.salvarAtendimento({
        cliente_id: clienteId,
        canal: input.canal || input.channel || "site",
        origem: input.origem || input.source || "precomanda",
        mensagem_cliente: input.observacoes || input.notes || "Pré-comanda registrada",
        dados_coletados: { nome, whatsapp, operacao: input.operacao || input.operation || "SamBah" },
        faltantes,
        status: faltantes.length ? "aguardando_dados" : "registrado",
        pipeline,
        interesse
      });
      atendimentoId = atendimentoResult.atendimento.id;
    }
    const precomanda = {
      id: input.id || input.eventId || input.sambahOrderId || `pre_${crypto.randomUUID()}`,
      cliente_id: clienteId,
      atendimento_id: atendimentoId,
      mesa_order_id: input.mesa_order_id || input.mesaOrderId || input.mesa?.mesaOrderId || "",
      nome,
      customerName: input.customerName || nome,
      whatsapp,
      phone: normalizePhone(input.phone || input.telefone || input.whatsapp || customer.phone),
      operacao: input.operacao || input.operation || "SamBah",
      origem: input.origem || input.source || "precomanda",
      source: input.source || input.origem || "precomanda",
      channel: input.channel || input.canal || "site",
      page: input.page || input.pagina || "",
      campaign: input.campaign || input.utm_campaign || "",
      utm_source: input.utm_source || "",
      utm_medium: input.utm_medium || "",
      utm_campaign: input.utm_campaign || input.campaign || "",
      utm_content: input.utm_content || "",
      utm_term: input.utm_term || "",
      tipo: input.tipo || input.serviceType || customer.serviceType || "",
      type: input.type || input.tipo || input.serviceType || customer.serviceType || "",
      pagamento: input.pagamento || input.paymentMethod || customer.paymentMethod || "",
      endereco: input.endereco || input.address || customer.address || "",
      itens,
      observacoes: input.observacoes || input.notes || "",
      notes: input.notes || input.observacoes || "",
      dados_faltantes: faltantes,
      pipeline,
      status,
      proximo_passo: input.proximo_passo || input.nextAction || suggestNextAction({ status, interesse, pipeline, dados_faltantes: faltantes }),
      nextFollowUpAt: input.nextFollowUpAt || suggestFollowUpAt({ status, now: this.now }),
      mensagem_whatsapp_sugerida: input.mensagem_whatsapp_sugerida || buildSuggestedWhatsappMessage({ ...input, nome, whatsapp, interesse, pipeline, status, dados_faltantes: faltantes }),
      status_mesa: input.status_mesa || input.mesa?.status || "",
      criado_em: input.criado_em || input.createdAt || now,
      createdAt: input.createdAt || input.criado_em || now,
      atualizado_em: input.atualizado_em || input.updatedAt || now,
      historico: addHistory(input.historico || [], "precomanda_criada", "Pré-comanda salva no CRM", this.now)
    };
    precomanda.whatsappUrl = input.whatsappUrl || buildWaUrl(this.whatsappNumber, buildPrecomandaWhatsappMessage(precomanda));
    precomandas.unshift(precomanda);
    await this.writeCollection("precomandas", precomandas);
    return {
      ok: true,
      precomanda,
      whatsappUrl: buildWaUrl(this.whatsappNumber, buildPrecomandaWhatsappMessage(precomanda))
    };
  }

  async atualizarPrecomanda(id, patch = {}) {
    return this.patchItem("precomandas", id, (precomanda) => ({
      ...precomanda,
      ...cleanPatch(patch),
      dados_faltantes: Array.isArray(patch.dados_faltantes) ? patch.dados_faltantes : precomanda.dados_faltantes,
      proximo_passo: patch.proximo_passo || patch.nextAction || precomanda.proximo_passo,
      atualizado_em: this.now().toISOString()
    }));
  }

  async registrarAtendimentoComercial(input = {}) {
    const message = input.mensagem_cliente || input.message || input.text || input.body || input.notes || "";
    const customer = input.customer || {};
    const nome = input.nome || input.name || customer.name || "";
    const whatsapp = normalizePhone(input.whatsapp || input.phone || input.from || customer.phone);
    const parsed = parseCommercialFields({ ...input, message });
    const enriched = { ...input, ...parsed, message };
    const interesse = normalizeInteresse(enriched.interesse || enriched.interest || inferInteresse(enriched));
    const clienteResult = await this.salvarCliente({
      nome,
      whatsapp,
      origem: input.origem || input.source || "site",
      tags: [interesse],
      observacoes: message
    });

    let leadResult = null;
    let eventoResult = null;
    let precomandaResult = null;
    const faltantes = interesse === "pedido"
      ? missingForInterest(interesse, { nome, whatsapp, input })
      : missingForLead({ ...enriched, nome, whatsapp, interesse });

    if (["evento", "food_truck", "orcamento", "festa_confraternizacao", "festa_xeriffe", "reserva_xeriffe", "falar_com_neno", "falar_com_kazuko"].includes(interesse)) {
      leadResult = await this.salvarLead({
        cliente_id: clienteResult.cliente.id,
        nome,
        whatsapp,
        origem: input.origem || input.source || "site",
        interesse,
        pipeline: enriched.pipeline,
        eventDate: enriched.eventDate,
        eventDateText: enriched.eventDateText,
        eventLocationText: enriched.eventLocationText,
        eventTimeText: enriched.eventTimeText,
        quantidade_pessoas: enriched.quantidade_pessoas,
        source: input.source,
        channel: input.channel || input.canal,
        page: input.page || input.pagina,
        campaign: input.campaign || input.utm_campaign,
        utm_source: input.utm_source,
        utm_medium: input.utm_medium,
        utm_campaign: input.utm_campaign,
        utm_content: input.utm_content,
        utm_term: input.utm_term,
        tipo: input.tipo || input.type,
        valor_estimado: input.valor_estimado || input.valorEstimado,
        valorEstimado: input.valorEstimado || input.valor_estimado,
        valorFechado: input.valorFechado || input.valor_fechado,
        valor_fechado: input.valor_fechado || input.valorFechado,
        motivo_perda: input.motivo_perda || input.motivoPerda,
        motivoPerda: input.motivoPerda || input.motivo_perda,
        mensagem_original: message,
        status: faltantes.length ? "aguardando_dados" : "em_atendimento",
        dados_faltantes: faltantes,
        proximo_passo: nextActionForMissing(faltantes, interesse),
        observacoes: input.observacoes || input.notes || ""
      });
      if (["evento", "food_truck", "orcamento", "festa_confraternizacao", "festa_xeriffe", "reserva_xeriffe"].includes(interesse)) {
        eventoResult = await this.salvarEvento({
          cliente_id: clienteResult.cliente.id,
          lead_id: leadResult.lead.id,
          interesse,
          pipeline: enriched.pipeline,
          eventDate: enriched.eventDate,
          eventDateText: enriched.eventDateText,
          eventLocationText: enriched.eventLocationText,
          eventTimeText: enriched.eventTimeText,
          quantidade_pessoas: enriched.quantidade_pessoas,
          whatsapp,
          message,
          ...input
        });
        leadResult = await this.atualizarLead(leadResult.lead.id, {
          dados_faltantes: eventoResult.evento.dados_faltantes,
          proximo_passo: eventoResult.evento.proximo_passo,
          eventDate: eventoResult.evento.eventDate,
          eventDateText: eventoResult.evento.eventDateText,
          eventLocationText: eventoResult.evento.eventLocationText,
          eventTimeText: eventoResult.evento.eventTimeText,
          quantidade_pessoas: eventoResult.evento.quantidade_pessoas
        }).then((result) => ({ ok: result.ok, lead: result.item }));
      }
    }

    const atendimentoResult = await this.salvarAtendimento({
      cliente_id: clienteResult.cliente.id,
      lead_id: leadResult?.lead?.id || "",
      canal: input.canal || input.channel || "site",
      origem: input.origem || input.source || "samBah",
      mensagem_cliente: message,
      resposta_sambah: input.resposta_sambah || buildRespostaSambah(interesse),
      dados_coletados: { nome, whatsapp, interesse },
      faltantes,
      pipeline: enriched.pipeline,
      interesse,
      status: faltantes.length ? "aguardando_dados" : "registrado",
      proximo_passo: nextActionForMissing(faltantes, interesse),
      source: input.source,
      channel: input.channel || input.canal,
      page: input.page || input.pagina,
      campaign: input.campaign || input.utm_campaign,
      utm_source: input.utm_source,
      utm_medium: input.utm_medium,
      utm_campaign: input.utm_campaign,
      utm_content: input.utm_content,
      utm_term: input.utm_term,
      tipo: input.tipo || input.type
    });

    if (interesse === "pedido" || input.type === "pre_order" || Array.isArray(input.items)) {
      precomandaResult = await this.salvarPrecomanda({
        ...input,
        cliente_id: clienteResult.cliente.id,
        atendimento_id: atendimentoResult.atendimento.id
      });
    }

    const whatsappMessage = buildWhatsAppMessage({ interesse, nome, whatsapp, message, input });
    return {
      ok: true,
      cliente: clienteResult.cliente,
      lead: leadResult?.lead || null,
      evento: eventoResult?.evento || null,
      atendimento: atendimentoResult.atendimento,
      precomanda: precomandaResult?.precomanda || null,
      interesse,
      faltantes,
      whatsappMessage,
      whatsappUrl: `https://wa.me/${this.whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`
    };
  }

  async registrarPrecomanda(input = {}) {
    return this.registrarAtendimentoComercial({
      ...input,
      interesse: "pedido",
      type: "pre_order"
    });
  }

  async listarOportunidades() {
    const [leads, atendimentos, eventos, precomandas] = await Promise.all([
      this.listarLeads(),
      this.listarAtendimentos(),
      this.listarEventos(),
      this.listarPrecomandas()
    ]);
    const now = this.now();
    const items = [
      ...leads.items.map((item) => buildOpportunity(item, "lead", now, this.whatsappNumber)),
      ...atendimentos.items.map((item) => buildOpportunity(item, "atendimento", now, this.whatsappNumber)),
      ...eventos.items.map((item) => buildOpportunity(item, "evento", now, this.whatsappNumber)),
      ...precomandas.items.map((item) => buildOpportunity(item, "precomanda", now, this.whatsappNumber))
    ].filter(Boolean).filter((item) => !item.arquivado).sort((a, b) => a.prioridadePeso - b.prioridadePeso || b.tempoParadoHoras - a.tempoParadoHoras);
    const groups = {
      acaoAgora: items.filter((item) => item.bucket === "acao_agora"),
      aguardandoCliente: items.filter((item) => item.bucket === "aguardando_cliente"),
      riscoPerda: items.filter((item) => item.bucket === "risco_perda"),
      eventosImportantes: items.filter((item) => item.bucket === "eventos_importantes")
    };
    return { ok: true, count: items.length, groups, items };
  }

  async marcarOportunidadeRetornada(opportunityId) {
    return this.patchOpportunity(opportunityId, {
      status_comercial: "retornado",
      ultimo_retorno_em: this.now().toISOString(),
      nextFollowUpAt: suggestFollowUpAt({ status: "aguardando_resposta", now: this.now }),
      historico: addHistory([], "oportunidade_retornada", "Oportunidade marcada como retornada", this.now)
    });
  }

  async arquivarOportunidade(opportunityId) {
    return this.patchOpportunity(opportunityId, {
      oportunidade_arquivada: true,
      arquivado_em: this.now().toISOString(),
      historico: addHistory([], "oportunidade_arquivada", "Oportunidade arquivada na central", this.now)
    });
  }

  async anotarOportunidade(opportunityId, nota = "") {
    return this.patchOpportunity(opportunityId, {
      nota_oportunidade: nota,
      ultima_nota_em: this.now().toISOString(),
      historico: addHistory([], "nota_oportunidade", nota || "Nota adicionada na oportunidade", this.now)
    });
  }

  async patchOpportunity(opportunityId, patch = {}) {
    const parsed = parseOpportunityId(opportunityId);
    if (!parsed) return { ok: false, error: "opportunity_not_found", id: opportunityId };
    const collection = opportunityCollection(parsed.type);
    if (!collection) return { ok: false, error: "opportunity_type_invalid", id: opportunityId };
    return this.patchItem(collection, parsed.recordId, (item) => ({
      ...item,
      ...cleanPatch(patch),
      historico: mergeHistory(item.historico, patch.historico),
      atualizado_em: this.now().toISOString()
    }));
  }

  async patchItem(collection, id, mapper) {
    if (!id) return { ok: false, error: "id_required" };
    const items = await this.readCollection(collection);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, error: `${collection.slice(0, -1)}_not_found`, id };
    items[index] = mapper(items[index]);
    await this.writeCollection(collection, items);
    return { ok: true, item: items[index] };
  }

  async readCollection(name) {
    const filePath = this.files[name];
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(stripBom(raw) || "[]");
      if (!Array.isArray(parsed)) return [];
      const { items, changed } = this.normalizeCollection(name, parsed);
      if (changed) await this.writeCollection(name, items);
      return items;
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.writeCollection(name, []);
        return [];
      }
      await this.backupCorruptedFile(filePath);
      await this.writeCollection(name, []);
      return [];
    }
  }

  async writeCollection(name, items) {
    const filePath = this.files[name];
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
  }

  async backupCorruptedFile(filePath) {
    try {
      const stamp = this.now().toISOString().replace(/[-:T.Z]/g, "").slice(0, 12);
      const ext = extname(filePath) || ".json";
      const target = join(dirname(filePath), `${basename(filePath, ext)}-corrompido-backup-${stamp}${ext}`);
      await copyFile(filePath, target);
    } catch (error) {
      console.error("[samBah crm]", error);
    }
  }

  normalizeCollection(name, items) {
    let changed = false;
    const normalized = items.map((item) => {
      const next = { ...item };
      if (name === "eventos") {
        const originalPeople = next.quantidade_pessoas;
        const fixedPeople = normalizePeopleCount(next.quantidade_pessoas);
        if (originalPeople !== fixedPeople) {
          next.quantidade_pessoas = fixedPeople;
          next.historico = addHistory(next.historico, "saneamento", "Quantidade de pessoas marcada para revisao", this.now);
          changed = true;
        }
        const faltantes = missingForEvent(next);
        if (!Array.isArray(next.dados_faltantes) || next.dados_faltantes.join("|") !== faltantes.join("|")) {
          next.dados_faltantes = faltantes;
          changed = true;
        }
        if (!next.proximo_passo) {
          next.proximo_passo = nextActionForMissing(faltantes, "evento");
          changed = true;
        }
        if (faltantes.length && next.status === "novo") {
          next.status = "aguardando_dados";
          changed = true;
        }
        if (this.enrichCommercialFields(next, "evento")) changed = true;
      }
      if (name === "precomandas") {
        const faltantes = missingForPrecomanda(next);
        if (!Array.isArray(next.dados_faltantes) || next.dados_faltantes.join("|") !== faltantes.join("|")) {
          next.dados_faltantes = faltantes;
          changed = true;
        }
        if (!next.proximo_passo) {
          next.proximo_passo = nextActionForMissing(faltantes, "pedido");
          changed = true;
        }
        if (faltantes.length && next.status === "nova") {
          next.status = "aguardando_dados";
          changed = true;
        }
        if (this.enrichCommercialFields(next, "pedido")) changed = true;
      }
      if (name === "leads") {
        const faltantes = missingForLead(next);
        if (!Array.isArray(next.dados_faltantes) || next.dados_faltantes.join("|") !== faltantes.join("|")) {
          next.dados_faltantes = faltantes;
          changed = true;
        }
        if (!next.proximo_passo) {
          next.proximo_passo = nextActionForMissing(faltantes, next.interesse);
          changed = true;
        }
        if (faltantes.length && next.status === "novo") {
          next.status = "aguardando_dados";
          changed = true;
        }
        if (this.enrichCommercialFields(next, next.interesse)) changed = true;
      }
      if (name === "atendimentos") {
        const faltantes = Array.isArray(next.faltantes) ? next.faltantes : [];
        if (!Array.isArray(next.dados_faltantes)) {
          next.dados_faltantes = faltantes;
          changed = true;
        }
        if (!next.proximo_passo) {
          next.proximo_passo = nextActionForMissing(next.dados_faltantes, inferInteresse(next));
          changed = true;
        }
        if (next.dados_faltantes.length && next.status === "registrado") {
          next.status = "aguardando_dados";
          changed = true;
        }
        if (this.enrichCommercialFields(next, next.interesse || inferInteresse(next))) changed = true;
      }
      return next;
    });
    return { items: normalized, changed };
  }

  enrichCommercialFields(record, fallbackInterest = "outro") {
    let changed = false;
    const interesse = normalizeInteresse(record.interesse || fallbackInterest || inferInteresse(record));
    const pipeline = normalizePipeline(record.pipeline || inferPipeline({ ...record, interesse }));
    if (!record.interesse && interesse) {
      record.interesse = interesse;
      changed = true;
    }
    if (!record.pipeline) {
      record.pipeline = pipeline;
      changed = true;
    }
    const score = calculateLeadScore({ ...record, interesse, pipeline });
    if (record.leadScore !== score.score) {
      record.leadScore = score.score;
      changed = true;
    }
    if (record.leadTemperature !== score.temperature) {
      record.leadTemperature = score.temperature;
      changed = true;
    }
    if (!Array.isArray(record.scoreReasons)) {
      record.scoreReasons = score.reasons;
      changed = true;
    }
    if (!record.proximo_passo) {
      record.proximo_passo = suggestNextAction({ ...record, interesse, pipeline, leadScore: score.score });
      changed = true;
    }
    if (!record.nextFollowUpAt) {
      record.nextFollowUpAt = suggestFollowUpAt({ status: record.status, now: this.now, date: record.data || record.date });
      changed = true;
    }
    if (!record.mensagem_whatsapp_sugerida) {
      record.mensagem_whatsapp_sugerida = buildSuggestedWhatsappMessage({ ...record, interesse, pipeline });
      changed = true;
    }
    return changed;
  }
}

function normalizePhone(value = "") {
  return String(value || "").replace(/\D/g, "");
}

function normalizeClienteStatus(status = "novo") {
  const normalized = normalizeStatus(status);
  return CLIENTE_STATUSES.has(normalized) ? normalized : "novo";
}

function normalizeLeadStatus(status = "novo") {
  const normalized = normalizeStatus(status);
  return LEAD_STATUSES.has(normalized) ? normalized : "novo";
}

function normalizeStatus(value = "") {
  return normalizeText(value).replace(/\s+/g, "_");
}

function normalizeInteresse(value = "") {
  const normalized = normalizeText(value).replace(/\s+/g, "_");
  return INTERESSES.has(normalized) ? normalized : "outro";
}

function normalizePipeline(value = "") {
  const normalized = normalizeText(value).replace(/\s+/g, "_");
  const allowed = new Set([
    "pedido_rapido",
    "mesa",
    "orcamento_evento",
    "food_truck_evento",
    "festa_xeriffe",
    "orcamento_corporativo",
    "cliente_recorrente",
    "atendimento_humano",
    "atendimento_whatsapp"
  ]);
  return allowed.has(normalized) ? normalized : "atendimento_humano";
}

function inferPipeline(input = {}) {
  const text = normalizeText(`${input.message || ""} ${input.text || ""} ${input.mensagem_original || ""} ${input.observacoes || ""} ${input.interesse || ""} ${input.operation || ""} ${input.operacao || ""}`);
  if (isXeriffePartyText(text)) return "festa_xeriffe";
  if (text.includes("pedido") || text.includes("cardapio") || text.includes("precomanda") || text.includes("pre comanda")) return "pedido_rapido";
  if (text.includes("xeriffe") || text.includes("festa no xeriffe") || text.includes("buteco")) return "festa_xeriffe";
  if (text.includes("empresa") || text.includes("corporativo") || text.includes("confraternizacao") || text.includes("sipat") || text.includes("happy hour")) return "orcamento_corporativo";
  if (text.includes("food truck") || text.includes("foodtruck") || text.includes("beer truck") || text.includes("evento")) return "food_truck_evento";
  if (text.includes("recorrente")) return "cliente_recorrente";
  if (input.interesse === "pedido") return "pedido_rapido";
  if (["food_truck", "evento", "festa_confraternizacao", "orcamento"].includes(input.interesse)) return "food_truck_evento";
  return "atendimento_humano";
}

function inferInteresse(input = {}) {
  const text = normalizeText(`${input.message || ""} ${input.text || ""} ${input.mensagem_original || ""} ${input.type || ""} ${input.operation || ""} ${input.selectedFlow || ""}`);
  if (isXeriffePartyText(text)) return "festa_xeriffe";
  if (text.includes("kazuko")) return "falar_com_kazuko";
  if (text.includes("neno")) return "falar_com_neno";
  if (text.includes("confraternizacao") || text.includes("empresa")) return "festa_confraternizacao";
  if (text.includes("food truck") || text.includes("foodtruck") || text.includes("beer truck")) return "food_truck";
  if (text.includes("orcamento")) return "orcamento";
  if (text.includes("evento") || text.includes("festa")) return "evento";
  if (text.includes("cardapio")) return "cardapio";
  if (text.includes("pedido") || text.includes("pre_order") || text.includes("pre comanda") || text.includes("precomanda") || text.includes("xeriffe") || text.includes("insano")) return "pedido";
  return "outro";
}

function inferEventType(input = {}) {
  const text = normalizeText(`${input.message || ""} ${input.text || ""} ${input.tipo_evento || ""}`);
  if (text.includes("confraternizacao") || text.includes("empresa")) return "confraternizacao_empresa";
  if (isXeriffePartyText(text)) return "festa_xeriffe";
  if (text.includes("food truck")) return "food_truck";
  if (text.includes("beer truck")) return "beer_truck";
  if (text.includes("anivers")) return "aniversario";
  return "evento";
}

function parseCommercialFields(input = {}) {
  const raw = [
    input.message,
    input.text,
    input.mensagem_original,
    input.observacoes,
    input.notes,
    input.tipo_evento,
    input.interesse,
    input.pipeline
  ].filter(Boolean).join(" ");
  const text = normalizeText(raw);
  const parsed = {
    ...extractEventDate(raw),
    eventLocationText: input.eventLocationText || extractEventLocation(raw),
    eventTimeText: input.eventTimeText || extractEventTime(raw)
  };
  const people = normalizePeopleCount(input.quantidade_pessoas || input.people || inferPeople(raw));
  if (people) parsed.quantidade_pessoas = people;
  if (isXeriffePartyText(text)) {
    parsed.interesse = "festa_xeriffe";
    parsed.pipeline = "festa_xeriffe";
  } else if (text.includes("empresa") || text.includes("corporativo") || text.includes("confraternizacao") || text.includes("sipat") || text.includes("happy hour")) {
    parsed.pipeline = "orcamento_corporativo";
    parsed.interesse = input.interesse || (text.includes("confraternizacao") ? "festa_confraternizacao" : "orcamento");
  } else if (text.includes("food truck") || text.includes("foodtruck") || text.includes("beer truck") || text.includes("evento") || text.includes("orcamento")) {
    parsed.pipeline = "food_truck_evento";
    parsed.interesse = input.interesse || (text.includes("orcamento") ? "orcamento" : "evento");
  } else if (text.includes("cardapio") || text.includes("pedido") || text.includes("espetinho") || text.includes("precomanda") || text.includes("pre comanda")) {
    parsed.pipeline = "pedido_rapido";
    parsed.interesse = input.interesse || (text.includes("cardapio") ? "cardapio" : "pedido");
  }
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined && value !== ""));
}

function isXeriffePartyText(text = "") {
  const normalized = normalizeText(text);
  const hasXeriffe = normalized.includes("xeriffe") || normalized.includes("buteco");
  const hasParty = /\b(anivers\w*|festa|reserva|reservar|comemoracao|comemorar|mesa|turma)\b/.test(normalized);
  return hasXeriffe && hasParty && !/\b(cardapio|pedido|pedir|espetinho|precomanda|pre comanda)\b/.test(normalized);
}

function extractEventDate(raw = "") {
  const source = String(raw || "");
  const exact = source.match(/\b(?:dia\s*)?(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/i);
  if (exact) {
    const [, day, month, year] = exact;
    return {
      eventDateText: `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`,
      eventDate: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    };
  }
  const partial = source.match(/\b(?:dia\s*)?(\d{1,2})[/-](\d{1,2})\b/i);
  if (partial) return { eventDateText: `${partial[1].padStart(2, "0")}/${partial[2].padStart(2, "0")}` };
  const normalized = normalizeText(source);
  const month = normalized.match(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/);
  if (month) return { eventDateText: month[1] };
  const relative = normalized.match(/\b(hoje|amanha|depois de amanha|fim de semana|final de semana|semana que vem|mes que vem|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/);
  if (relative) return { eventDateText: relative[1] };
  return {};
}

function extractEventLocation(raw = "") {
  const source = String(raw || "");
  const bairro = source.match(/\b(?:no|na)\s+bairro\s+([^.,;\n]+?)(?=\s+(?:dia|em|para|com|as|às|a\s+\d)|[.,;\n]|$)/i);
  if (bairro) return cleanExtractedText(bairro[1]);
  const cidade = source.match(/\bem\s+([\p{L}][\p{L}\s]+?)(?=\s+(?:dia|para|com|as|às|a\s+\d)|[.,;\n]|$)/iu);
  if (cidade) return cleanExtractedText(cidade[1]);
  const known = [
    "Moinhos de Vento",
    "Porto Alegre",
    "Canoas",
    "Gravatai",
    "Cachoeirinha",
    "Sao Leopoldo",
    "Novo Hamburgo",
    "Centro",
    "Menino Deus",
    "Bela Vista"
  ];
  const normalized = normalizeText(source);
  const found = known.find((place) => normalized.includes(normalizeText(place)));
  return found || "";
}

function extractEventTime(raw = "") {
  const source = String(raw || "");
  const explicit = source.match(/\b(?:as|às|a)\s*(\d{1,2}(?:h\d{0,2}|:\d{2})?)\b/i) || source.match(/\b(\d{1,2}h\d{0,2}|\d{1,2}:\d{2})\b/i);
  if (explicit) return explicit[1].replace(":", "h");
  const normalized = normalizeText(source);
  const period = normalized.match(/\b(meio-dia|almoco|jantar|fim de tarde|final de tarde|noite|tarde|manha)\b/);
  return period ? period[1] : "";
}

function cleanExtractedText(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function inferPeople(text = "") {
  const normalized = normalizeText(text)
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, " ")
    .replace(/\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/g, " ");
  const explicit = normalized.match(/\b(\d{1,4})\s*(pessoas|convidados|participantes|pax|turma|publico)\b/);
  if (explicit) return normalizePeopleCount(explicit[1]);
  const contextual = normalized.match(/\b(para|aproximadamente|cerca de|em torno de)\s+(\d{1,4})\b/);
  if (contextual && /\b(evento|festa|confraternizacao|food truck|orcamento)\b/.test(normalized)) {
    return normalizePeopleCount(contextual[2]);
  }
  return "";
}

function missingForInterest(interesse, { nome, whatsapp, input }) {
  const missing = [];
  if (!nome) missing.push("nome");
  if (!whatsapp) missing.push("whatsapp");
  const items = input.items || input.itens || [];
  if (interesse === "pedido" && (!Array.isArray(items) || !items.length)) missing.push("itens do pedido");
  if (["evento", "food_truck", "orcamento", "festa_confraternizacao"].includes(interesse)) {
    const text = `${input.message || ""} ${input.text || ""}`;
    if (!input.data && !input.date && !normalizeText(text).includes("mes que vem")) missing.push("data");
    if (!input.local && !input.location && !input.place) missing.push("local");
    if (!normalizePeopleCount(input.quantidade_pessoas || input.people || inferPeople(text))) missing.push("numero de pessoas");
  }
  return missing;
}

function normalizePeopleCount(value) {
  const number = Number(String(value || "").replace(/\D/g, ""));
  if (!number) return "";
  if (number >= 2020 && number <= 2035) return "";
  return number;
}

function missingForLead(input = {}) {
  const missing = [];
  if (!normalizePhone(input.whatsapp || input.phone)) missing.push("whatsapp");
  if (!normalizeInteresse(input.interesse || input.interest || inferInteresse(input)) || normalizeInteresse(input.interesse || input.interest || inferInteresse(input)) === "outro") {
    missing.push("interesse");
  }
  const pipeline = normalizePipeline(input.pipeline || inferPipeline(input));
  if (["food_truck_evento", "orcamento_corporativo", "festa_xeriffe"].includes(pipeline)) {
    if (pipeline === "festa_xeriffe" && !(input.eventDate || input.data || input.date)) missing.push("data exata");
    if (pipeline !== "festa_xeriffe" && !(input.eventDate || input.eventDateText || input.data || input.date)) missing.push("data do evento");
    if (pipeline === "festa_xeriffe" && !input.eventTimeText) missing.push("horario");
    if (pipeline !== "festa_xeriffe" && !(input.eventLocationText || input.local || input.location || input.place)) missing.push("local");
    if (!normalizePeopleCount(input.quantidade_pessoas || input.people)) missing.push("numero de pessoas");
  }
  return missing;
}

function missingForEvent(input = {}) {
  const missing = [];
  const text = `${input.message || ""} ${input.text || ""} ${input.observacoes || ""}`;
  const pipeline = normalizePipeline(input.pipeline || inferPipeline(input));
  if (pipeline === "festa_xeriffe" && !input.eventDate && !input.data && !input.date) missing.push("data exata");
  if (pipeline !== "festa_xeriffe" && !input.eventDate && !input.eventDateText && !input.data && !input.date && !normalizeText(text).includes("mes que vem")) missing.push("data do evento");
  if (pipeline === "festa_xeriffe" && !input.eventTimeText) missing.push("horario");
  if (pipeline !== "festa_xeriffe" && !input.eventLocationText && !input.local && !input.location && !input.place) missing.push("local");
  if (!normalizePeopleCount(input.quantidade_pessoas || input.people || inferPeople(text))) missing.push("numero de pessoas");
  if (!input.cliente_id && !input.clienteId) missing.push("cliente");
  return missing;
}

function calculateLeadScore(input = {}) {
  const reasons = [];
  let score = 0;
  const pipeline = normalizePipeline(input.pipeline || inferPipeline(input));
  const status = normalizeStatus(input.status || "");
  const text = normalizeText(`${input.message || ""} ${input.text || ""} ${input.mensagem_original || ""} ${input.observacoes || ""}`);
  if (pipeline === "food_truck_evento") add(35, "Food truck para evento");
  if (pipeline === "festa_xeriffe") add(35, "Festa no Xeriffe");
  if (pipeline === "orcamento_corporativo") add(30, "Orcamento corporativo");
  if (input.eventDate || input.eventDateText || input.data || input.date || hasDateText(text)) add(25, "Data informada");
  if (normalizePeopleCount(input.quantidade_pessoas || input.people || inferPeople(text))) add(20, "Numero de pessoas informado");
  if (input.eventLocationText || input.local || input.location || input.place) add(15, "Local informado");
  if (normalizePhone(input.whatsapp || input.phone || input.from)) add(15, "WhatsApp valido");
  if (input.atendimentos_anteriores || input.total_pedidos || input.cliente_recorrente) add(10, "Historico anterior");
  if (text.includes("empresa")) add(10, "Menciona empresa");
  if (/(confraternizacao|sipat|happy hour|feira|festival)/.test(text)) add(10, "Contexto comercial forte");
  if (status === "aguardando_dados") add(-20, "Aguardando dados");
  if (!normalizePhone(input.whatsapp || input.phone || input.from)) add(-30, "Sem telefone");
  const finalScore = Math.max(0, score);
  return {
    score: finalScore,
    temperature: finalScore >= 60 ? "quente" : finalScore >= 30 ? "morno" : "frio",
    reasons
  };
  function add(points, reason) {
    score += points;
    reasons.push(`${points > 0 ? "+" : ""}${points} ${reason}`);
  }
}

function defaultProbability(temperature = "frio") {
  if (temperature === "quente") return 70;
  if (temperature === "morno") return 40;
  return 15;
}

function buildDailyMoneyList(leads = [], now = () => new Date()) {
  return leads
    .filter((lead) => !["fechado", "perdido"].includes(lead.status))
    .filter((lead) => {
      const pipeline = normalizePipeline(lead.pipeline);
      return lead.leadTemperature === "quente"
        || ["orcamento_solicitado", "orcamento_enviado", "aguardando_resposta"].includes(lead.status)
        || isDueOrOverdue(lead.nextFollowUpAt, now)
        || ["food_truck_evento", "festa_xeriffe", "orcamento_corporativo"].includes(pipeline);
    })
    .map((lead) => ({
      ...lead,
      prioridadeComercial: dailyMoneyScore(lead, now),
      mensagem_whatsapp_sugerida: buildSuggestedWhatsappMessage(lead)
    }))
    .sort((a, b) => {
      if (b.prioridadeComercial !== a.prioridadeComercial) return b.prioridadeComercial - a.prioridadeComercial;
      return new Date(b.atualizado_em || b.updatedAt || b.criado_em || 0) - new Date(a.atualizado_em || a.updatedAt || a.criado_em || 0);
    });
}

function buildCommercialAnswers({ clientes = [], leads = [], atendimentos = [], eventos = [], precomandas = [], oportunidades = [], now = () => new Date() }) {
  const activeLeads = leads.filter((lead) => !["fechado", "perdido"].includes(lead.status));
  const operationRanking = rankOperations([...leads, ...eventos, ...precomandas]);
  const lostLeads = leads.filter((lead) => lead.status === "perdido");
  const closedLeads = leads.filter((lead) => lead.status === "fechado");
  return {
    retornosHoje: activeLeads.filter((lead) => isDueToday(lead.nextFollowUpAt, now)),
    semResposta: activeLeads.filter((lead) => ["orcamento_enviado", "aguardando_resposta", "retornado"].includes(lead.status)),
    orcamentosParados: buildStalledQuotes(leads, now),
    eventosSemFechamento: eventos.filter((evento) => !["fechado", "perdido", "cancelado"].includes(evento.status)),
    clientesRecorrentes: clientes.filter((cliente) => cliente.status_comercial === "cliente_recorrente"),
    operacaoQueMaisVende: operationRanking[0] || null,
    quantoEntrouHoje: sumEstimatedValue(leads.filter((lead) => lead.status === "fechado" && isSameDay(lead.atualizado_em || lead.updatedAt || lead.criado_em, now()))),
    pedidosHoje: precomandas.filter((item) => isSameDay(item.criado_em || item.createdAt, now())).length,
    leadsHoje: leads.filter((lead) => isSameDay(lead.criado_em || lead.createdAt, now())).length,
    oportunidadesAbertas: oportunidades.length,
    contatosWhatsappHoje: atendimentos.filter((item) => normalizeText(`${item.origem} ${item.source}`).includes("whatsapp") && isSameDay(item.criado_em || item.createdAt, now())).length,
    valorEmNegociacao: sumEstimatedValue(activeLeads),
    valorFechado: sumClosedValue(closedLeads),
    valorPerdido: sumEstimatedValue(lostLeads)
  };
}

function buildExecutiveDashboard({ leads = [], eventos = [], precomandas = [], oportunidades = [], now = () => new Date() }) {
  const today = now();
  const todayLeads = leads.filter((lead) => isSameDay(lead.criado_em || lead.createdAt, today));
  const todayOrders = precomandas.filter((item) => isSameDay(item.criado_em || item.createdAt, today));
  const todayEvents = eventos.filter((evento) => isSameDay(evento.criado_em || evento.createdAt, today));
  const conversions = leads.filter((lead) => lead.status === "fechado" && isSameDay(lead.atualizado_em || lead.updatedAt || lead.criado_em, today));
  return {
    hoje: {
      leads: todayLeads.length,
      pedidos: todayOrders.length,
      eventos: todayEvents.length,
      precomandas: todayOrders.length,
      conversoes: conversions.length,
      receitaPrevista: sumEstimatedValue(leads.filter((lead) => !["fechado", "perdido"].includes(lead.status))),
      receitaEstimada: sumEstimatedValue(conversions),
      receitaFechada: sumClosedValue(conversions),
      oportunidadesAbertas: oportunidades.length,
      oportunidadesPerdidas: leads.filter((lead) => lead.status === "perdido" && isSameDay(lead.atualizado_em || lead.updatedAt || lead.criado_em, today)).length
    },
    ultimos7Dias: buildSevenDayEvolution({ leads, eventos, precomandas, now }),
    comparativoOperacoes: compareOperations({ leads, eventos, precomandas }),
    rankingOperacoes: rankOperations([...leads, ...eventos, ...precomandas])
  };
}

function buildSevenDayEvolution({ leads = [], eventos = [], precomandas = [], now = () => new Date() }) {
  const current = now();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(current);
    date.setDate(current.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return {
      data: key,
      leads: leads.filter((item) => isSameDay(item.criado_em || item.createdAt, date)).length,
      pedidos: precomandas.filter((item) => isSameDay(item.criado_em || item.createdAt, date)).length,
      eventos: eventos.filter((item) => isSameDay(item.criado_em || item.createdAt, date)).length,
      conversoes: leads.filter((item) => item.status === "fechado" && isSameDay(item.atualizado_em || item.updatedAt || item.criado_em, date)).length
    };
  });
}

function compareOperations({ leads = [], eventos = [], precomandas = [] }) {
  const operations = ["Insano", "Buteco Xeriffe"];
  return operations.map((operation) => {
    const normalized = normalizeText(operation);
    const opLeads = leads.filter((item) => normalizeText(item.operacao || item.operation).includes(normalized));
    const opEvents = eventos.filter((item) => normalizeText(item.operacao || item.operation || item.nome_evento).includes(normalized));
    const opOrders = precomandas.filter((item) => normalizeText(item.operacao || item.operation).includes(normalized));
    return {
      operacao: operation,
      leads: opLeads.length,
      pedidos: opOrders.length,
      eventos: opEvents.length,
      conversoes: opLeads.filter((item) => item.status === "fechado").length,
      receita: sumEstimatedValue(opLeads),
      receitaEstimada: sumEstimatedValue(opLeads.filter((item) => item.status === "fechado")),
      receitaFechada: sumClosedValue(opLeads.filter((item) => item.status === "fechado"))
    };
  });
}

function rankOperations(items = []) {
  const grouped = new Map();
  for (const item of items) {
    const operation = item.operacao || item.operation || "Sem operacao";
    const current = grouped.get(operation) || { operacao: operation, total: 0, fechados: 0, receitaEstimada: 0 };
    current.total += 1;
    if (item.status === "fechado") {
      current.fechados += 1;
      current.receitaEstimada += Number(item.valor_estimado || item.valorEstimado) || 0;
      current.receitaFechada = (current.receitaFechada || 0) + closedValue(item);
    }
    grouped.set(operation, current);
  }
  return [...grouped.values()].sort((a, b) => b.fechados - a.fechados || b.total - a.total || b.receitaEstimada - a.receitaEstimada);
}

function sumEstimatedValue(items = []) {
  return items.reduce((sum, item) => sum + (Number(item.valor_estimado) || Number(item.valorEstimado) || Number(item.valor_estimado_total) || 0), 0);
}

function closedValue(item = {}) {
  return Number(item.valorFechado || item.valor_fechado || item.valor_estimado || item.valorEstimado) || 0;
}

function sumClosedValue(items = []) {
  return items.reduce((sum, item) => sum + closedValue(item), 0);
}

function buildPhoneIdentity({ clientes = [], leads = [], eventos = [], precomandas = [] }) {
  const map = new Map();
  const ensure = (phone, seed = {}) => {
    const key = normalizePhone(phone);
    if (!key) return null;
    if (!map.has(key)) {
      map.set(key, {
        telefone: key,
        nome: seed.nome || seed.name || seed.nome_evento || "",
        pedidos: 0,
        eventos: 0,
        leads: 0,
        valorAcumulado: 0,
        clienteRecorrente: false
      });
    }
    const entry = map.get(key);
    if (!entry.nome) entry.nome = seed.nome || seed.name || seed.nome_evento || "";
    return entry;
  };
  clientes.forEach((cliente) => {
    const entry = ensure(cliente.whatsapp || cliente.phone, cliente);
    if (entry) entry.clienteRecorrente = cliente.status_comercial === "cliente_recorrente";
  });
  leads.forEach((lead) => {
    const entry = ensure(lead.whatsapp || lead.phone, lead);
    if (entry) {
      entry.leads += 1;
      entry.valorAcumulado += closedValue(lead);
    }
  });
  eventos.forEach((evento) => {
    const entry = ensure(evento.whatsapp || evento.phone, evento);
    if (entry) {
      entry.eventos += 1;
      entry.valorAcumulado += closedValue(evento);
    }
  });
  precomandas.forEach((precomanda) => {
    const entry = ensure(precomanda.whatsapp || precomanda.phone, precomanda);
    if (entry) entry.pedidos += 1;
  });
  return [...map.values()]
    .map((entry) => ({
      ...entry,
      clienteRecorrente: entry.clienteRecorrente || (entry.pedidos + entry.eventos + entry.leads) > 1 || entry.valorAcumulado > 0
    }))
    .sort((a, b) => Number(b.clienteRecorrente) - Number(a.clienteRecorrente) || b.valorAcumulado - a.valorAcumulado || b.pedidos - a.pedidos)
    .slice(0, 20);
}

function dailyMoneyScore(lead = {}, now = () => new Date()) {
  let score = 0;
  if (lead.leadTemperature === "quente") score += 60;
  if (lead.status === "orcamento_solicitado") score += 50;
  if (lead.status === "orcamento_enviado") score += 44;
  if (lead.status === "aguardando_resposta") score += 38;
  if (isDueOrOverdue(lead.nextFollowUpAt, now)) score += 32;
  if (["food_truck_evento", "festa_xeriffe", "orcamento_corporativo"].includes(normalizePipeline(lead.pipeline))) score += 24;
  return score;
}

function buildOverdueReturns(leads = [], now = () => new Date()) {
  const current = now();
  return leads
    .filter((lead) => !["fechado", "perdido"].includes(lead.status))
    .filter((lead) => isDueOrOverdue(lead.nextFollowUpAt, now))
    .map((lead) => ({
      ...lead,
      atraso: formatDelay(lead.nextFollowUpAt, current),
      mensagem_whatsapp_sugerida: buildSuggestedWhatsappMessage(lead)
    }))
    .sort((a, b) => new Date(a.nextFollowUpAt) - new Date(b.nextFollowUpAt));
}

function buildStalledQuotes(leads = [], now = () => new Date()) {
  const current = now();
  return leads
    .filter((lead) => ["orcamento_enviado", "aguardando_resposta"].includes(lead.status))
    .filter((lead) => isOlderThanHours(lead.atualizado_em || lead.updatedAt || lead.criado_em, 24, current))
    .map((lead) => ({
      ...lead,
      mensagem_whatsapp_sugerida: `Buenas, ${lead.nome || "cliente"}! Passando para ver se seguimos com teu orcamento. Quer que eu ajuste alguma coisa para fechar melhor?`
    }))
    .sort((a, b) => new Date(a.atualizado_em || a.updatedAt || a.criado_em || 0) - new Date(b.atualizado_em || b.updatedAt || b.criado_em || 0));
}

function isDueOrOverdue(value = "", now = () => new Date()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= now().getTime();
}

function isOlderThanHours(value = "", hours = 24, now = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return now.getTime() - date.getTime() > hours * 60 * 60 * 1000;
}

function isSameDay(value = "", target = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === target.getFullYear()
    && date.getMonth() === target.getMonth()
    && date.getDate() === target.getDate();
}

function formatDelay(value = "", now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 24) return `${hours || 1}h de atraso`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h de atraso`;
}

function normalizeLossReason(value = "") {
  const allowed = new Set([
    "preco",
    "data_indisponivel",
    "sem_resposta",
    "queria_outro_servico",
    "local_distante",
    "evento_cancelado",
    "so_pesquisando",
    "outro"
  ]);
  const normalized = normalizeText(value).replace(/\s+/g, "_");
  return allowed.has(normalized) ? normalized : "outro";
}

function suggestNextAction(input = {}) {
  const missing = input.dados_faltantes || input.faltantes || [];
  const status = normalizeStatus(input.status || "");
  if (missing.includes("whatsapp")) return "Pedir WhatsApp do cliente";
  if (missing.includes("data exata") && missing.includes("horario")) return "Pedir data exata e horario da festa";
  if (missing.includes("data do evento") && missing.includes("local") && missing.includes("numero de pessoas")) return "Pedir data, local e numero de pessoas";
  if (missing.includes("data")) return "Pedir data do evento";
  if (missing.includes("data do evento")) return "Pedir data do evento";
  if (missing.includes("data exata")) return "Pedir data exata da festa";
  if (missing.includes("horario")) return "Pedir horario da festa";
  if (missing.includes("numero de pessoas")) return "Confirmar numero de pessoas";
  if (missing.includes("local")) return "Confirmar local do evento";
  if (missing.includes("itens") || missing.includes("itens do pedido")) return "Completar dados da pre-comanda";
  if (missing.includes("endereco")) return "Confirmar endereco de entrega";
  if (input.leadScore >= 60 && !["fechado", "perdido"].includes(status)) return "Priorizar atendimento e chamar agora";
  if (status === "orcamento_solicitado") return "Montar e enviar orcamento";
  if (status === "orcamento_enviado") return "Acompanhar resposta do cliente";
  if (status === "aguardando_resposta") return "Chamar cliente no WhatsApp";
  if (status === "fechado") return "Registrar fechamento e alinhar operacao";
  if (status === "perdido") return "Registrar motivo da perda";
  return nextActionForMissing(missing, input.interesse || "outro");
}

function suggestFollowUpAt({ status = "", now = () => new Date(), date = "" } = {}) {
  const normalized = normalizeStatus(status);
  if (normalized === "perdido") return "";
  const base = now();
  if (normalized === "orcamento_solicitado" || normalized === "orcamento_enviado" || normalized === "negociando") return addHours(base, 24);
  if (normalized === "aguardando_resposta") return addHours(base, 48);
  if (normalized === "aguardando_dados") return addHours(base, 4);
  if (normalized === "fechado") return date ? addHours(new Date(date), 24) : addHours(base, 24);
  return "";
}

function addHours(date, hours) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next.toISOString();
}

function isDueToday(value, now = () => new Date()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const current = now();
  return date.getFullYear() === current.getFullYear()
    && date.getMonth() === current.getMonth()
    && date.getDate() === current.getDate();
}

function hasDateText(text = "") {
  return /\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/.test(text) || /\b(hoje|amanha|mes que vem)\b/.test(text);
}

function buildSuggestedWhatsappMessage(input = {}) {
  const nome = input.nome || input.name || "cliente";
  const missing = input.dados_faltantes || input.faltantes || [];
  const pipeline = normalizePipeline(input.pipeline || inferPipeline(input));
  const status = normalizeStatus(input.status || "");
  const interesse = input.interesse || pipeline;
  const dateText = input.eventDateText || input.eventDate || input.data || input.date || "";
  const locationText = input.eventLocationText || input.local || input.location || input.place || "";
  const timeText = input.eventTimeText || "";
  const people = normalizePeopleCount(input.quantidade_pessoas || input.people || inferPeople(`${input.message || ""} ${input.text || ""} ${input.mensagem_original || ""}`));
  if (status === "aguardando_dados" && missing.length) {
    if (pipeline === "festa_xeriffe" && (people || dateText || timeText)) {
      const resumo = [
        people ? `${people} pessoas` : "",
        dateText ? `data/periodo ${dateText}` : "",
        timeText ? `horario ${timeText}` : ""
      ].filter(Boolean).join(", ");
      return `Buenas, ${nome}! Vi tua festa no Xeriffe${resumo ? ` para ${resumo}` : ""}. Para eu organizar direito, me confirma: ${missing.join(", ")}.`;
    }
    if (["food_truck_evento", "orcamento_corporativo"].includes(pipeline) && (people || dateText || locationText)) {
      const resumo = [
        people ? `${people} pessoas` : "",
        dateText ? `em ${dateText}` : "",
        locationText ? `no ${locationText}` : ""
      ].filter(Boolean).join(", ");
      return `Buenas, ${nome}! Recebi teu evento${resumo ? ` para ${resumo}` : ""}. Para montar o atendimento, me confirma: ${missing.join(", ")}.`;
    }
    return `Buenas, ${nome}! Para eu te passar algo mais certeiro, so preciso confirmar: ${missing.join(", ")}.`;
  }
  if (status === "orcamento_solicitado") {
    return `Buenas, ${nome}! Ja tenho teu pedido de orcamento aqui. Vou organizar as informacoes e te retorno com uma proposta.`;
  }
  if (status === "orcamento_enviado") {
    return `Buenas, ${nome}! Te mandei o orcamento e fiquei a disposicao. Quer que eu ajuste algo para fechar a data?`;
  }
  if (status === "aguardando_resposta") {
    return `Buenas, ${nome}! Passando para saber se seguimos com teu evento/festa. Posso te ajudar a ajustar a proposta?`;
  }
  if (status === "fechado") {
    return `Buenas, ${nome}! Fechado entao. Agora vamos alinhar a operacao para tudo sair redondo.`;
  }
  if (status === "perdido") {
    return `Buenas, ${nome}! Quando quiser retomar teu evento ou pedido, fico por aqui.`;
  }
  if (pipeline === "festa_xeriffe") {
    const resumo = [
      people ? `${people} pessoas` : "",
      dateText ? `em ${dateText}` : "",
      timeText ? `as ${timeText}` : ""
    ].filter(Boolean).join(", ");
    return `Buenas, ${nome}! Aqui e o SamBah, do Xeriffe. Vi que tu quer fazer uma festa por aqui${resumo ? ` (${resumo})` : ""}. Vou te ajudar a organizar pelo WhatsApp.`;
  }
  if (pipeline === "orcamento_corporativo") {
    const resumo = [
      people ? `${people} pessoas` : "",
      dateText ? `em ${dateText}` : "",
      locationText ? `no ${locationText}` : ""
    ].filter(Boolean).join(", ");
    return `Buenas, ${nome}! Aqui e o SamBah, do Insano/Xeriffe. Recebi teu pedido de orcamento para empresa${resumo ? ` (${resumo})` : ""}. Vou organizar o atendimento contigo por aqui.`;
  }
  if (pipeline === "cliente_recorrente") {
    return `Buenas, ${nome}! Aqui e o SamBah. Vi que tu ja esteve com a gente antes. Temos opcao para pedido, evento e festa no Xeriffe. Quer que eu te ajude com alguma data?`;
  }
  if (pipeline === "food_truck_evento") {
    return `Buenas, ${nome}! Aqui e o SamBah, do Insano. Recebi teu interesse em levar o food truck para um evento. Me passa data, local e numero aproximado de pessoas que eu te ajudo a montar uma proposta.`;
  }
  return `Buenas, ${nome}! Aqui e o SamBah. Me diz o que tu precisa e eu te levo direto ao ponto pelo WhatsApp.`;
}

function buildReactivationList({ clientes = [], leads = [], atendimentos = [] } = {}) {
  const closedCustomerIds = new Set(leads.filter((lead) => lead.status === "fechado").map((lead) => lead.cliente_id));
  const candidates = leads
    .filter((lead) => ["perdido", "aguardando_resposta", "orcamento_enviado"].includes(lead.status))
    .filter((lead) => lead.whatsapp)
    .slice(0, 10)
    .map((lead) => ({
      ...lead,
      reactivationMessage: `Buenas, ${lead.nome || "cliente"}! Aqui e o SamBah. Ficou algum atendimento teu conosco e queria saber se ainda podemos te ajudar com pedido, evento ou festa no Xeriffe.`
    }));
  const customerCandidates = clientes
    .filter((cliente) => cliente.whatsapp && !closedCustomerIds.has(cliente.id))
    .filter((cliente) => atendimentos.some((atendimento) => atendimento.cliente_id === cliente.id))
    .slice(0, 5)
    .map((cliente) => ({
      id: `reativar_${cliente.id}`,
      nome: cliente.nome,
      whatsapp: cliente.whatsapp,
      status: "retornar_depois",
      pipeline: "cliente_recorrente",
      interesse: "cliente_recorrente",
      proximo_passo: "Chamar cliente no WhatsApp",
      reactivationMessage: `Buenas, ${cliente.nome || "cliente"}! Aqui e o SamBah. Ficou algum atendimento teu conosco e queria saber se ainda podemos te ajudar com pedido, evento ou festa no Xeriffe.`
    }));
  return [...candidates, ...customerCandidates].slice(0, 12);
}

function enrichEventContact(evento = {}, { leads = [], clientes = [] } = {}) {
  const lead = leads.find((item) => item.id === evento.lead_id) || null;
  const cliente = clientes.find((item) => item.id === (evento.cliente_id || lead?.cliente_id)) || null;
  const whatsapp = normalizePhone(evento.whatsapp || lead?.whatsapp || cliente?.whatsapp || "");
  const nome = evento.nome || lead?.nome || cliente?.nome || "";
  return {
    ...evento,
    nome,
    whatsapp,
    lead,
    cliente,
    mensagem_whatsapp_sugerida: evento.mensagem_whatsapp_sugerida || buildSuggestedWhatsappMessage({
      ...lead,
      ...evento,
      nome,
      whatsapp
    })
  };
}

function missingForPrecomanda(input = {}) {
  const customer = input.customer || {};
  const items = input.itens || input.items || [];
  const missing = [];
  if (!(input.nome || input.name || customer.name)) missing.push("nome");
  if (!normalizePhone(input.whatsapp || input.phone || customer.phone)) missing.push("whatsapp");
  if (!(input.tipo || input.serviceType || customer.serviceType)) missing.push("tipo_atendimento");
  if (!(input.pagamento || input.paymentMethod || customer.paymentMethod)) missing.push("forma_pagamento");
  if ((input.tipo || input.serviceType || customer.serviceType) === "entrega" && !(input.endereco || input.address || customer.address)) missing.push("endereco");
  if (!Array.isArray(items) || !items.length) missing.push("itens");
  return missing;
}

function nextActionForMissing(missing = [], interesse = "outro") {
  if (!Array.isArray(missing) || !missing.length) {
    if (["evento", "food_truck", "orcamento", "festa_confraternizacao"].includes(interesse)) return "Enviar orcamento";
    if (interesse === "pedido") return "Enviar para Mesa";
    return "Chamar cliente no WhatsApp";
  }
  if (missing.includes("whatsapp")) return "Pedir WhatsApp do cliente";
  if (missing.includes("data do evento")) return "Pedir data do evento";
  if (missing.includes("data exata") && missing.includes("horario")) return "Pedir data exata e horario da festa";
  if (missing.includes("data exata")) return "Pedir data exata da festa";
  if (missing.includes("horario")) return "Pedir horario da festa";
  if (missing.includes("data")) return "Pedir data do evento";
  if (missing.includes("local")) return "Pedir local do evento";
  if (missing.includes("numero de pessoas")) return "Confirmar numero de pessoas";
  if (missing.includes("forma_pagamento")) return "Confirmar forma de pagamento";
  if (missing.includes("tipo_atendimento")) return "Confirmar tipo de atendimento";
  if (missing.includes("itens") || missing.includes("itens do pedido")) return "Confirmar itens do pedido";
  if (missing.includes("interesse")) return "Confirmar interesse do cliente";
  return "Aguardar resposta";
}

function addHistory(history = [], action, message, now = () => new Date()) {
  return [
    ...(Array.isArray(history) ? history : []),
    {
      at: now().toISOString(),
      action,
      type: action,
      message,
      source: "sambah-crm"
    }
  ];
}

function buildRespostaSambah(interesse) {
  if (interesse === "pedido") return "Monte tua comanda. O SamBah organiza e te acompanha pelo WhatsApp.";
  if (["evento", "food_truck", "orcamento", "festa_confraternizacao"].includes(interesse)) {
    return "Me passa os dados do evento que eu organizo pra equipe te responder direito pelo WhatsApp.";
  }
  return "O atendimento continua pelo WhatsApp.";
}

function buildWhatsAppMessage({ interesse, nome, whatsapp, message, input }) {
  if (["evento", "food_truck", "orcamento", "festa_confraternizacao"].includes(interesse)) {
    return `Buenas, SamBah!
Quero organizar um evento.

Nome: ${nome || ""}
WhatsApp: ${whatsapp || ""}
Interesse: ${interesse}
Mensagem: ${message || input.observacoes || ""}

Pode me ajudar a organizar?`;
  }
  if (interesse === "pedido") {
    return `Buenas, SamBah!
Quero confirmar uma pre-comanda.

Nome: ${nome || ""}
WhatsApp: ${whatsapp || ""}
Pedido: ${formatItems(input.items || input.itens)}
Observacoes: ${message || input.notes || ""}

Pode organizar minha comanda?`;
  }
  return `Buenas, SamBah!
Preciso de atendimento da equipe.

Nome: ${nome || ""}
WhatsApp: ${whatsapp || ""}
Mensagem: ${message || ""}

Pode me ajudar?`;
}

function buildPrecomandaWhatsappMessage(precomanda = {}) {
  const retiradaEntrega = [precomanda.formaEntrega || precomanda.tipo, precomanda.endereco].filter(Boolean).join(" - ");
  return [
    "🔥 NOVA PRÉ-COMANDA INSANO",
    "",
    `PedidoId: ${precomanda.id || ""}`,
    `Nome: ${precomanda.nome || ""}`,
    `WhatsApp: ${precomanda.whatsapp || precomanda.phone || ""}`,
    `Operação: ${precomanda.operacao || precomanda.operation || "Insano"}`,
    "",
    "Itens:",
    formatItemsLines(precomanda.itens || []),
    "",
    `Retirada/Entrega: ${retiradaEntrega || ""}`,
    `Horário: ${precomanda.horario || ""}`,
    `Pagamento: ${precomanda.formaPagamento || precomanda.pagamento || ""}`,
    `Observações: ${precomanda.observacoes || ""}`,
    `Status: ${precomanda.status || "novo"}`
  ].join("\n");
}

function formatItemsLines(items = []) {
  if (!Array.isArray(items) || !items.length) return "- Item sem nome";
  return items.map((item) => {
    const quantidade = Number(item.quantidade || item.quantity || item.qty) || 1;
    const nome = item.nome || item.name || item.product || item.productId || item.produto || "Item sem nome";
    return `- ${quantidade}x ${nome}`;
  }).join("\n");
}

function buildWaUrl(number = "", message = "") {
  return `https://wa.me/${normalizePhone(number)}?text=${encodeURIComponent(message)}`;
}

function buildOpportunity(item = {}, type = "lead", now = new Date(), businessNumber = "") {
  if (!item.id || item.oportunidade_arquivada) return null;
  const pipeline = item.pipeline || "";
  const status = item.status_comercial || item.status || "";
  const stalledSince = opportunityDate(item);
  const stalledMs = Math.max(0, now.getTime() - stalledSince.getTime());
  const stalledHours = stalledMs / 36e5;
  const missing = Array.isArray(item.dados_faltantes) ? item.dados_faltantes : [];
  const isQuote = isQuoteOpportunity(item);
  const isEvent = type === "evento" || ["food_truck_evento", "festa_xeriffe", "orcamento_corporativo"].includes(pipeline);
  const isOrder = type === "precomanda" || pipeline === "pedido_rapido" || item.interesse === "pedido";
  const isWhatsapp = type === "atendimento" && normalizeText(`${item.origem} ${item.source} ${item.interesse} ${item.pipeline} ${item.type} ${item.tipo}`).includes("whatsapp");
  const eventIncomplete = isEvent && (!item.eventDate && !item.data && !item.eventDateText);
  const followUpDate = item.nextFollowUpAt || item.proximo_retorno;
  const followUpDue = followUpDate ? opportunityDate({ atualizado_em: followUpDate }).getTime() <= now.getTime() : false;
  const hotWithoutReturn = item.leadTemperature === "quente" && (!followUpDate || followUpDue);
  const newOrderStopped = isOrder && ["novo", "nova"].includes(normalizeStatus(status)) && stalledHours >= 2;
  const waitingClient = ["orcamento_enviado", "aguardando_resposta", "retornado"].includes(normalizeStatus(status)) && stalledHours >= 2;
  const risk = stalledHours >= 24 && (isQuote || isEvent || isWhatsapp || !["fechado", "perdido", "entregue", "cancelado"].includes(normalizeStatus(status)));
  const importantEvent = isEvent && !["fechado", "perdido", "cancelado"].includes(normalizeStatus(status));
  const alert = opportunityAlert({ item, type, stalledHours, isQuote, isEvent, isOrder, isWhatsapp });
  let bucket = "";
  let action = "";
  if (hotWithoutReturn || eventIncomplete || newOrderStopped || (isQuote && stalledHours >= 2) || isWhatsapp) {
    bucket = "acao_agora";
    action = eventIncomplete ? "Pedir data completa do evento" : newOrderStopped ? "Confirmar pedido e prazo no WhatsApp" : "Retomar contato agora";
  } else if (waitingClient) {
    bucket = "aguardando_cliente";
    action = "Enviar retorno leve cobrando resposta";
  } else if (risk) {
    bucket = "risco_perda";
    action = "Fazer tentativa final de recuperacao";
  } else if (importantEvent) {
    bucket = "eventos_importantes";
    action = "Acompanhar fechamento do evento";
  } else {
    return null;
  }
  return {
    id: `${type}:${item.id}`,
    recordId: item.id,
    recordType: type,
    bucket,
    nome: item.nome || item.nome_evento || item.customerName || "Sem nome",
    telefone: item.whatsapp || item.phone || "",
    operacao: item.operacao || item.operation || "",
    origem: item.origem || item.source || "",
    tipo: opportunityTypeLabel({ item, type, isQuote, isEvent, isOrder, isWhatsapp }),
    pipeline,
    status,
    tempoParado: formatStalledTime(stalledMs),
    tempoParadoHoras: Math.round(stalledHours * 10) / 10,
    ultimaInteracao: stalledSince.toISOString(),
    prioridade: alert.prioridade,
    prioridadePeso: alert.peso,
    alerta: alert.tipo,
    acaoSugerida: item.proximo_passo || action,
    mensagemSugerida: suggestedOpportunityMessage(item, alert.tipo, action),
    whatsappUrl: buildWaUrl(item.whatsapp || businessNumber, suggestedOpportunityMessage(item, alert.tipo, action)),
    arquivado: Boolean(item.oportunidade_arquivada),
    valorEstimado: Number(item.valorEstimado || item.valor_estimado) || 0,
    valorFechado: Number(item.valorFechado || item.valor_fechado) || 0,
    motivoPerda: item.motivoPerda || item.motivo_perda || "",
    dados_faltantes: missing
  };
}

function opportunityAlert({ item = {}, type = "", stalledHours = 0, isQuote = false, isEvent = false, isOrder = false, isWhatsapp = false }) {
  if (isEvent && stalledHours >= 72) return { prioridade: "ALTA", peso: 1, tipo: "evento_parado_72h" };
  if (isQuote && stalledHours >= 48) return { prioridade: "ALTA", peso: 1, tipo: "orcamento_parado_48h" };
  if ((isWhatsapp || type === "lead") && stalledHours >= 24) return { prioridade: "ALTA", peso: 1, tipo: "lead_parado_24h" };
  if (isOrder && stalledHours >= 2) return { prioridade: "ALTA", peso: 1, tipo: "pedido_novo_parado" };
  if (type === "lead" && stalledHours >= 2) return { prioridade: "MEDIA", peso: 2, tipo: "lead_parado_2h" };
  if (item.leadTemperature === "quente") return { prioridade: "MEDIA", peso: 2, tipo: "primeiro_retorno" };
  return { prioridade: "BAIXA", peso: 3, tipo: "acompanhamento" };
}

function opportunityDate(item = {}) {
  const value = item.ultimo_contato_em || item.atualizado_em || item.updatedAt || item.criado_em || item.createdAt || item.criadoEm;
  const date = value ? new Date(value) : new Date(0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function isQuoteOpportunity(item = {}) {
  const text = normalizeText(`${item.status} ${item.status_comercial} ${item.pipeline} ${item.interesse} ${item.tipo}`);
  return text.includes("orcamento") || text.includes("festa_xeriffe") || text.includes("food_truck_evento");
}

function opportunityTypeLabel({ item, type, isQuote, isEvent, isOrder, isWhatsapp }) {
  if (item.tipo) return item.tipo;
  if (isWhatsapp) return "whatsapp";
  if (isOrder) return "pedido";
  if (isQuote) return "orcamento";
  if (isEvent) return "evento";
  return type;
}

function suggestedOpportunityMessage(item = {}, alertType = "", action = "") {
  const name = item.nome || item.nome_evento || "tudo bem";
  const summary = item.observacoes || item.mensagem_original || item.mensagem_cliente || item.nome_evento || "";
  const messages = {
    primeiro_retorno: `Buenas, ${name}! Vi teu contato aqui pelo SamBah e ja estou seguindo contigo. Me confirma rapidinho como posso te ajudar agora?`,
    lead_parado_2h: `Buenas, ${name}! Passando para nao deixar teu atendimento parado. Quer seguir por pedido, evento ou orcamento?`,
    lead_parado_24h: `Buenas, ${name}! Ainda consigo te ajudar com isso? Se fizer sentido, me responde aqui que eu retomo teu atendimento agora.`,
    orcamento_parado_48h: `Buenas, ${name}! Passando para ver se seguimos com teu orcamento. Quer que eu ajuste algo para fechar melhor?`,
    evento_parado_72h: `Buenas, ${name}! Teu evento ainda esta no meu radar. Me confirma data, local e numero de pessoas para eu fechar o encaminhamento.`,
    pedido_novo_parado: `Buenas, ${name}! Teu pedido ficou registrado aqui. Posso confirmar os itens e seguir com a producao?`,
    cliente_recorrente: `Buenas, ${name}! Vi teu historico aqui no SamBah. Quer repetir algum pedido ou organizar um novo atendimento?`
  };
  return messages[alertType] || `Buenas, ${name}! ${action || "Passando pelo SamBah para seguir teu atendimento."}${summary ? `\n\nResumo: ${summary}` : ""}`;
}

function formatStalledTime(ms = 0) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(0, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

function parseOpportunityId(value = "") {
  const [type, ...rest] = String(value || "").split(":");
  const recordId = rest.join(":");
  if (!type || !recordId) return null;
  return { type, recordId };
}

function opportunityCollection(type = "") {
  return {
    lead: "leads",
    atendimento: "atendimentos",
    evento: "eventos",
    precomanda: "precomandas"
  }[type] || "";
}

function mergeHistory(existing = [], incoming = []) {
  const base = Array.isArray(existing) ? existing : [];
  const next = Array.isArray(incoming) ? incoming : [];
  return [...base, ...next];
}

function formatItems(items = []) {
  if (!Array.isArray(items) || !items.length) return "";
  return items.map((item) => `${item.quantity || item.qty || 1}x ${item.name || item.product || item.productId || item.produto || ""}`).join("; ");
}

function normalizeItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    nome: item.nome || item.name || item.product || item.productId || "",
    quantidade: Number(item.quantidade || item.quantity || item.qty) || 1,
    observacao: item.observacao || item.note || item.notes || ""
  }));
}

function mergeTags(existing = [], incoming = []) {
  const base = Array.isArray(existing) ? existing : [];
  const next = Array.isArray(incoming) ? incoming : [incoming].filter(Boolean);
  return [...new Set([...base, ...next].filter(Boolean).map(String))];
}

function cleanPatch(input = {}) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function isInsanoSiteOrigin(item = {}) {
  const text = normalizeText([
    item.source,
    item.origem,
    item.channel,
    item.canal,
    item.page,
    item.campaign
  ].filter(Boolean).join(" "));
  return text.includes("insanofoodtruck.com.br");
}

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function stripBom(value = "") {
  return value.replace(/^\uFEFF/, "");
}
