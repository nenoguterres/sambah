import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { generatePerolaPosts } from "./services/perolaPostEngine.js";
import { generateContentFromIdea } from "./services/contentGenerationService.js";
import { buildMesaReceivedCommercialAction } from "./mesaService.js";
import {
  buildDemographicTimingContext,
  buildModuleTimingPayloads
} from "./ecosystemTimingService.js";

const defaultDataDir = fileURLToPath(new URL("../data/", import.meta.url));
const defaultGeneratedMediaDir = fileURLToPath(new URL("../public/generated/perola/", import.meta.url));

const DEFAULT_FILES = {
  posts: "perola-posts.json",
  campaigns: "perola-campaigns.json",
  postDrafts: "perola-post-drafts.json",
  alerts: "perola-alerts.json",
  audit: "perola-audit.json",
  rules: "perola-rules.json",
  salesDaily: "perola-sales-daily.json",
  mesaDailyReport: "perola-mesa-daily-report.json",
  ecosystemSignals: "perola-ecosystem-signals.json",
  campaignDistributions: "perola-campaign-distributions.json",
  channels: "perola-channels.json",
  mesaInteractions: "perola-mesa-interactions.json"
};

const PUBLISH_MODES = new Set(["manual", "assistido", "automatico"]);
const STATUSES = new Set(["draft", "review", "pending_approval", "scheduled", "waiting_human", "published", "archived"]);
const POST_ENGINE_DRAFT_STATUSES = new Set(["draft", "pending_review", "approved", "rejected", "scheduled"]);
const CAMPAIGN_STATUSES = new Set(["draft", "active", "approved", "rejected", "distributed", "paused", "completed", "archived"]);
const CAMPAIGN_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const ALERT_WINDOW_MINUTES = 30;
const BACKUP_KEEP = 5;

const DEFAULT_RULES = [
  {
    id: "instagram-real-enabled",
    name: "Instagram real habilitado",
    active: true,
    type: "integration_guard",
    description: "Nesta fase o Perola pode publicar no Instagram Business conectado quando houver legenda e URL HTTPS publica da midia.",
    createdAt: "2026-06-20T00:00:00.000Z"
  },
  {
    id: "human-review-before-posting",
    name: "Revisao humana antes de publicar",
    active: true,
    type: "workflow",
    description: "Todo conteudo planejado precisa passar por aprovacao interna antes de qualquer futura publicacao.",
    createdAt: "2026-06-17T00:00:00.000Z"
  },
  {
    id: "promo-kachurrasco",
    name: "Giro Kachurrasco",
    active: true,
    type: "promotional_rule",
    product: "Kachurrasco",
    minimumLeftover: 8,
    lowSalePercent: 35,
    authorizedDiscountPercent: 15,
    allowedNetworks: ["instagram", "facebook", "whatsapp-status"],
    publishMode: "assistido",
    suggestedTime: "18:00",
    requiresApproval: false,
    humanDeadlineMinutes: 20,
    autoPublishIfExpired: true,
    createdAt: "2026-06-17T00:00:00.000Z"
  }
];

const DEFAULT_POSTS = [
  {
    id: "perola-demo-001",
    title: "Chamada do dia",
    caption: "Post interno de exemplo para validar o fluxo local do Perola.",
    networks: ["instagram"],
    campaign: "validacao-interna",
    scheduledAt: "",
    publishMode: "manual",
    approved: false,
    status: "draft",
    humanDeadlineMinutes: 15,
    autoPublishIfExpired: false,
    publishedAt: "",
    publishedBy: "",
    autoPublished: false,
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z"
  }
];

const DEFAULT_ALERTS = [];
const DEFAULT_POST_DRAFTS = [];
const DEFAULT_ECOSYSTEM_SIGNALS = [];
const DEFAULT_CAMPAIGN_DISTRIBUTIONS = [];
const DEFAULT_MESA_INTERACTIONS = [];
const ECOSYSTEM_DISTRIBUTION_MODULES = ["mesa_xeriffe", "sambah_2", "sambah_pay", "perola"];
const DEFAULT_CHANNELS = [
  {
    id: "instagram-reels",
    name: "Instagram Reels",
    type: "instagram",
    enabled: true,
    mode: "real",
    formatsSupported: ["vertical_video", "short_caption"],
    requiresApproval: true,
    dailyLimit: 8,
    distributedToday: 0,
    lastDistributedAt: ""
  },
  {
    id: "instagram-feed",
    name: "Instagram Feed",
    type: "instagram",
    enabled: true,
    mode: "real",
    formatsSupported: ["image", "carousel", "caption"],
    requiresApproval: true,
    dailyLimit: 6,
    distributedToday: 0,
    lastDistributedAt: ""
  },
  {
    id: "tiktok",
    name: "TikTok",
    type: "tiktok",
    enabled: true,
    mode: "simulated",
    formatsSupported: ["vertical_video", "short_caption"],
    requiresApproval: true,
    dailyLimit: 5,
    distributedToday: 0,
    lastDistributedAt: ""
  },
  {
    id: "facebook-reels",
    name: "Facebook Reels",
    type: "facebook",
    enabled: true,
    mode: "simulated",
    formatsSupported: ["vertical_video", "short_caption"],
    requiresApproval: true,
    dailyLimit: 6,
    distributedToday: 0,
    lastDistributedAt: ""
  },
  {
    id: "whatsapp-status",
    name: "WhatsApp Status",
    type: "whatsapp",
    enabled: true,
    mode: "simulated",
    formatsSupported: ["status_text", "image", "short_video"],
    requiresApproval: true,
    dailyLimit: 12,
    distributedToday: 0,
    lastDistributedAt: ""
  },
  {
    id: "youtube-shorts",
    name: "YouTube Shorts",
    type: "youtube",
    enabled: true,
    mode: "simulated",
    formatsSupported: ["vertical_video", "short_caption"],
    requiresApproval: true,
    dailyLimit: 4,
    distributedToday: 0,
    lastDistributedAt: ""
  }
];

export async function getPerolaEcosystemSignals({ dataDir = defaultDataDir } = {}) {
  const filePath = join(dataDir, DEFAULT_FILES.ecosystemSignals);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeEcosystemSignal) : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function getPerolaHumanApprovalQueue({ dataDir = defaultDataDir } = {}) {
  const filePath = join(dataDir, "perola-human-approval-queue.json");
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.slice().sort((left, right) => {
      const leftTime = Date.parse(left?.createdAt || "") || 0;
      const rightTime = Date.parse(right?.createdAt || "") || 0;
      return rightTime - leftTime;
    });
  } catch {
    return [];
  }
}

export async function getPerolaHumanApprovalById(id, options = {}) {
  const targetId = text(id);
  if (!targetId) return null;
  const items = await getPerolaHumanApprovalQueue(options);
  return items.find((item) => text(item?.id) === targetId) || null;
}

export async function simulateSendPerolaActionToHuman(actionId, { dataDir = defaultDataDir } = {}) {
  const targetId = text(actionId);
  if (!targetId) return null;

  const filePath = join(dataDir, "perola-human-approval-queue.json");
  try {
    const raw = await readFile(filePath, "utf8");
    const items = JSON.parse(raw || "[]");
    if (!Array.isArray(items)) return null;

    const index = items.findIndex((item) => text(item?.id) === targetId);
    if (index < 0) return null;

    const updatedAt = new Date().toISOString();
    const item = {
      ...items[index],
      status: "sent_to_owner_whatsapp",
      sentToHumanVia: "sambah_whatsapp_simulated",
      updatedAt
    };
    item.simulatedWhatsappPayload = {
      to: "owner_whatsapp_simulated",
      from: "sambah",
      title: text(item.title),
      message: "Perola encontrou uma oportunidade. Tu quer aprovar essa acao?",
      options: [
        "1 - Aprovar",
        "2 - Editar",
        "3 - Rejeitar",
        "4 - Ver detalhes"
      ]
    };

    items[index] = item;
    await writeFile(filePath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
    return item;
  } catch {
    return null;
  }
}

export async function registerPerolaHumanDecision(actionId, decision, responseText = null, { dataDir = defaultDataDir } = {}) {
  const targetId = text(actionId);
  const humanDecision = text(decision);
  const acceptedDecisions = new Set(["approved", "edit_requested", "rejected", "details_requested"]);
  if (!targetId || !acceptedDecisions.has(humanDecision)) return null;

  const filePath = join(dataDir, "perola-human-approval-queue.json");
  try {
    const raw = await readFile(filePath, "utf8");
    const items = JSON.parse(raw || "[]");
    if (!Array.isArray(items)) return null;

    const index = items.findIndex((item) => text(item?.id) === targetId);
    if (index < 0) return null;

    const timestamp = new Date().toISOString();
    const item = {
      ...items[index],
      humanDecision,
      humanResponse: responseText ? text(responseText) : null,
      updatedAt: timestamp
    };

    if (humanDecision === "approved") {
      item.status = "owner_approved";
      item.approvedAt = timestamp;
    } else if (humanDecision === "rejected") {
      item.status = "owner_rejected";
      item.rejectedAt = timestamp;
    } else if (humanDecision === "edit_requested") {
      item.status = "owner_requested_edit";
    } else if (humanDecision === "details_requested") {
      item.status = "owner_requested_details";
    }

    items[index] = item;
    await writeFile(filePath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
    return item;
  } catch {
    return null;
  }
}

const DEFAULT_SALES_DAILY = [
  {
    id: "2026-06-17-manual",
    date: "2026-06-17",
    channel: "manual",
    orders: 0,
    revenue: 0,
    notes: "Registro local inicial do Perola.",
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z"
  }
];

const DEFAULT_MESA_DAILY_REPORT = [
  {
    id: "2026-06-17-kachurrasco",
    date: "2026-06-17",
    product: "Kachurrasco",
    initialStock: 30,
    producedToday: 0,
    sold: 6,
    previousLeftover: 0,
    finalStock: 24,
    normalPrice: 28
  }
];

const SIGNAL_FUNNEL_STAGES = {
  stock_low_sales: "converter",
  new_product: "atrair",
  customer_question: "qualificar",
  negative_comment: "remodelar",
  inactive_customer: "encantar",
  high_sales_product: "converter"
};

export function classifySignalFunnelStage(signal = {}) {
  const type = text(signal.type || "");
  const funnelStage = SIGNAL_FUNNEL_STAGES[type] || "qualificar";
  return {
    funnelStage,
    reason: SIGNAL_FUNNEL_STAGES[type]
      ? `Sinal ${type} direcionado para etapa ${funnelStage}.`
      : "Tipo de sinal nao mapeado; encaminhado para qualificacao inicial."
  };
}

export function generateReadyMaterial(campaign = {}) {
  const title = text(campaign.title || "Oferta do dia");
  const productName = text(campaign.productName || title || "essa novidade");
  const funnelStage = text(campaign.funnelStage || "converter");
  const objective = text(campaign.objective || "");
  const cta = buildReadyMaterialCta(funnelStage, productName);
  const context = objective ? ` ${objective}` : "";

  return {
    postText: `Tu quer algo bom pra hoje? ${productName} ta no radar do Perola.${context} Teu pedido pode sair no ponto, sem enrolacao. ${cta}`,
    whatsappText: `Opa, temos ${productName} pra ti hoje. Se curtir, chama no Whats que a gente te ajuda a fechar o pedido.`,
    statusText: `${productName} passando no teu radar. Chama no Whats e garante o teu.`,
    cta,
    visualBriefing: `Visual premium e direto para ${productName}: fundo escuro, detalhe perola, produto em destaque, texto curto com chamada no tu e botao "chama no Whats".`
  };
}

export class PerolaService {
  constructor({ dataDir = defaultDataDir, workhubService = null, publisher = null, now = () => new Date() } = {}) {
    this.dataDir = dataDir;
    this.workhubService = workhubService;
    this.publisher = publisher;
    this.now = now;
    this.files = Object.fromEntries(
      Object.entries(DEFAULT_FILES).map(([key, name]) => [key, join(this.dataDir, name)])
    );
    this.collectionQueues = new Map();
    this.ready = this.initializeStorage();
  }

  async initializeStorage() {
    await Promise.all([
      this.ensureCollectionFile("posts", DEFAULT_POSTS),
      this.ensureCollectionFile("campaigns", []),
      this.ensureCollectionFile("postDrafts", DEFAULT_POST_DRAFTS),
      this.ensureCollectionFile("alerts", DEFAULT_ALERTS),
      this.ensureCollectionFile("audit", []),
      this.ensureCollectionFile("rules", DEFAULT_RULES),
      this.ensureCollectionFile("salesDaily", DEFAULT_SALES_DAILY),
      this.ensureCollectionFile("mesaDailyReport", DEFAULT_MESA_DAILY_REPORT),
      this.ensureCollectionFile("ecosystemSignals", DEFAULT_ECOSYSTEM_SIGNALS),
      this.ensureCollectionFile("campaignDistributions", DEFAULT_CAMPAIGN_DISTRIBUTIONS),
      this.ensureCollectionFile("channels", DEFAULT_CHANNELS),
      this.ensureCollectionFile("mesaInteractions", DEFAULT_MESA_INTERACTIONS)
    ]);
  }

  async summary() {
    await this.processScheduledPublications();
    const [posts, rules, salesDaily, audit, alerts, giro, postEngineDrafts, campaigns] = await Promise.all([
      this.listPosts(),
      this.listRules(),
      this.listSalesDaily(),
      this.listAudit({ limit: 10 }),
      this.alerts(),
      this.giroPreview(),
      this.listPostEngineDrafts(),
      this.listCampaigns()
    ]);
    const generated = generatePerolaPosts();
    const totalRevenue = salesDaily.items.reduce((sum, item) => sum + normalizeMoney(item.revenue), 0);
    const publisherStatus = this.publisherStatus();
    return {
      ok: true,
      module: "perola",
      mode: "local-json",
      socialNetworksConnected: publisherStatus.enabled,
      instagram: publisherStatus,
      totals: {
        posts: posts.total,
        drafts: posts.items.filter((item) => item.status === "draft").length,
        scheduled: posts.items.filter((item) => item.status === "scheduled").length,
        pendingApproval: posts.items.filter((item) => item.status === "pending_approval").length,
        waitingHuman: posts.items.filter((item) => item.status === "waiting_human").length,
        published: posts.items.filter((item) => item.status === "published").length,
        approved: posts.items.filter((item) => item.approved).length,
        rules: rules.total,
        activeRules: rules.items.filter((item) => item.active).length,
        salesDays: salesDaily.total,
        revenue: totalRevenue,
        audit: audit.total,
        alerts: alerts.total,
        postEngineDrafts: postEngineDrafts.total,
        postEngineApproved: postEngineDrafts.drafts.filter((item) => item.status === "approved").length,
        postEngineScheduled: postEngineDrafts.drafts.filter((item) => item.status === "scheduled").length,
        postEngineIdeas: generated.stats.ideasGenerated,
        postEngineInsights: generated.stats.insightsGenerated,
        campaigns: campaigns.total
      },
      giro,
      recentPosts: posts.items.slice(0, 5),
      alerts: alerts.items,
      recentAudit: audit.items
    };
  }

  async operationalStatus() {
    const [channels, posts, rules, giroReport, history] = await Promise.all([
      this.listChannels(),
      this.normalizedPosts(),
      this.promotionalRules(),
      this.listMesaDailyReport(),
      this.campaignHistory()
    ]);
    const publisherStatus = this.publisherStatus();
    const publisherEnabled = publisherStatus.enabled;
    const enabledChannels = channels.items.filter((channel) => channel.enabled !== false);
    const automaticRules = rules.filter((rule) => rule.publishMode === "automatico" || rule.autoPublishIfExpired);
    const automaticPosts = posts.filter((post) => post.publishMode === "automatico" || post.autoPublishIfExpired);
    const publicationMode = !enabledChannels.length
      ? "Desativada"
      : automaticRules.length || automaticPosts.length
        ? "Automatica"
        : "Manual";

    return {
      ok: true,
      mode: publisherEnabled ? "Operacional" : "Simulado",
      dataSource: "JSON teste",
      dataSourceDetail: giroReport.total
        ? "Relatorio Mesa local em perola-mesa-daily-report.json"
        : "Sem relatorio Mesa real conectado",
      publication: publicationMode,
      publicationDetail: publisherEnabled
        ? `Instagram Business @${publisherStatus.account || "conta conectada"} habilitado para publicacao real`
        : "Publicacao real desativada; acoes ficam locais/simuladas",
      instagram: publisherStatus,
      mesaIntegration: {
        type: "local_json_bridge",
        realTime: false,
        pendingInteractions: Number(history.totals?.mesaInteractions || 0),
        receiver: "receivePerolaCommercialAction"
      },
      checks: {
        publisherEnabled,
        enabledChannels: enabledChannels.length,
        automaticRules: automaticRules.length,
        automaticPosts: automaticPosts.length,
        giroReportItems: giroReport.total
      }
    };
  }

  async listPosts({ status = "", network = "", channel = "" } = {}) {
    await this.processScheduledPublications();
    const [posts, campaigns] = await Promise.all([
      this.normalizedPosts(),
      this.readCollection("campaigns", [])
    ]);
    const targetNetwork = network || channel;
    const filtered = attachCampaignNames(posts, campaigns)
      .filter((item) => !status || item.status === status)
      .filter((item) => !targetNetwork || item.networks.includes(targetNetwork))
      .sort(sortByScheduleThenUpdated);
    return { ok: true, total: filtered.length, items: filtered };
  }

  async createPost(input = {}) {
    const timestamp = this.timestamp();
    const campaignValidation = await this.validateCampaignLink(input.campaignId ?? input.campanhaId);
    if (!campaignValidation.ok) return campaignValidation;
    const post = normalizePost(input, timestamp);
    const posts = await this.normalizedPosts();
    posts.unshift(post);
    await this.writeCollection("posts", posts);
    await this.recordAudit("perola_publication_created", "Publicacao local criada", {
      postId: post.id,
      status: post.status,
      publishMode: post.publishMode,
      campaignId: post.campaignId,
      networks: post.networks
    });
    if (post.campaignId) {
      await this.recordAudit("perola_publication_campaign_linked", "Publicacao local criada com campanha vinculada", {
        postId: post.id,
        campaignId: post.campaignId,
        status: post.status
      });
    }
    return { ok: true, post };
  }

  async listPostEngineDrafts() {
    const [drafts, campaigns] = await Promise.all([
      this.readCollection("postDrafts", DEFAULT_POST_DRAFTS),
      this.readCollection("campaigns", [])
    ]);
    const items = attachCampaignNames(drafts.map(normalizePostEngineDraft), campaigns).sort(sortByCreatedAt);
    return { success: true, ok: true, total: items.length, drafts: items };
  }

  async createPostEngineDraft(idea = {}, context = {}) {
    const timestamp = this.timestamp();
    const campaignValidation = await this.validateCampaignLink(idea.campaignId ?? idea.campanhaId);
    if (!campaignValidation.ok) return campaignValidation;
    const content = generateContentFromIdea(idea);
    const draft = normalizePostEngineDraft({
      id: `post-engine-draft-${timestamp}-${crypto.randomUUID().slice(0, 8)}`,
      ideaType: idea.type,
      title: content.title,
      body: content.mainText,
      cta: content.cta,
      hashtags: content.hashtags,
      score: idea.score,
      relevanceScore: idea.relevanceScore,
      salesPotentialScore: idea.salesPotentialScore,
      urgencyScore: idea.urgencyScore,
      campaignId: idea.campaignId ?? idea.campanhaId,
      source: "perola-post-engine",
      status: "draft",
      createdAt: timestamp,
      updatedAt: timestamp
    });
    await this.mutateCollection("postDrafts", DEFAULT_POST_DRAFTS, (drafts) => {
      drafts.unshift(draft);
    });
    await this.recordAudit("perola_post_draft_created", "Draft interno criado pelo Motor de Posts", {
      source: "perola-post-engine",
      draftId: draft.id,
      ideaType: draft.ideaType,
      status: draft.status,
      campaignId: draft.campaignId,
      actorRole: context.actorRole || "SYSTEM"
    });
    if (draft.campaignId) {
      await this.recordAudit("perola_post_draft_campaign_linked", "Draft interno criado com campanha vinculada", {
        source: "perola-post-engine",
        draftId: draft.id,
        campaignId: draft.campaignId,
        actorRole: context.actorRole || "SYSTEM"
      });
    }
    await this.createWorkhubTask({
      sourceModule: "perola",
      targetModule: "workhub",
      title: `Sugestão do Pérola: ${draft.title}`,
      description: draft.body || "Draft interno criado pelo Motor de Posts.",
      priority: "medium"
    });
    return { success: true, draft };
  }

  async generatePostEnginePreview() {
    const data = generatePerolaPosts();
    await this.recordAudit("perola_insight_generated", "Insights do Motor de Posts gerados", {
      source: "perola-post-engine",
      insightsGenerated: data.stats.insightsGenerated,
      ideasGenerated: data.stats.ideasGenerated
    });
    return { success: true, data };
  }

  async updatePostEngineDraft(id, input = {}, context = {}) {
    let previousStatus = "";
    let previousCampaignId = "";
    let patch;
    let normalized;
    const campaignValidation = await this.validateCampaignLink(input.campaignId ?? input.campanhaId, { allowMissingField: true, input });
    if (!campaignValidation.ok) return campaignValidation;
    const mutation = await this.mutateCollection("postDrafts", DEFAULT_POST_DRAFTS, (drafts) => {
      const draft = drafts.find((item) => item.id === id);
      if (!draft) return { success: false, ok: false, error: "draft_not_found", statusCode: 404, skipWrite: true };
      previousStatus = draft.status;
      previousCampaignId = text(draft.campaignId || "");
      patch = buildPostEngineDraftPatch(input, this.timestamp());
      if (patch.status && !POST_ENGINE_DRAFT_STATUSES.has(patch.status)) {
        return { success: false, ok: false, error: "invalid_draft_status", message: "Status invalido para draft do Motor de Posts.", statusCode: 400, skipWrite: true };
      }
      if (patch.status && patch.status !== previousStatus && !isAllowedDraftTransition(previousStatus, patch.status)) {
        return { success: false, ok: false, error: "invalid_draft_transition", message: `Transicao ${previousStatus} -> ${patch.status} nao permitida.`, statusCode: 400, skipWrite: true };
      }
      if (patch.status === "scheduled" && !patch.scheduledAt && !draft.scheduledAt) {
        return { success: false, ok: false, error: "scheduled_at_required", message: "Agendamento exige scheduledAt.", statusCode: 400, skipWrite: true };
      }
      Object.assign(draft, patch);
      normalized = normalizePostEngineDraft(draft);
      drafts[drafts.findIndex((item) => item.id === id)] = normalized;
      return { success: true };
    });
    if (!mutation.success) return mutation;
    await this.recordDraftAudit(previousStatus, normalized, patch, context);
    if (has(patch, "campaignId") && patch.campaignId !== previousCampaignId) {
      await this.recordAudit("perola_post_draft_campaign_changed", "Draft interno mudou de campanha", {
        source: "perola-post-engine",
        draftId: normalized.id,
        previousCampaignId,
        campaignId: normalized.campaignId,
        actorRole: context.actorRole || "SYSTEM"
      });
    }
    return { success: true, ok: true, draft: normalized };
  }

  async deletePostEngineDraft(id, context = {}) {
    let draft;
    const mutation = await this.mutateCollection("postDrafts", DEFAULT_POST_DRAFTS, (drafts) => {
      const index = drafts.findIndex((item) => item.id === id);
      if (index < 0) return { success: false, ok: false, error: "draft_not_found", statusCode: 404, skipWrite: true };
      [draft] = drafts.splice(index, 1);
      return { success: true };
    });
    if (!mutation.success) return mutation;
    await this.recordAudit("perola_post_draft_updated", "Draft interno removido do Motor de Posts", {
      source: "perola-post-engine",
      draftId: draft.id,
      action: "delete",
      actorRole: context.actorRole || "SYSTEM"
    });
    return { success: true, ok: true, draft: normalizePostEngineDraft(draft) };
  }

  async postEngineCalendar() {
    const drafts = await this.listPostEngineDrafts();
    const nowMs = this.now().getTime();
    const items = drafts.drafts
      .filter((draft) => draft.status === "scheduled" || draft.scheduledAt)
      .map((draft) => {
        const scheduledMs = Date.parse(draft.scheduledAt || "");
        const calendarStatus = Number.isFinite(scheduledMs)
          ? scheduledMs < nowMs ? "expired" : scheduledMs - nowMs <= 30 * 60000 ? "ready" : "scheduled"
          : "scheduled";
        return { ...draft, calendarStatus };
      });
    return { success: true, ok: true, total: items.length, items };
  }

  async postEngineStats() {
    const [drafts, calendar] = await Promise.all([
      this.listPostEngineDrafts(),
      this.postEngineCalendar()
    ]);
    const generated = generatePerolaPosts();
    return {
      success: true,
      ok: true,
      draftsCreated: drafts.total,
      draftsApproved: drafts.drafts.filter((draft) => draft.status === "approved").length,
      draftsScheduled: drafts.drafts.filter((draft) => draft.status === "scheduled").length,
      ideasGenerated: generated.stats.ideasGenerated,
      insightsGenerated: generated.stats.insightsGenerated,
      calendarTotal: calendar.total
    };
  }

  async runIntelligentGiro(context = {}) {
    const generated = generatePerolaPosts();
    const opportunity = generated.postIdeas.find((idea) => idea.type === "estoque_parado")
      || generated.postIdeas.find((idea) => idea.type === "urgencia")
      || generated.postIdeas[0];
    const result = await this.createPostEngineDraft({
      ...opportunity,
      type: opportunity.type === "estoque_parado" ? "promocao" : opportunity.type,
      description: opportunity.idea
    }, context);
    await this.recordAudit("perola_insight_generated", "Giro Inteligente gerou insight e draft simulado", {
      source: "perola-giro-inteligente",
      draftId: result.draft.id,
      ideaType: result.draft.ideaType,
      insightsGenerated: generated.stats.insightsGenerated,
      actorRole: context.actorRole || "SYSTEM"
    });
    await this.createWorkhubTask({
      sourceModule: "perola",
      targetModule: "workhub",
      title: `Insight do Pérola: ${opportunity.title || opportunity.type || "Giro Inteligente"}`,
      description: opportunity.idea || opportunity.description || "Insight automático gerado pelo Pérola.",
      priority: "high"
    });
    return { success: true, ok: true, draft: result.draft, insight: opportunity, flow: ["relatorio", "insights", "ideias", "draft", "aprovacao", "agendamento"] };
  }

  async updatePostStatus(id, status) {
    if (!STATUSES.has(status)) return { ok: false, error: "invalid_status", statusCode: 400 };
    const posts = await this.normalizedPosts();
    const post = posts.find((item) => item.id === id);
    if (!post) return { ok: false, error: "post_not_found", statusCode: 404 };
    post.status = status;
    post.updatedAt = this.timestamp();
    await this.writeCollection("posts", posts);
    await this.recordAudit("perola_publication_status_changed", "Status de publicacao local alterado", { postId: post.id, status });
    return { ok: true, post };
  }

  async updatePost(id, input = {}) {
    const campaignValidation = await this.validateCampaignLink(input.campaignId ?? input.campanhaId, { allowMissingField: true, input });
    if (!campaignValidation.ok) return campaignValidation;
    const posts = await this.normalizedPosts();
    const index = posts.findIndex((item) => item.id === id);
    if (index < 0) return { ok: false, error: "post_not_found", statusCode: 404 };
    const previousCampaignId = text(posts[index].campaignId || "");
    const patch = buildPostPatch(input, this.timestamp());
    posts[index] = normalizePost({ ...posts[index], ...patch, id: posts[index].id, createdAt: posts[index].createdAt }, posts[index].createdAt || this.timestamp());
    await this.writeCollection("posts", posts);
    if (has(patch, "campaignId") && patch.campaignId !== previousCampaignId) {
      await this.recordAudit("perola_publication_campaign_changed", "Publicacao local mudou de campanha", {
        postId: posts[index].id,
        previousCampaignId,
        campaignId: posts[index].campaignId,
        status: posts[index].status
      });
    }
    return { ok: true, post: posts[index] };
  }

  async approvePost(id, approved = true) {
    const posts = await this.normalizedPosts();
    const post = posts.find((item) => item.id === id);
    if (!post) return { ok: false, error: "post_not_found", statusCode: 404 };
    post.approved = Boolean(approved);
    post.status = post.approved && post.scheduledAt ? "scheduled" : post.status === "published" ? "published" : "draft";
    post.updatedAt = this.timestamp();
    await this.writeCollection("posts", posts);
    await this.recordAudit("perola_publication_approval_changed", "Aprovacao de publicacao local alterada", { postId: post.id, approved: post.approved });
    return { ok: true, post };
  }

  async publishPost(id, { source = "human" } = {}) {
    const posts = await this.normalizedPosts();
    const post = posts.find((item) => item.id === id);
    if (!post) return { ok: false, error: "post_not_found", statusCode: 404 };
    if (post.status === "published") return { ok: true, post, alreadyPublished: true };
    const timestamp = this.timestamp();
    const shouldPublishInstagram = post.networks.includes("instagram") && this.publisher?.isEnabled?.();
    let publication = null;
    if (shouldPublishInstagram) {
      if (!post.caption) {
        post.lastPublishError = "Informe a legenda antes de publicar no Instagram.";
        post.lastPublishAttemptAt = timestamp;
        post.updatedAt = timestamp;
        await this.writeCollection("posts", posts);
        return { ok: false, error: "instagram_caption_required", message: post.lastPublishError, statusCode: 422, post };
      }
      try {
        publication = await this.publisher.publish(post);
      } catch (error) {
        post.lastPublishError = text(error.message || "Falha ao publicar no Instagram");
        post.lastPublishAttemptAt = timestamp;
        post.updatedAt = timestamp;
        await this.writeCollection("posts", posts);
        await this.recordAudit("perola_instagram_publish_failed", "Publicacao real no Instagram falhou", {
          source: post.source || "perola",
          postId: post.id,
          error: error.code || "instagram_publish_failed"
        });
        return { ok: false, error: error.code || "instagram_publish_failed", message: post.lastPublishError, statusCode: error.statusCode || 502, post };
      }
    }
    post.status = "published";
    post.approved = true;
    post.publishedAt = timestamp;
    post.publishedBy = publication ? "perola-instagram" : source === "automatic" ? "perola-simulador" : "humano";
    post.autoPublished = source === "automatic";
    post.publishProvider = publication?.provider || "simulated";
    post.instagramAccount = publication?.account || post.instagramAccount;
    post.instagramCreationId = publication?.creationId || post.instagramCreationId;
    post.instagramMediaId = publication?.mediaId || post.instagramMediaId;
    post.instagramPermalink = publication?.permalink || post.instagramPermalink;
    post.lastPublishError = "";
    post.lastPublishAttemptAt = timestamp;
    post.updatedAt = timestamp;
    await this.writeCollection("posts", posts);
    await this.recordAudit(publication ? "perola_instagram_published" : source === "automatic" ? "perola_publication_auto_published" : "perola_publication_published", publication ? "Publicacao enviada ao Instagram" : source === "automatic" ? "Publicacao simulada automaticamente" : "Publicacao simulada por humano", {
      source: post.source || "perola",
      postId: post.id,
      productId: post.productId,
      productName: post.productName,
      reportDate: post.reportDate,
      discountPercent: post.discountPercent,
      ruleId: post.ruleId,
      publishMode: post.publishMode,
      networks: post.networks,
      scheduledAt: post.scheduledAt,
      publishProvider: post.publishProvider,
      instagramMediaId: post.instagramMediaId,
      instagramPermalink: post.instagramPermalink
    });
    return { ok: true, post };
  }

  async alerts() {
    await this.processScheduledPublications();
    const posts = await this.normalizedPosts();
    const nowMs = this.now().getTime();
    const items = posts
      .filter((post) => post.scheduledAt && post.status !== "published" && post.status !== "archived")
      .map((post) => buildAlert(post, nowMs))
      .filter(Boolean)
      .sort((left, right) => left.minutesToSchedule - right.minutesToSchedule);
    await this.writeCollection("alerts", items);
    return { ok: true, total: items.length, items };
  }

  async processScheduledPublications() {
    const posts = await this.normalizedPosts({ persistMigration: true });
    const nowMs = this.now().getTime();
    let changed = false;
    const auditEvents = [];
    const realPublishIds = [];

    for (const post of posts) {
      if (!post.scheduledAt || post.status === "published" || post.status === "archived" || post.status === "pending_approval") continue;
      const scheduledMs = Date.parse(post.scheduledAt);
      if (!Number.isFinite(scheduledMs)) continue;

      if (post.approved && scheduledMs <= nowMs && post.status === "scheduled") {
        post.status = post.publishMode === "assistido" ? "waiting_human" : post.status;
        if (post.publishMode === "automatico") {
          if (post.networks.includes("instagram") && this.publisher?.isEnabled?.()) {
            realPublishIds.push(post.id);
          } else {
            markPublished(post, this.timestamp(), "automatic");
            auditEvents.push(["perola_publication_auto_published", "Publicacao automatica simulada no horario", post]);
          }
        } else {
          auditEvents.push(["perola_publication_waiting_human", "Publicacao assistida aguardando humano", post]);
        }
        changed = true;
      }

      const deadlineMs = scheduledMs + (post.humanDeadlineMinutes * 60000);
      if (
        post.publishMode === "assistido"
        && post.autoPublishIfExpired
        && post.approved
        && nowMs >= deadlineMs
        && post.status !== "published"
      ) {
        if (post.networks.includes("instagram") && this.publisher?.isEnabled?.()) {
          realPublishIds.push(post.id);
        } else {
          markPublished(post, this.timestamp(), "automatic");
          auditEvents.push(["perola_publication_auto_published_after_deadline", "Publicacao assistida expirada e publicada automaticamente", post]);
        }
        changed = true;
      }
    }

    if (changed) await this.writeCollection("posts", posts);
    for (const [type, message, post] of auditEvents) {
      await this.recordAudit(type, message, {
        source: post.source || "perola",
        postId: post.id,
        productId: post.productId,
        productName: post.productName,
        reportDate: post.reportDate,
        discountPercent: post.discountPercent,
        ruleId: post.ruleId,
        publishMode: post.publishMode,
        scheduledAt: post.scheduledAt,
        humanDeadlineMinutes: post.humanDeadlineMinutes
      });
    }
    for (const postId of new Set(realPublishIds)) {
      await this.publishPost(postId, { source: "automatic" });
    }
    return { ok: true, changed };
  }

  async listRules() {
    const rules = await this.readCollection("rules", DEFAULT_RULES);
    return { ok: true, total: rules.length, items: rules };
  }

  async listCampaigns() {
    const [campaigns, posts, postDrafts] = await Promise.all([
      this.readCollection("campaigns", []),
      this.normalizedPosts(),
      this.readCollection("postDrafts", DEFAULT_POST_DRAFTS)
    ]);
    const normalizedCampaigns = campaigns.map(normalizeCampaign);
    const counters = campaignDraftCounters(normalizedCampaigns, posts, postDrafts.map(normalizePostEngineDraft));
    const items = normalizedCampaigns.map((campaign, originalIndex) => {
      const draftCounters = counters.get(campaign.id) || emptyDraftCounters();
      return {
        ...campaign,
        originalIndex,
        draftsTotal: draftCounters.total,
        draftsApproved: draftCounters.approved,
        draftsScheduled: draftCounters.scheduled,
        campaignScore: campaignScore(draftCounters),
        draftCounters,
        commercialInsight: campaignCommercialInsight(draftCounters)
      };
    }).sort(sortCampaignsByDraftRanking).map((campaign, index) => {
      const { originalIndex, ...item } = campaign;
      return { ...item, campaignRank: index + 1 };
    });
    await this.ensureCampaignCommercialInsightTasks(items);
    return { success: true, ok: true, total: items.length, items };
  }

  async ensureCampaignCommercialInsightTasks(campaigns = []) {
    if (!this.workhubService?.createTask || !this.workhubService?.listTasks) return;
    const campaignsWithInsight = campaigns.filter((campaign) => campaign.commercialInsight?.type === "high_activity");
    if (!campaignsWithInsight.length) return;

    const existing = await this.workhubService.listTasks({
      sourceModule: "perola",
      targetModule: "workhub",
      limit: 500
    });
    const existingItems = Array.isArray(existing?.items) ? existing.items : [];

    for (const campaign of campaignsWithInsight) {
      const marker = `campanha: ${campaign.id}`;
      const alreadyRegistered = existingItems.some((task) => (
        task.title === "Insight de alta atividade"
        && String(task.description || "").includes("tipo: insight_comercial")
        && String(task.description || "").includes(marker)
      ));
      if (alreadyRegistered) continue;

      const task = await this.createWorkhubTask({
        sourceModule: "perola",
        targetModule: "workhub",
        title: "Insight de alta atividade",
        description: `tipo: insight_comercial | ${marker} | ${campaign.commercialInsight.message}`,
        priority: "high"
      });
      if (task) existingItems.push(task);
    }
  }

  async validateCampaignLink(campaignId, { allowMissingField = false, input = {} } = {}) {
    if (allowMissingField && !has(input, "campaignId") && !has(input, "campanhaId")) return { ok: true, success: true, campaignId: "" };
    const normalizedCampaignId = text(campaignId || "");
    if (!normalizedCampaignId) return { ok: true, success: true, campaignId: "" };
    const campaigns = await this.readCollection("campaigns", []);
    const exists = campaigns.some((item) => normalizeCampaign(item).id === normalizedCampaignId);
    if (exists) return { ok: true, success: true, campaignId: normalizedCampaignId };
    return {
      ok: false,
      success: false,
      error: "campaign_not_found",
      message: `Campanha ${normalizedCampaignId} nao encontrada no Perola.`,
      statusCode: 400
    };
  }

  async createCampaign(input = {}, context = {}) {
    const validation = validateCampaignInput(input);
    if (!validation.ok) return validation;
    const timestamp = this.timestamp();
    const campaign = normalizeCampaign({
      ...input,
      id: input.id || `campaign-${crypto.randomUUID()}`,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    let duplicate = false;
    await this.mutateCollection("campaigns", [], (campaigns) => {
      duplicate = campaigns.some((item) => item.id === campaign.id);
      if (duplicate) return { skipWrite: true };
      campaigns.unshift(campaign);
      return { success: true };
    });
    if (duplicate) return { success: false, ok: false, error: "campaign_id_exists", message: "Ja existe uma campanha com este id.", statusCode: 409 };
    await this.recordAudit("perola_campaign_created", "Campanha local criada", {
      campaignId: campaign.id,
      status: campaign.status,
      priority: campaign.priority,
      actorRole: context.actorRole || "SYSTEM"
    });
    await this.createWorkhubTask({
      sourceModule: "perola",
      targetModule: "workhub",
      title: `Campanha do Pérola: ${campaign.title}`,
      description: campaign.description || campaign.objective || "Campanha criada no Pérola.",
      priority: campaign.priority || "medium"
    });
    return { success: true, ok: true, campaign };
  }

  async createCampaignPublication(campaignId, input = {}, context = {}) {
    const normalizedCampaignId = text(campaignId || "");
    if (!normalizedCampaignId) {
      return { success: false, ok: false, error: "campaign_id_required", message: "ID da campanha obrigatorio.", statusCode: 400 };
    }
    const campaigns = await this.readCollection("campaigns", []);
    const campaign = campaigns.map(normalizeCampaign).find((item) => item.id === normalizedCampaignId);
    if (!campaign) {
      return { success: false, ok: false, error: "campaign_not_found", message: `Campanha ${normalizedCampaignId} nao encontrada no Perola.`, statusCode: 404 };
    }

    const mediaUrl = text(input.mediaUrl || campaign.mediaUrl || "");
    const mediaType = normalizeMediaType(input.mediaType || campaign.mediaType);
    const caption = text(input.caption || campaign.caption || campaign.readyMaterial?.postText || campaign.description || campaign.objective || campaign.title);
    const networks = normalizeNetworks(input.networks || ["instagram"]);
    const validation = validateCampaignPublicationMedia({ mediaUrl, networks });
    if (!validation.ok) return validation;

    const result = await this.createPost({
      title: text(input.title || campaign.title),
      caption,
      networks,
      campaign: campaign.title,
      campaignId: campaign.id,
      mediaUrl,
      mediaType,
      publishMode: input.publishMode || "manual",
      status: input.status || "draft",
      approved: normalizeBoolean(input.approved ?? false)
    });
    if (!result.ok) return result;
    await this.recordAudit("perola_campaign_publication_created", "Publicacao criada a partir da campanha", {
      campaignId: campaign.id,
      postId: result.post.id,
      mediaType,
      networks,
      actorRole: context.actorRole || "SYSTEM"
    });
    return { success: true, ok: true, campaign, post: result.post };
  }

  async generateCampaignFromSignal(signalId) {
    const normalizedSignalId = text(signalId || "");
    if (!normalizedSignalId) {
      return { success: false, ok: false, error: "signal_id_required", message: "ID do sinal obrigatorio.", statusCode: 400 };
    }

    const signals = await this.readCollection("ecosystemSignals", DEFAULT_ECOSYSTEM_SIGNALS);
    const signal = signals.find((item) => text(item.id) === normalizedSignalId);
    if (!signal) {
      return { success: false, ok: false, error: "signal_not_found", message: `Sinal ${normalizedSignalId} nao encontrado no Perola.`, statusCode: 404 };
    }

    const classification = classifySignalFunnelStage(signal);
    const timestamp = this.timestamp();
    const campaignInput = {
      id: `campaign-${safeId(signal.id)}`,
      sourceSignalId: signal.id,
      title: text(signal.title || `Campanha ${signal.productName || signal.id}`),
      productName: text(signal.productName || ""),
      funnelStage: classification.funnelStage,
      objective: buildCampaignObjectiveFromSignal(signal, classification),
      status: "draft",
      priority: CAMPAIGN_PRIORITIES.has(text(signal.priority)) ? text(signal.priority) : "medium",
      description: text(signal.description || ""),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    campaignInput.readyMaterial = generateReadyMaterial(campaignInput);

    const result = await this.createCampaign(campaignInput, { actorRole: "SYSTEM", source: "perola-ecosystem-signal" });
    if (!result.success) return result;
    return {
      success: true,
      ok: true,
      signal,
      classification,
      campaign: result.campaign
    };
  }

  async updateCampaign(id, input = {}, context = {}) {
    const validation = validateCampaignInput(input, { partial: true });
    if (!validation.ok) return validation;
    let campaign;
    const result = await this.mutateCollection("campaigns", [], (campaigns) => {
      const index = campaigns.findIndex((item) => item.id === id);
      if (index < 0) return { success: false, ok: false, error: "campaign_not_found", statusCode: 404, skipWrite: true };
      const candidate = { ...campaigns[index], ...campaignPatch(input), id, updatedAt: this.timestamp() };
      const periodValidation = validateCampaignPeriod(candidate);
      if (!periodValidation.ok) return { ...periodValidation, skipWrite: true };
      campaign = normalizeCampaign(candidate);
      campaigns[index] = campaign;
      return { success: true };
    });
    if (!result.success) return result;
    await this.recordAudit("perola_campaign_updated", "Campanha local atualizada", {
      campaignId: campaign.id,
      status: campaign.status,
      priority: campaign.priority,
      changedFields: Object.keys(input),
      actorRole: context.actorRole || "SYSTEM"
    });
    return { success: true, ok: true, campaign };
  }

  async approveCampaign(id, context = {}) {
    const timestamp = this.timestamp();
    let campaign;
    const result = await this.mutateCollection("campaigns", [], (campaigns) => {
      const index = campaigns.findIndex((item) => item.id === id);
      if (index < 0) return { success: false, ok: false, error: "campaign_not_found", statusCode: 404, skipWrite: true };
      campaign = normalizeCampaign({
        ...campaigns[index],
        status: "approved",
        approvedAt: timestamp,
        approvedBy: "human_operator",
        updatedAt: timestamp
      });
      campaigns[index] = campaign;
      return { success: true };
    });
    if (!result.success) return result;
    await this.recordAudit("perola_campaign_approved", "Campanha local aprovada por operador humano", {
      campaignId: campaign.id,
      approvedAt: campaign.approvedAt,
      approvedBy: campaign.approvedBy,
      actorRole: context.actorRole || "SYSTEM"
    });
    return { success: true, ok: true, campaign };
  }

  async rejectCampaign(id, input = {}, context = {}) {
    const timestamp = this.timestamp();
    let campaign;
    const result = await this.mutateCollection("campaigns", [], (campaigns) => {
      const index = campaigns.findIndex((item) => item.id === id);
      if (index < 0) return { success: false, ok: false, error: "campaign_not_found", statusCode: 404, skipWrite: true };
      campaign = normalizeCampaign({
        ...campaigns[index],
        status: "rejected",
        rejectedAt: timestamp,
        rejectedReason: text(input.rejectedReason || input.reason || ""),
        updatedAt: timestamp
      });
      campaigns[index] = campaign;
      return { success: true };
    });
    if (!result.success) return result;
    await this.recordAudit("perola_campaign_rejected", "Campanha local rejeitada por operador humano", {
      campaignId: campaign.id,
      rejectedAt: campaign.rejectedAt,
      rejectedReason: campaign.rejectedReason,
      actorRole: context.actorRole || "SYSTEM"
    });
    return { success: true, ok: true, campaign };
  }

  async completeCampaignPackage(id, input = {}, context = {}) {
    const timestamp = this.timestamp();
    let campaign;
    const campaignMutation = await this.mutateCollection("campaigns", [], (campaigns) => {
      const index = campaigns.findIndex((item) => item.id === id);
      if (index < 0) return { success: false, ok: false, error: "campaign_not_found", statusCode: 404, skipWrite: true };
      campaign = normalizeCampaign({
        ...campaigns[index],
        status: "distributed",
        approvedAt: campaigns[index].approvedAt || timestamp,
        approvedBy: campaigns[index].approvedBy || "perola_autonomo_local",
        distributedAt: timestamp,
        distributedChannelIds: ["instagram-feed", "instagram-reels"],
        updatedAt: timestamp
      });
      campaigns[index] = campaign;
      return { success: true };
    });
    if (!campaignMutation.success) return campaignMutation;

    await mkdir(defaultGeneratedMediaDir, { recursive: true });
    const filename = `${safeId(campaign.id)}-${timestamp.replace(/[^0-9]/g, "")}.svg`;
    const mediaPath = join(defaultGeneratedMediaDir, filename);
    const mediaUrl = `/generated/perola/${filename}`;
    const caption = buildAutonomousCampaignCaption(campaign, input);
    await writeFile(mediaPath, buildCampaignSvg(campaign, caption), "utf8");

    const post = normalizePost({
      id: `post-${safeId(campaign.id)}-${timestamp}`,
      title: campaign.title || "Campanha Perola",
      caption,
      networks: ["instagram"],
      campaignId: campaign.id,
      campaign: campaign.title,
      mediaUrl,
      mediaType: "IMAGE",
      publishMode: "automatico",
      approved: true,
      status: "published",
      publishedAt: timestamp,
      publishedBy: "perola-simulador",
      autoPublished: true,
      publishProvider: "simulated",
      source: "perola-campaign-autonomous",
      productName: campaign.productName,
      createdAt: timestamp,
      updatedAt: timestamp
    }, timestamp);

    const posts = await this.normalizedPosts();
    posts.unshift(post);
    await this.writeCollection("posts", posts);
    await this.recordAudit("perola_campaign_package_generated", "Campanha ganhou arte, legenda e publicacao simulada", {
      campaignId: campaign.id,
      postId: post.id,
      mediaUrl,
      actorRole: context.actorRole || "SYSTEM",
      mode: "local_simulated"
    });
    await this.recordAudit("perola_publication_auto_published", "Publicacao de campanha simulada automaticamente", {
      source: post.source,
      postId: post.id,
      campaignId: campaign.id,
      networks: post.networks,
      publishProvider: post.publishProvider,
      mediaUrl
    });
    return {
      success: true,
      ok: true,
      campaign,
      post,
      media: {
        url: mediaUrl,
        type: "image/svg+xml",
        filename
      },
      mode: "local_simulated"
    };
  }

  async listChannels() {
    const channels = await this.readCollection("channels", DEFAULT_CHANNELS);
    const today = this.timestamp().slice(0, 10);
    const items = channels.map((channel) => normalizeChannelForToday(channel, today, this.publisherStatus()));
    if (JSON.stringify(channels) !== JSON.stringify(items)) {
      await this.writeCollection("channels", items);
    }
    return { success: true, ok: true, total: items.length, items };
  }

  async updateChannel(channelId, input = {}, context = {}) {
    const normalizedChannelId = text(channelId || "");
    let channel;
    const result = await this.mutateCollection("channels", DEFAULT_CHANNELS, (channels) => {
      const index = channels.findIndex((item) => text(item.id) === normalizedChannelId);
      if (index < 0) return { success: false, ok: false, error: "channel_not_found", statusCode: 404, skipWrite: true };
      channel = normalizeChannel({
        ...channels[index],
        ...channelPatch(input)
      }, this.publisherStatus());
      channels[index] = channel;
      return { success: true };
    });
    if (!result.success) return result;
    await this.recordAudit("perola_channel_updated", "Canal local de distribuicao atualizado", {
      channelId: channel.id,
      enabled: channel.enabled,
      actorRole: context.actorRole || "SYSTEM"
    });
    return { success: true, ok: true, channel };
  }

  async distributeApprovedCampaign(campaignId, input = {}, context = {}) {
    const normalizedCampaignId = text(campaignId || "");
    if (!normalizedCampaignId) {
      return { success: false, ok: false, error: "campaign_id_required", message: "ID da campanha obrigatorio.", statusCode: 400 };
    }

    const campaigns = await this.readCollection("campaigns", []);
    const campaignIndex = campaigns.findIndex((item) => normalizeCampaign(item).id === normalizedCampaignId);
    const campaign = campaignIndex >= 0 ? normalizeCampaign(campaigns[campaignIndex]) : null;
    if (!campaign) {
      return { success: false, ok: false, error: "campaign_not_found", message: `Campanha ${normalizedCampaignId} nao encontrada no Perola.`, statusCode: 404 };
    }
    if (campaign.status !== "approved") {
      return {
        success: false,
        ok: false,
        error: "campaign_not_approved",
        message: "Somente campanhas aprovadas podem ficar disponiveis para o ecossistema.",
        statusCode: 409
      };
    }

    const timestamp = this.timestamp();
    const today = timestamp.slice(0, 10);
    const requestedChannelIds = normalizeChannelIds(input.channelIds || input.channels || input.sentToChannels);
    let selectedChannels = [];
    const channelResult = await this.mutateCollection("channels", DEFAULT_CHANNELS, (channels) => {
      const normalizedChannels = channels.map((channel) => normalizeChannelForToday(channel, today));
      const channelIds = requestedChannelIds.length
        ? requestedChannelIds
        : normalizedChannels.filter((channel) => channel.enabled).map((channel) => channel.id);
      if (!channelIds.length) {
        return { success: false, ok: false, error: "distribution_channels_required", message: "Selecione ao menos um canal ativo.", statusCode: 400, skipWrite: true };
      }
      for (const channelId of channelIds) {
        const channel = normalizedChannels.find((item) => item.id === channelId);
        if (!channel) {
          return { success: false, ok: false, error: "channel_not_found", message: `Canal ${channelId} nao encontrado.`, statusCode: 404, skipWrite: true };
        }
        if (!channel.enabled) {
          return { success: false, ok: false, error: "channel_disabled", message: `Canal ${channel.name} esta desativado.`, statusCode: 400, skipWrite: true };
        }
        if (Number(channel.distributedToday || 0) >= Number(channel.dailyLimit || 0)) {
          return { success: false, ok: false, error: "channel_daily_limit_reached", message: `Limite diario atingido para ${channel.name}.`, statusCode: 400, skipWrite: true };
        }
      }
      selectedChannels = channelIds.map((channelId) => {
        const index = normalizedChannels.findIndex((item) => item.id === channelId);
        const updated = {
          ...normalizedChannels[index],
          distributedToday: Number(normalizedChannels[index].distributedToday || 0) + 1,
          lastDistributedAt: timestamp
        };
        normalizedChannels[index] = updated;
        return updated;
      });
      channels.splice(0, channels.length, ...normalizedChannels);
      return { success: true };
    });
    if (!channelResult.success) return channelResult;

    const distribution = {
      id: `distribution-${safeId(campaign.id)}-${timestamp.replace(/[^0-9]/g, "")}`,
      campaignId: campaign.id,
      sentToModules: [...ECOSYSTEM_DISTRIBUTION_MODULES],
      sentToChannels: selectedChannels.map((channel) => channel.id),
      channels: selectedChannels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        mode: channel.mode,
        formatsSupported: channel.formatsSupported
      })),
      createdAt: timestamp
    };
    const mesaInteraction = buildMesaInteractionFromCampaign(campaign, distribution, timestamp);
    if (mesaInteraction) {
      distribution.mesaInteractionId = mesaInteraction.id;
      distribution.mesaReceiver = {
        target: "Mesa Xeriffe",
        receiver: "receivePerolaCommercialAction",
        status: mesaInteraction.status
      };
      await this.mutateCollection("mesaInteractions", DEFAULT_MESA_INTERACTIONS, (interactions) => {
        interactions.unshift(mesaInteraction);
        return { success: true };
      });
    }
    await this.mutateCollection("campaignDistributions", DEFAULT_CAMPAIGN_DISTRIBUTIONS, (distributions) => {
      distributions.unshift(distribution);
      return { success: true };
    });
    const distributedCampaign = normalizeCampaign({
      ...campaigns[campaignIndex],
      status: "distributed",
      distributedAt: timestamp,
      distributedChannelIds: distribution.sentToChannels,
      updatedAt: timestamp
    });
    campaigns[campaignIndex] = distributedCampaign;
    await this.writeCollection("campaigns", campaigns);
    await this.recordAudit("perola_campaign_distribution_registered", "Material aprovado ficou disponivel para o ecossistema", {
      campaignId: campaign.id,
      distributionId: distribution.id,
      sentToModules: distribution.sentToModules,
      sentToChannels: distribution.sentToChannels,
      mesaInteractionId: mesaInteraction?.id || "",
      actorRole: context.actorRole || "SYSTEM"
    });
    if (mesaInteraction) {
      await this.recordAudit("perola_mesa_interaction_registered", "Acao comercial aprovada ficou pronta para o receptor do Mesa Xeriffe", {
        campaignId: campaign.id,
        distributionId: distribution.id,
        mesaInteractionId: mesaInteraction.id,
        receiver: mesaInteraction.receiver,
        mesaStatus: mesaInteraction.payload.mesaStatus,
        actorRole: context.actorRole || "SYSTEM"
      });
    }
    return { success: true, ok: true, distribution };
  }

  async deleteCampaign(id, context = {}) {
    let campaign;
    const result = await this.mutateCollection("campaigns", [], (campaigns) => {
      const index = campaigns.findIndex((item) => item.id === id);
      if (index < 0) return { success: false, ok: false, error: "campaign_not_found", statusCode: 404, skipWrite: true };
      [campaign] = campaigns.splice(index, 1);
      return { success: true };
    });
    if (!result.success) return result;
    await this.recordAudit("perola_campaign_deleted", "Campanha local removida", {
      campaignId: campaign.id,
      actorRole: context.actorRole || "SYSTEM"
    });
    return { success: true, ok: true, campaign: normalizeCampaign(campaign) };
  }

  async promotionalRules() {
    const rules = await this.readCollection("rules", DEFAULT_RULES);
    return rules
      .filter((rule) => rule.type === "promotional_rule" && rule.active !== false)
      .map(normalizePromotionalRule);
  }

  async upsertRule(input = {}) {
    const timestamp = this.timestamp();
    const rules = await this.readCollection("rules", DEFAULT_RULES);
    const id = safeId(input.id || input.name || "rule");
    const existing = rules.find((item) => item.id === id);
    const rule = {
      id,
      name: text(input.name || existing?.name || "Regra Perola"),
      active: Boolean(input.active ?? existing?.active ?? true),
      type: text(input.type || existing?.type || "workflow"),
      description: text(input.description || existing?.description || ""),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp
    };
    if (rule.type === "promotional_rule") {
      Object.assign(rule, normalizePromotionalRule({ ...existing, ...input, id: rule.id, name: rule.name, active: rule.active }));
      rule.createdAt = existing?.createdAt || timestamp;
      rule.updatedAt = timestamp;
    }
    if (existing) Object.assign(existing, rule);
    else rules.push(rule);
    await this.writeCollection("rules", rules);
    await this.recordAudit("perola_rule_saved", "Regra local salva", { ruleId: rule.id, active: rule.active });
    return { ok: true, rule };
  }

  async updateRule(ruleId, input = {}) {
    const rules = await this.readCollection("rules", DEFAULT_RULES);
    const index = rules.findIndex((item) => item.id === ruleId);
    if (index < 0) return { ok: false, error: "rule_not_found", statusCode: 404 };
    const existing = rules[index];
    if (existing.type !== "promotional_rule") {
      return { ok: false, error: "rule_not_editable", message: "Somente regras promocionais do Perola Giro sao editaveis nesta tela.", statusCode: 400 };
    }

    const patch = buildPromotionalRulePatch(input);
    const validation = validatePromotionalRulePatch(patch);
    if (!validation.ok) return validation;

    const updated = normalizePromotionalRule({ ...existing, ...patch, id: existing.id, name: existing.name, type: "promotional_rule" });
    updated.createdAt = existing.createdAt || this.timestamp();
    updated.updatedAt = this.timestamp();
    rules[index] = { ...existing, ...updated };
    await this.writeCollection("rules", rules);
    await this.recordAudit("perola_giro_rule_updated", "Regra promocional do Perola Giro alterada", {
      source: "perola_giro_rules",
      ruleId: updated.id,
      productId: updated.productId,
      product: updated.product,
      changes: Object.keys(patch)
    });
    return { ok: true, rule: rules[index] };
  }

  async listSalesDaily() {
    const salesDaily = await this.readCollection("salesDaily", DEFAULT_SALES_DAILY);
    const items = salesDaily.sort((left, right) => String(right.date).localeCompare(String(left.date)));
    return { ok: true, total: items.length, items };
  }

  async listMesaDailyReport() {
    const report = await this.readCollection("mesaDailyReport", DEFAULT_MESA_DAILY_REPORT);
    const items = report.map(normalizeMesaReportItem).sort((left, right) => String(right.date).localeCompare(String(left.date)));
    return { ok: true, total: items.length, items };
  }

  async upsertMesaDailyReport(input = {}) {
    const itemsInput = Array.isArray(input.items) ? input.items : [input];
    const report = await this.readCollection("mesaDailyReport", DEFAULT_MESA_DAILY_REPORT);
    const saved = [];
    for (const rawItem of itemsInput) {
      const item = normalizeMesaReportItem(rawItem);
      const existing = report.find((entry) => entry.id === item.id);
      if (existing) Object.assign(existing, item);
      else report.unshift(item);
      saved.push(item);
    }
    await this.writeCollection("mesaDailyReport", report);
    await this.recordAudit("perola_giro_report_saved", "Relatorio diario do Mesa salvo no Perola Giro", { total: saved.length });
    return { ok: true, total: saved.length, items: saved };
  }

  async giroPreview() {
    const [report, rules] = await Promise.all([this.listMesaDailyReport(), this.promotionalRules()]);
    const opportunities = report.items
      .map((item) => this.evaluateGiroOpportunity(item, rules))
      .filter(Boolean);
    return {
      ok: true,
      reportTotal: report.total,
      rulesTotal: rules.length,
      opportunitiesTotal: opportunities.length,
      opportunities
    };
  }

  async runGiro() {
    const [report, rules] = await Promise.all([this.listMesaDailyReport(), this.promotionalRules()]);
    const posts = await this.normalizedPosts();
    const created = [];
    const skipped = [];

    for (const item of report.items) {
      const opportunity = this.evaluateGiroOpportunity(item, rules);
      if (!opportunity) {
        skipped.push({ product: item.product, date: item.date, reason: "no_opportunity" });
        continue;
      }
      const existing = posts.find((post) => post.source === "mesa_daily_report" && post.productId === opportunity.productId && post.reportDate === opportunity.date && post.ruleId === opportunity.rule.id);
      if (existing) {
        skipped.push({ product: item.product, date: item.date, reason: "already_created", postId: existing.id });
        continue;
      }
      const timestamp = this.timestamp();
      const scheduledAt = buildSuggestedDateTime(item.date, opportunity.rule.suggestedTime);
      const approved = !opportunity.rule.requiresApproval;
      const status = opportunity.rule.requiresApproval ? "pending_approval" : scheduledAt ? "scheduled" : "draft";
      const post = normalizePost({
        id: `giro-${opportunity.sourceId}`,
        title: `Giro do dia: ${item.product}`,
        caption: buildGauchoPromoCaption(item, opportunity.rule),
        networks: opportunity.rule.allowedNetworks,
        campaign: "Pérola Giro",
        source: "mesa_daily_report",
        productId: opportunity.productId,
        productName: item.product,
        reportDate: item.date,
        discountPercent: opportunity.rule.authorizedDiscountPercent,
        ruleId: opportunity.rule.id,
        scheduledAt,
        publishMode: opportunity.rule.publishMode,
        approved,
        status,
        humanDeadlineMinutes: opportunity.rule.humanDeadlineMinutes,
        autoPublishIfExpired: opportunity.rule.autoPublishIfExpired,
        giroSourceId: opportunity.sourceId,
        giroProduct: item.product,
        giroDiscountPercent: opportunity.rule.authorizedDiscountPercent
      }, timestamp);
      posts.unshift(post);
      created.push(post);
    }

    if (created.length) await this.writeCollection("posts", posts);
    await this.recordAudit("perola_giro_processed", "Perola Giro processou relatorio diario do Mesa", {
      source: "mesa_daily_report",
      created: created.length,
      skipped: skipped.length,
      postIds: created.map((post) => post.id),
      ruleIds: created.map((post) => post.ruleId).filter(Boolean)
    });
    if (created.length) {
      await this.createWorkhubTask({
        sourceModule: "mesa",
        targetModule: "perola",
        title: `Mesa sugeriu ${created.length} ação(ões) para o Pérola`,
        description: `Pérola Giro criou ${created.length} oportunidade(s) a partir do relatório Mesa.`,
        priority: "high"
      });
    }
    return { ok: true, created: created.length, skipped: skipped.length, posts: created, skippedItems: skipped };
  }

  evaluateGiroOpportunity(item, rules) {
    const rule = rules.find((candidate) => sameProduct(candidate.product, item.product));
    if (!rule) return null;
    const available = item.initialStock + item.producedToday + item.previousLeftover;
    const salePercent = available > 0 ? (item.sold / available) * 100 : 0;
    const leftoverHigh = item.finalStock >= rule.minimumLeftover;
    const saleLow = salePercent <= rule.lowSalePercent;
    if (!leftoverHigh || !saleLow) return null;
    return {
      sourceId: safeId(`${item.date}-${item.product}`),
      productId: item.productId,
      product: item.product,
      date: item.date,
      salePercent: Math.round(salePercent * 100) / 100,
      finalStock: item.finalStock,
      normalPrice: item.normalPrice,
      rule
    };
  }

  async upsertSalesDaily(input = {}) {
    const timestamp = this.timestamp();
    const date = normalizeDate(input.date);
    const salesDaily = await this.readCollection("salesDaily", DEFAULT_SALES_DAILY);
    const id = safeId(`${date}-${input.channel || "manual"}`);
    const existing = salesDaily.find((item) => item.id === id);
    const item = {
      id,
      date,
      channel: text(input.channel || existing?.channel || "manual"),
      orders: Math.max(0, Number(input.orders ?? existing?.orders ?? 0) || 0),
      revenue: normalizeMoney(input.revenue ?? existing?.revenue ?? 0),
      notes: text(input.notes || existing?.notes || ""),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp
    };
    if (existing) Object.assign(existing, item);
    else salesDaily.unshift(item);
    await this.writeCollection("salesDaily", salesDaily);
    await this.recordAudit("perola_sales_daily_saved", "Venda diaria local salva", { date: item.date, channel: item.channel });
    return { ok: true, item };
  }

  async listAudit({ limit = 50 } = {}) {
    const audit = await this.readCollection("audit", []);
    const items = audit.sort(sortByCreatedAt).slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200));
    return { ok: true, total: audit.length, items };
  }

  async campaignHistory() {
    const [campaigns, distributions, mesaInteractions] = await Promise.all([
      this.readCollection("campaigns", []),
      this.readCollection("campaignDistributions", DEFAULT_CAMPAIGN_DISTRIBUTIONS),
      this.readCollection("mesaInteractions", DEFAULT_MESA_INTERACTIONS)
    ]);
    const normalizedCampaigns = campaigns.map(normalizeCampaign).sort(sortByCreatedAt);
    const normalizedDistributions = distributions.map(normalizeCampaignDistribution).sort(sortByCreatedAt);
    const normalizedMesaInteractions = mesaInteractions.map(normalizeMesaInteraction).sort(sortByCreatedAt);
    return {
      success: true,
      ok: true,
      createdCampaigns: normalizedCampaigns,
      approvedCampaigns: normalizedCampaigns.filter((campaign) => campaign.status === "approved" || Boolean(campaign.approvedAt)),
      rejectedCampaigns: normalizedCampaigns.filter((campaign) => campaign.status === "rejected" || Boolean(campaign.rejectedAt)),
      distributedCampaigns: normalizedDistributions,
      mesaInteractions: normalizedMesaInteractions,
      totals: {
        created: normalizedCampaigns.length,
        approved: normalizedCampaigns.filter((campaign) => campaign.status === "approved" || Boolean(campaign.approvedAt)).length,
        rejected: normalizedCampaigns.filter((campaign) => campaign.status === "rejected" || Boolean(campaign.rejectedAt)).length,
        distributed: normalizedDistributions.length,
        mesaInteractions: normalizedMesaInteractions.length
      }
    };
  }

  async pendingMesaInteractions({ limit = 50 } = {}) {
    await this.backfillMesaInteractionsFromDistributions();
    const interactions = await this.readCollection("mesaInteractions", DEFAULT_MESA_INTERACTIONS);
    const items = interactions
      .map(normalizeMesaInteraction)
      .filter((interaction) => interaction.status === "ready_for_mesa_receiver")
      .sort(sortByCreatedAt)
      .slice(0, Math.min(Math.max(Number(limit) || 50, 1), 100));
    return {
      success: true,
      ok: true,
      total: items.length,
      receiver: "receivePerolaCommercialAction",
      items
    };
  }

  async backfillMesaInteractionsFromDistributions() {
    const [campaigns, distributions] = await Promise.all([
      this.readCollection("campaigns", []),
      this.readCollection("campaignDistributions", DEFAULT_CAMPAIGN_DISTRIBUTIONS)
    ]);
    const campaignMap = new Map(campaigns.map(normalizeCampaign).map((campaign) => [campaign.id, campaign]));
    await this.mutateCollection("mesaInteractions", DEFAULT_MESA_INTERACTIONS, (interactions) => {
      const existingDistributionIds = new Set(interactions.map((interaction) => text(interaction.distributionId || "")));
      let added = 0;
      for (const distribution of distributions.map(normalizeCampaignDistribution)) {
        if (existingDistributionIds.has(distribution.id)) continue;
        if (!(distribution.sentToModules || []).includes("mesa_xeriffe")) continue;
        const campaign = campaignMap.get(distribution.campaignId);
        if (!campaign) continue;
        const interaction = buildMesaInteractionFromCampaign(campaign, distribution, distribution.createdAt || this.timestamp());
        if (!interaction) continue;
        interactions.unshift(interaction);
        existingDistributionIds.add(distribution.id);
        added += 1;
      }
      return { success: true, skipWrite: added === 0 };
    });
  }

  async recordAudit(type, message, context = {}) {
    const event = {
      id: crypto.randomUUID(),
      type,
      message,
      source: context.source || "perola",
      context,
      createdAt: this.timestamp()
    };
    await this.mutateCollection("audit", [], (audit) => {
      audit.unshift(event);
      audit.splice(500);
    });
    return event;
  }

  async createWorkhubTask(input = {}) {
    if (!this.workhubService?.createTask) return null;
    return this.workhubService.createTask({
      ...input,
      status: "pending"
    });
  }

  async recordDraftAudit(previousStatus, draft, patch = {}, context = {}) {
    let type = "perola_post_draft_updated";
    let message = "Draft interno atualizado pelo Motor de Posts";
    if (patch.status === "approved" && previousStatus !== "approved") {
      type = "perola_post_approved";
      message = "Draft interno aprovado";
    } else if (patch.status === "rejected" && previousStatus !== "rejected") {
      type = "perola_post_rejected";
      message = "Draft interno rejeitado";
    } else if (patch.status === "scheduled" && previousStatus !== "scheduled") {
      type = "perola_post_scheduled";
      message = "Draft interno agendado";
    }
    await this.recordAudit(type, message, {
      source: "perola-post-engine",
      draftId: draft.id,
      ideaType: draft.ideaType,
      previousStatus,
      status: draft.status,
      scheduledAt: draft.scheduledAt || "",
      actorRole: context.actorRole || "SYSTEM",
      changedFields: Object.keys(patch)
    });
  }

  async normalizedPosts({ persistMigration = false } = {}) {
    const rawPosts = await this.readCollection("posts", DEFAULT_POSTS);
    const timestamp = this.timestamp();
    const posts = rawPosts.map((post) => normalizePost(post, post.createdAt || timestamp));
    if (persistMigration && JSON.stringify(rawPosts) !== JSON.stringify(posts)) {
      await this.writeCollection("posts", posts);
    }
    return posts;
  }

  async readCollection(key, fallback) {
    if (this.ready) await this.ready;
    await mkdir(dirname(this.files[key]), { recursive: true });
    try {
      const raw = await readFile(this.files[key], "utf8");
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (error) {
      if (error instanceof SyntaxError) return this.recoverCollection(key, fallback);
      if (error.code !== "ENOENT") throw error;
      await this.writeCollectionUnlocked(key, fallback);
      return fallback;
    }
  }

  async mutateCollection(key, fallback, mutator) {
    return this.withCollectionLock(key, async () => {
      const items = await this.readCollection(key, fallback);
      const result = await mutator(items) || { success: true };
      if (!result.skipWrite) await this.writeCollectionUnlocked(key, items);
      return result;
    });
  }

  async withCollectionLock(key, operation) {
    const previous = this.collectionQueues.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.collectionQueues.set(key, next);
    try {
      return await next;
    } finally {
      if (this.collectionQueues.get(key) === next) this.collectionQueues.delete(key);
    }
  }

  async writeCollection(key, items) {
    return this.withCollectionLock(key, () => this.writeCollectionUnlocked(key, items));
  }

  async writeCollectionUnlocked(key, items) {
    if (this.ready) await this.ready;
    await mkdir(dirname(this.files[key]), { recursive: true });
    const payload = `${JSON.stringify(items, null, 2)}\n`;
    await this.backupCollection(key, payload);
    await this.writePayloadAtomic(this.files[key], payload);
  }

  async writePayloadAtomic(filePath, payload) {
    const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporaryPath, payload, "utf8");
    try {
      await rename(temporaryPath, filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }

  async recoverCollection(key, fallback) {
    const filePath = this.files[key];
    const backupDir = join(this.dataDir, "perola-backups", key);
    try {
      const backups = (await readdir(backupDir)).sort().reverse();
      for (const backup of backups) {
        try {
          const payload = await readFile(join(backupDir, backup), "utf8");
          const parsed = JSON.parse(payload);
          if (!Array.isArray(parsed)) continue;
          await this.writePayloadAtomic(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
          return parsed;
        } catch {
          // Continue until the newest valid backup is found.
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const corruptPath = `${filePath}.corrupt-${this.timestamp().replace(/[^0-9]/g, "")}`;
    await rename(filePath, corruptPath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    await this.writePayloadAtomic(filePath, `${JSON.stringify(fallback, null, 2)}\n`);
    return structuredClone(fallback);
  }

  async backupCollection(key, nextPayload) {
    const filePath = this.files[key];
    let currentPayload = "";
    try {
      currentPayload = await readFile(filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (currentPayload === nextPayload) return;

    const backupDir = join(this.dataDir, "perola-backups", key);
    await mkdir(backupDir, { recursive: true });
    const stamp = this.timestamp().replace(/[^0-9]/g, "");
    const backupName = `${stamp}-${crypto.randomUUID().slice(0, 8)}-${basename(filePath)}`;
    await writeFile(join(backupDir, backupName), currentPayload, "utf8");
    await rotateBackups(backupDir);
  }

  async ensureCollectionFile(key, fallback) {
    await mkdir(dirname(this.files[key]), { recursive: true });
    try {
      const raw = await readFile(this.files[key], "utf8");
      const parsed = JSON.parse(raw || "[]");
      if (Array.isArray(parsed)) return;
    } catch (error) {
      if (error instanceof SyntaxError) {
        await this.recoverCollection(key, fallback);
        return;
      }
      if (error.code !== "ENOENT") throw error;
    }
    await this.writePayloadAtomic(this.files[key], `${JSON.stringify(fallback, null, 2)}\n`);
  }

  timestamp() {
    return this.now().toISOString();
  }

  publisherStatus() {
    const enabled = Boolean(this.publisher?.isEnabled?.());
    return {
      provider: "instagram",
      enabled,
      account: text(this.publisher?.account || ""),
      userIdConfigured: Boolean(this.publisher?.userId),
      tokenConfigured: Boolean(this.publisher?.accessToken),
      mode: enabled ? "real" : "simulated"
    };
  }
}

function normalizePost(input, timestamp) {
  const networks = normalizeNetworks(input.networks || input.redes || input.channel || input.canal);
  const scheduledAt = normalizeDateTime(input.scheduledAt || input.horarioAgendado || input.plannedFor || "");
  const publishMode = normalizePublishMode(input.publishMode || input.modoPublicacao || "manual");
  const approved = normalizeBoolean(input.approved ?? input.aprovado ?? false);
  const statusInput = text(input.status || "");
  const status = STATUSES.has(statusInput) ? statusInput : approved && scheduledAt ? "scheduled" : "draft";
  return {
    id: safeId(input.id || input.title || input.titulo || `post-${timestamp}`),
    title: text(input.title || input.titulo || "Publicacao Perola"),
    caption: text(input.caption || input.legenda || input.content || ""),
    networks,
    campaign: text(input.campaign || input.campanha || ""),
    campaignId: text(input.campaignId || input.campanhaId || ""),
    scheduledAt,
    publishMode,
    approved,
    status,
    humanDeadlineMinutes: normalizeDeadline(input.humanDeadlineMinutes ?? input.prazoHumanoMinutos ?? 15),
    autoPublishIfExpired: normalizeBoolean(input.autoPublishIfExpired ?? input.autoPublicarSeExpirar ?? false),
    publishedAt: text(input.publishedAt || ""),
    publishedBy: text(input.publishedBy || ""),
    autoPublished: normalizeBoolean(input.autoPublished || false),
    mediaUrl: text(input.mediaUrl || input.media_url || ""),
    mediaType: normalizeMediaType(input.mediaType || ""),
    publishProvider: text(input.publishProvider || ""),
    instagramAccount: text(input.instagramAccount || ""),
    instagramCreationId: text(input.instagramCreationId || ""),
    instagramMediaId: text(input.instagramMediaId || ""),
    instagramPermalink: text(input.instagramPermalink || ""),
    lastPublishError: text(input.lastPublishError || ""),
    lastPublishAttemptAt: text(input.lastPublishAttemptAt || ""),
    source: text(input.source || ""),
    productId: text(input.productId || ""),
    productName: text(input.productName || input.giroProduct || ""),
    reportDate: text(input.reportDate || ""),
    discountPercent: Number(input.discountPercent ?? input.giroDiscountPercent ?? 0) || 0,
    ruleId: text(input.ruleId || ""),
    giroSourceId: text(input.giroSourceId || ""),
    giroProduct: text(input.giroProduct || ""),
    giroDiscountPercent: Number(input.giroDiscountPercent || 0) || 0,
    createdAt: text(input.createdAt || timestamp),
    updatedAt: text(input.updatedAt || timestamp)
  };
}

function normalizePostEngineDraft(input = {}) {
  const timestamp = text(input.createdAt || new Date().toISOString());
  const status = POST_ENGINE_DRAFT_STATUSES.has(text(input.status)) ? text(input.status) : "draft";
  return {
    id: safeId(input.id || `post-engine-draft-${timestamp}`),
    ideaType: text(input.ideaType || input.type || ""),
    title: text(input.title || ""),
    body: text(input.body || input.description || ""),
    cta: text(input.cta || ""),
    hashtags: Array.isArray(input.hashtags) ? input.hashtags.map(text).filter(Boolean).slice(0, 8) : [],
    campaignId: text(input.campaignId || input.campanhaId || ""),
    source: "perola-post-engine",
    status,
    scheduledAt: normalizeDateTime(input.scheduledAt || ""),
    score: number(input.score),
    relevanceScore: number(input.relevanceScore),
    salesPotentialScore: number(input.salesPotentialScore),
    urgencyScore: number(input.urgencyScore),
    createdAt: timestamp,
    updatedAt: text(input.updatedAt || timestamp)
  };
}

function attachCampaignNames(items = [], campaigns = []) {
  const campaignMap = new Map(
    campaigns.map(normalizeCampaign).map((campaign) => [campaign.id, campaign.title || campaign.id])
  );
  return items.map((item) => {
    const campaignId = text(item.campaignId || "");
    return {
      ...item,
      campaignId,
      campaignName: campaignId ? campaignMap.get(campaignId) || "Campanha nao encontrada" : ""
    };
  });
}

function campaignDraftCounters(campaigns = [], posts = [], drafts = []) {
  const campaignIds = new Set(campaigns.map((campaign) => campaign.id));
  const counters = new Map(campaigns.map((campaign) => [campaign.id, emptyDraftCounters()]));
  for (const item of [...posts.map(normalizeCampaignCountPost), ...drafts.map(normalizeCampaignCountDraft)]) {
    if (!item.campaignId || !campaignIds.has(item.campaignId)) continue;
    const counter = counters.get(item.campaignId) || emptyDraftCounters();
    counter.total += 1;
    if (item.approved) counter.approved += 1;
    if (item.scheduled) counter.scheduled += 1;
    counters.set(item.campaignId, counter);
  }
  return counters;
}

function emptyDraftCounters() {
  return { total: 0, approved: 0, scheduled: 0 };
}

function campaignCommercialInsight(draftCounters = emptyDraftCounters()) {
  const approved = Number(draftCounters.approved || 0);
  if (approved <= 5) return null;
  return {
    type: "high_activity",
    title: "Alta atividade",
    message: "Alta atividade: campanha com mais de 5 drafts aprovados. Avaliar reforço de publicação, impulsionamento ou reaproveitamento de conteúdo.",
    source: "campaign-draft-counters"
  };
}

function campaignScore(draftCounters = emptyDraftCounters()) {
  const total = Number(draftCounters.total || 0);
  const approved = Number(draftCounters.approved || 0);
  const scheduled = Number(draftCounters.scheduled || 0);
  return (total * 100) + (approved * 10) + scheduled;
}

function sortCampaignsByDraftRanking(left = {}, right = {}) {
  return (Number(right.draftsTotal || 0) - Number(left.draftsTotal || 0))
    || (Number(right.draftsApproved || 0) - Number(left.draftsApproved || 0))
    || (Number(right.draftsScheduled || 0) - Number(left.draftsScheduled || 0))
    || (left.originalIndex - right.originalIndex);
}

function normalizeCampaignCountPost(post = {}) {
  return {
    campaignId: text(post.campaignId || ""),
    approved: normalizeBoolean(post.approved),
    scheduled: text(post.status) === "scheduled"
  };
}

function normalizeCampaignCountDraft(draft = {}) {
  const status = text(draft.status);
  return {
    campaignId: text(draft.campaignId || ""),
    approved: status === "approved",
    scheduled: status === "scheduled"
  };
}

function normalizeCampaign(input = {}) {
  const timestamp = text(input.createdAt || new Date().toISOString());
  const status = CAMPAIGN_STATUSES.has(text(input.status)) ? text(input.status) : "draft";
  const priority = CAMPAIGN_PRIORITIES.has(text(input.priority)) ? text(input.priority) : "medium";
  return {
    id: safeId(input.id || `campaign-${crypto.randomUUID()}`),
    sourceSignalId: text(input.sourceSignalId || ""),
    title: text(input.title),
    description: text(input.description),
    productName: text(input.productName || ""),
    funnelStage: text(input.funnelStage || ""),
    objective: text(input.objective),
    caption: text(input.caption || input.legenda || ""),
    mediaUrl: text(input.mediaUrl || input.media_url || input.midiaUrl || ""),
    mediaType: normalizeMediaType(input.mediaType || input.media_type || input.tipoMidia),
    readyMaterial: normalizeReadyMaterial(input.readyMaterial),
    status,
    priority,
    startDate: campaignDate(input.startDate),
    endDate: campaignDate(input.endDate),
    approvedAt: normalizeDateTime(input.approvedAt),
    approvedBy: text(input.approvedBy || ""),
    rejectedAt: normalizeDateTime(input.rejectedAt),
    rejectedReason: text(input.rejectedReason || ""),
    distributedAt: normalizeDateTime(input.distributedAt),
    distributedChannelIds: normalizeChannelIds(input.distributedChannelIds || input.sentToChannels),
    createdAt: timestamp,
    updatedAt: text(input.updatedAt || timestamp)
  };
}

function campaignPatch(input = {}) {
  const patch = {};
  for (const field of ["sourceSignalId", "title", "description", "productName", "funnelStage", "objective", "caption", "mediaUrl", "mediaType", "readyMaterial", "status", "priority", "startDate", "endDate", "approvedAt", "approvedBy", "rejectedAt", "rejectedReason", "distributedAt", "distributedChannelIds"]) {
    if (has(input, field)) patch[field] = input[field];
  }
  return patch;
}

function normalizeReadyMaterial(input = {}) {
  if (!input || typeof input !== "object") {
    return {
      postText: "",
      whatsappText: "",
      statusText: "",
      cta: "",
      visualBriefing: ""
    };
  }
  return {
    postText: text(input.postText || ""),
    whatsappText: text(input.whatsappText || ""),
    statusText: text(input.statusText || ""),
    cta: text(input.cta || ""),
    visualBriefing: text(input.visualBriefing || "")
  };
}

function normalizeCampaignDistribution(input = {}) {
  const modules = Array.isArray(input.sentToModules) ? input.sentToModules : [];
  const sentToChannels = normalizeChannelIds(input.sentToChannels || input.channels);
  const channels = Array.isArray(input.channels) ? input.channels.map(normalizeDistributionChannel).filter((channel) => channel.id) : [];
  return {
    id: text(input.id || ""),
    campaignId: text(input.campaignId || ""),
    sentToModules: modules.map((item) => text(item)).filter(Boolean),
    sentToChannels,
    channels,
    mesaInteractionId: text(input.mesaInteractionId || ""),
    mesaReceiver: input.mesaReceiver && typeof input.mesaReceiver === "object"
      ? {
        target: text(input.mesaReceiver.target || ""),
        receiver: text(input.mesaReceiver.receiver || ""),
        status: text(input.mesaReceiver.status || "")
      }
      : null,
    createdAt: normalizeDateTime(input.createdAt) || text(input.createdAt || "")
  };
}

function buildMesaInteractionFromCampaign(campaign = {}, distribution = {}, timestamp = new Date().toISOString()) {
  const sentToModules = Array.isArray(distribution.sentToModules) ? distribution.sentToModules : [];
  if (!sentToModules.includes("mesa_xeriffe")) return null;
  const payload = buildMesaReceivedCommercialAction(normalizePerolaCommercialActionForMesa(campaign));
  if (!payload) return null;
  return normalizeMesaInteraction({
    id: `mesa-interaction-${safeId(campaign.id)}-${timestamp.replace(/[^0-9]/g, "")}`,
    campaignId: campaign.id,
    distributionId: distribution.id,
    receiver: "receivePerolaCommercialAction",
    targetModule: "mesa_xeriffe",
    status: "ready_for_mesa_receiver",
    payload,
    createdAt: timestamp
  });
}

export function normalizePerolaCommercialActionForMesa(action = {}) {
  const campaign = normalizeCampaign(action);
  const readyMaterial = normalizeReadyMaterial(campaign.readyMaterial);
  const productId = text(action.productId || action.product?.id || safeId(campaign.productName || campaign.id));
  const productName = text(campaign.productName || action.product?.name || "");
  const channels = Array.isArray(action.channels) && action.channels.length
    ? action.channels
    : ["Cardapio do Mesa", "Telas do Mesa", "SamBah"];

  return {
    id: campaign.id,
    origin: "perola",
    type: text(action.type || campaign.funnelStage || "commercial_action"),
    status: campaign.status,
    title: campaign.title,
    description: readyMaterial.postText || campaign.description || campaign.objective,
    productId,
    productName,
    product: {
      id: productId,
      name: productName
    },
    channels,
    startsAt: campaign.startDate,
    endsAt: campaign.endDate
  };
}

export function buildPerolaCommercialActionFromTiming(input = {}) {
  const context = buildDemographicTimingContext(input);
  const modulePayloads = buildModuleTimingPayloads(context);
  const actionType = text(input.perola?.actionType || context.suggestedActionType || "commercial_action");
  const productFocus = text(context.productFocus);
  const reason = text(context.reason);
  const action = {
    id: `perola-timing-${safeId(`${actionType}-${productFocus || reason || crypto.randomUUID()}`)}`,
    origin: "perola",
    sourceStrategy: context.strategyType,
    type: actionType,
    reason,
    title: buildTimingCommercialActionTitle(actionType),
    description: buildTimingCommercialActionDescription(productFocus, reason),
    status: context.readiness === "complete" ? "pending_admin_approval" : "incomplete_context",
    requiresAdminApproval: true,
    timingWindow: context.timingWindow,
    targetDemographic: context.targetDemographic,
    productFocus,
    modulePayloads
  };

  if (context.missingSources) {
    action.missingSources = context.missingSources;
  }

  return action;
}

export function approvePerolaCommercialActionByAdmin(action = {}, adminContext = {}) {
  if (action.status !== "pending_admin_approval") {
    return { status: "not_approvable", action };
  }
  if (adminContext.role !== "admin") {
    return { status: "admin_required", action };
  }
  if (adminContext.authorized !== true) {
    return { status: "admin_authorization_required", action };
  }

  return {
    status: "approved_by_admin",
    action: {
      ...action,
      status: "approved_by_admin",
      approvedBy: text(adminContext.userId),
      approvedAt: new Date().toISOString()
    }
  };
}

function buildTimingCommercialActionTitle(actionType = "") {
  if (actionType === "happy_hour") return "Happy Hour da Tarde";
  return text(actionType || "Acao Comercial");
}

function buildTimingCommercialActionDescription(productFocus = "", reason = "") {
  const product = productFocus || "produto selecionado";
  const timingReason = reason === "low_traffic_period" ? "baixo movimento" : text(reason || "oportunidade operacional");
  return `Acao sugerida para girar ${product} no horario de ${timingReason}.`;
}

function normalizeMesaInteraction(input = {}) {
  return {
    id: text(input.id || ""),
    campaignId: text(input.campaignId || ""),
    distributionId: text(input.distributionId || ""),
    receiver: text(input.receiver || "receivePerolaCommercialAction"),
    targetModule: text(input.targetModule || "mesa_xeriffe"),
    status: text(input.status || "ready_for_mesa_receiver"),
    payload: normalizeMesaReceiverPayload(input.payload),
    createdAt: normalizeDateTime(input.createdAt) || text(input.createdAt || "")
  };
}

function normalizeMesaReceiverPayload(input = {}) {
  return {
    source: text(input.source || "perola"),
    status: text(input.status || "approved"),
    actionId: text(input.actionId || input.id || ""),
    actionType: text(input.actionType || input.type || "commercial_action"),
    title: text(input.title || ""),
    description: text(input.description || ""),
    productId: text(input.productId || input.product?.id || ""),
    productName: text(input.productName || input.product?.name || ""),
    product: {
      id: text(input.product?.id || input.productId || ""),
      name: text(input.product?.name || input.productName || "")
    },
    channels: Array.isArray(input.channels) ? input.channels.map((item) => text(item)).filter(Boolean) : [],
    startsAt: text(input.startsAt || ""),
    endsAt: text(input.endsAt || ""),
    mesaStatus: text(input.mesaStatus || "waiting_mesa_ack"),
    requiresCashierOk: input.requiresCashierOk !== false,
    useMesaRules: input.useMesaRules !== false
  };
}

function normalizeDistributionChannel(input = {}) {
  if (typeof input === "string") {
    return {
      id: text(input),
      name: text(input),
      type: "",
      mode: "simulated",
      formatsSupported: []
    };
  }
  return {
    id: text(input.id || ""),
    name: text(input.name || input.id || ""),
    type: text(input.type || ""),
    mode: text(input.mode || "simulated"),
    formatsSupported: Array.isArray(input.formatsSupported)
      ? input.formatsSupported.map((item) => text(item)).filter(Boolean)
      : []
  };
}

function normalizeChannel(input = {}, publisherStatus = {}) {
  const dailyLimit = Math.max(0, Math.trunc(Number(input.dailyLimit ?? 0) || 0));
  const distributedToday = Math.max(0, Math.trunc(Number(input.distributedToday ?? 0) || 0));
  const type = text(input.type || "simulated");
  const mode = type === "instagram"
    ? (publisherStatus.enabled ? "real" : "simulated")
    : text(input.mode || "simulated");
  return {
    id: safeId(input.id || input.name || "channel"),
    name: text(input.name || input.id || "Canal Perola"),
    type,
    enabled: input.enabled !== false,
    mode,
    formatsSupported: Array.isArray(input.formatsSupported)
      ? input.formatsSupported.map((item) => text(item)).filter(Boolean)
      : [],
    requiresApproval: input.requiresApproval !== false,
    dailyLimit,
    distributedToday,
    lastDistributedAt: normalizeDateTime(input.lastDistributedAt)
  };
}

function normalizeChannelForToday(input = {}, today = new Date().toISOString().slice(0, 10), publisherStatus = {}) {
  const channel = normalizeChannel(input, publisherStatus);
  if (channel.lastDistributedAt && !channel.lastDistributedAt.startsWith(today)) {
    return {
      ...channel,
      distributedToday: 0
    };
  }
  return channel;
}

function channelPatch(input = {}) {
  const patch = {};
  for (const field of ["name", "type", "enabled", "mode", "formatsSupported", "requiresApproval", "dailyLimit", "distributedToday", "lastDistributedAt"]) {
    if (has(input, field)) patch[field] = input[field];
  }
  return patch;
}

function normalizeChannelIds(value) {
  const raw = Array.isArray(value) ? value : (value ? [value] : []);
  return [...new Set(raw.map((item) => {
    if (item && typeof item === "object") return text(item.id || item.channelId || "");
    return text(item || "");
  }).filter(Boolean))];
}

function normalizeEcosystemSignal(input = {}) {
  return {
    id: text(input.id || ""),
    sourceModule: text(input.sourceModule || ""),
    title: text(input.title || ""),
    description: text(input.description || ""),
    type: text(input.type || ""),
    productName: text(input.productName || ""),
    quantity: number(input.quantity || 0),
    salesCount: number(input.salesCount || 0),
    priority: text(input.priority || "medium"),
    createdAt: normalizeDateTime(input.createdAt) || text(input.createdAt || "")
  };
}

function buildCampaignObjectiveFromSignal(signal = {}, classification = {}) {
  const product = text(signal.productName || "produto");
  const stage = text(classification.funnelStage || "qualificar");
  return `Usar o sinal ${text(signal.id)} para ${stage} interesse em ${product}.`;
}

function buildReadyMaterialCta(funnelStage = "", productName = "") {
  const product = text(productName || "essa oportunidade");
  return {
    atrair: `Vem ver o que tem de novo pra ti.`,
    qualificar: `Me chama no Whats e eu te conto se ${product} combina contigo.`,
    converter: `Chama no Whats e garante o teu.`,
    remodelar: `Me chama no Whats que a gente ajusta isso pra ti.`,
    encantar: `Volta pro teu momento bom e chama no Whats.`
  }[text(funnelStage)] || `Chama no Whats e garante o teu.`;
}

function validateCampaignInput(input = {}, { partial = false } = {}) {
  if (!partial && !text(input.title)) {
    return { success: false, ok: false, error: "campaign_title_required", message: "Titulo da campanha obrigatorio.", statusCode: 400 };
  }
  if (has(input, "title") && !text(input.title)) {
    return { success: false, ok: false, error: "campaign_title_required", message: "Titulo da campanha obrigatorio.", statusCode: 400 };
  }
  if (has(input, "status") && !CAMPAIGN_STATUSES.has(text(input.status))) {
    return { success: false, ok: false, error: "invalid_campaign_status", message: "Status de campanha invalido.", statusCode: 400 };
  }
  if (has(input, "priority") && !CAMPAIGN_PRIORITIES.has(text(input.priority))) {
    return { success: false, ok: false, error: "invalid_campaign_priority", message: "Prioridade de campanha invalida.", statusCode: 400 };
  }
  return validateCampaignPeriod(input);
}

function validateCampaignPeriod(input = {}) {
  const startDate = campaignDate(input.startDate);
  const endDate = campaignDate(input.endDate);
  if (input.startDate && !startDate) return { success: false, ok: false, error: "invalid_campaign_start_date", statusCode: 400 };
  if (input.endDate && !endDate) return { success: false, ok: false, error: "invalid_campaign_end_date", statusCode: 400 };
  if (startDate && endDate && endDate < startDate) {
    return { success: false, ok: false, error: "invalid_campaign_period", message: "Data final deve ser igual ou posterior a data inicial.", statusCode: 400 };
  }
  return { success: true, ok: true };
}

function campaignDate(value) {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function buildPostEngineDraftPatch(input = {}, timestamp) {
  const patch = { updatedAt: timestamp };
  if (has(input, "ideaType") || has(input, "type")) patch.ideaType = text(input.ideaType || input.type);
  if (has(input, "title")) patch.title = text(input.title);
  if (has(input, "body") || has(input, "description")) patch.body = text(input.body || input.description);
  if (has(input, "cta")) patch.cta = text(input.cta);
  if (has(input, "hashtags")) patch.hashtags = normalizeTags(input.hashtags);
  if (has(input, "status")) patch.status = text(input.status);
  if (has(input, "scheduledAt")) patch.scheduledAt = normalizeDateTime(input.scheduledAt);
  if (has(input, "campaignId") || has(input, "campanhaId")) patch.campaignId = text(input.campaignId ?? input.campanhaId);
  return patch;
}

function buildPostPatch(input = {}, timestamp) {
  const patch = { updatedAt: timestamp };
  if (has(input, "title") || has(input, "titulo")) patch.title = text(input.title ?? input.titulo);
  if (has(input, "caption") || has(input, "legenda") || has(input, "content")) patch.caption = text(input.caption ?? input.legenda ?? input.content);
  if (has(input, "mediaUrl") || has(input, "media_url") || has(input, "midiaUrl")) {
    patch.mediaUrl = text(input.mediaUrl ?? input.media_url ?? input.midiaUrl);
  }
  if (has(input, "mediaType") || has(input, "media_type") || has(input, "tipoMidia")) {
    patch.mediaType = normalizeMediaType(input.mediaType ?? input.media_type ?? input.tipoMidia);
  }
  if (has(input, "networks") || has(input, "redes") || has(input, "channel") || has(input, "canal")) {
    patch.networks = normalizeNetworks(input.networks ?? input.redes ?? input.channel ?? input.canal);
  }
  if (has(input, "campaign") || has(input, "campanha")) patch.campaign = text(input.campaign ?? input.campanha);
  if (has(input, "campaignId") || has(input, "campanhaId")) patch.campaignId = text(input.campaignId ?? input.campanhaId);
  if (has(input, "scheduledAt") || has(input, "horarioAgendado") || has(input, "plannedFor")) {
    patch.scheduledAt = normalizeDateTime(input.scheduledAt ?? input.horarioAgendado ?? input.plannedFor);
  }
  if (has(input, "publishMode") || has(input, "modoPublicacao")) patch.publishMode = normalizePublishMode(input.publishMode ?? input.modoPublicacao);
  if (has(input, "approved") || has(input, "aprovado")) patch.approved = normalizeBoolean(input.approved ?? input.aprovado);
  if (has(input, "status")) patch.status = text(input.status);
  if (has(input, "humanDeadlineMinutes") || has(input, "prazoHumanoMinutos")) {
    patch.humanDeadlineMinutes = normalizeDeadline(input.humanDeadlineMinutes ?? input.prazoHumanoMinutos);
  }
  if (has(input, "autoPublishIfExpired") || has(input, "autoPublicarSeExpirar")) {
    patch.autoPublishIfExpired = normalizeBoolean(input.autoPublishIfExpired ?? input.autoPublicarSeExpirar);
  }
  return patch;
}

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return source.map((item) => {
    const tag = text(item);
    if (!tag) return "";
    return tag.startsWith("#") ? tag : `#${tag}`;
  }).filter(Boolean).slice(0, 8);
}

function isAllowedDraftTransition(from, to) {
  const transitions = {
    draft: new Set(["pending_review"]),
    pending_review: new Set(["approved", "rejected", "draft"]),
    approved: new Set(["scheduled", "pending_review"]),
    rejected: new Set(["draft"]),
    scheduled: new Set(["approved"])
  };
  return transitions[from]?.has(to) || false;
}

function normalizePromotionalRule(input = {}) {
  return {
    id: safeId(input.id || input.name || input.product || "promo"),
    name: text(input.name || `Giro ${input.product || ""}`),
    active: input.active !== false,
    type: "promotional_rule",
    productId: text(input.productId || input.produtoId || safeId(input.product || input.produto || "")),
    product: text(input.product || input.produto || ""),
    minimumLeftover: Math.max(0, Number(input.minimumLeftover ?? input.sobraMinima ?? 0) || 0),
    lowSalePercent: Math.min(Math.max(Number(input.lowSalePercent ?? input.percentualVendaBaixa ?? 35) || 35, 0), 100),
    authorizedDiscountPercent: Math.min(Math.max(Number(input.authorizedDiscountPercent ?? input.descontoAutorizado ?? 0) || 0, 0), 50),
    allowedNetworks: normalizeNetworks(input.allowedNetworks || input.redesPermitidas || ["instagram"]),
    publishMode: normalizePublishMode(input.publishMode || input.modoPublicacao || "assistido"),
    suggestedTime: normalizeSuggestedTime(input.suggestedTime || input.horarioSugerido || "18:00"),
    requiresApproval: normalizeBoolean(input.requiresApproval ?? input.exigeAprovacao ?? false),
    humanDeadlineMinutes: normalizeDeadline(input.humanDeadlineMinutes ?? input.prazoHumanoMinutos ?? 20),
    autoPublishIfExpired: normalizeBoolean(input.autoPublishIfExpired ?? input.autoPublicarSeExpirar ?? true)
  };
}

function buildPromotionalRulePatch(input = {}) {
  const patch = {};
  if (has(input, "enabled") || has(input, "active")) patch.active = normalizeBoolean(input.enabled ?? input.active);
  if (has(input, "minPreviousLeftover") || has(input, "minimumLeftover") || has(input, "sobraMinima")) {
    patch.minimumLeftover = number(input.minPreviousLeftover ?? input.minimumLeftover ?? input.sobraMinima);
  }
  if (has(input, "lowSalesMaxPercent") || has(input, "lowSalePercent") || has(input, "percentualVendaBaixa")) {
    patch.lowSalePercent = number(input.lowSalesMaxPercent ?? input.lowSalePercent ?? input.percentualVendaBaixa);
  }
  if (has(input, "discountPercent") || has(input, "authorizedDiscountPercent") || has(input, "descontoAutorizado")) {
    patch.authorizedDiscountPercent = number(input.discountPercent ?? input.authorizedDiscountPercent ?? input.descontoAutorizado);
  }
  if (has(input, "allowedNetworks") || has(input, "redesPermitidas")) {
    patch.allowedNetworks = normalizeNetworks(input.allowedNetworks ?? input.redesPermitidas);
  }
  if (has(input, "publishMode") || has(input, "modoPublicacao")) patch.publishMode = text(input.publishMode ?? input.modoPublicacao).toLowerCase();
  if (has(input, "suggestedPublishTime") || has(input, "suggestedTime") || has(input, "horarioSugerido")) {
    patch.suggestedTime = text(input.suggestedPublishTime ?? input.suggestedTime ?? input.horarioSugerido);
  }
  if (has(input, "autoPublishIfExpired") || has(input, "autoPublicarSeExpirar")) {
    patch.autoPublishIfExpired = normalizeBoolean(input.autoPublishIfExpired ?? input.autoPublicarSeExpirar);
  }
  if (has(input, "humanDeadlineMinutes") || has(input, "prazoHumanoMinutos")) {
    patch.humanDeadlineMinutes = number(input.humanDeadlineMinutes ?? input.prazoHumanoMinutos);
  }
  if (has(input, "requiresApproval") || has(input, "exigeAprovacao")) {
    patch.requiresApproval = normalizeBoolean(input.requiresApproval ?? input.exigeAprovacao);
  }
  return patch;
}

function validatePromotionalRulePatch(patch = {}) {
  if (has(patch, "authorizedDiscountPercent") && (patch.authorizedDiscountPercent < 0 || patch.authorizedDiscountPercent > 50)) {
    return invalidRule("invalid_discount", "Desconto autorizado deve ficar entre 0 e 50 nesta fase.");
  }
  if (has(patch, "minimumLeftover") && patch.minimumLeftover < 0) {
    return invalidRule("invalid_min_previous_leftover", "Sobra minima nao pode ser negativa.");
  }
  if (has(patch, "lowSalePercent") && (patch.lowSalePercent < 0 || patch.lowSalePercent > 100)) {
    return invalidRule("invalid_low_sales_percent", "Percentual de venda baixa deve ficar entre 0 e 100.");
  }
  if (has(patch, "publishMode") && !PUBLISH_MODES.has(patch.publishMode)) {
    return invalidRule("invalid_publish_mode", "Modo de publicacao deve ser manual, assistido ou automatico.");
  }
  if (has(patch, "humanDeadlineMinutes") && patch.humanDeadlineMinutes < 1) {
    return invalidRule("invalid_human_deadline", "Prazo humano deve ser maior que zero.");
  }
  if (has(patch, "suggestedTime") && !/^\d{2}:\d{2}$/.test(patch.suggestedTime)) {
    return invalidRule("invalid_suggested_time", "Horario sugerido deve usar HH:mm.");
  }
  return { ok: true };
}

function invalidRule(error, message) {
  return { ok: false, error, message, statusCode: 400 };
}

function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeMesaReportItem(input = {}) {
  const date = normalizeDate(input.date || input.data);
  const product = text(input.product || input.produto || "");
  return {
    id: safeId(input.id || `${date}-${product}`),
    date,
    productId: text(input.productId || input.produtoId || safeId(product)),
    product,
    initialStock: number(input.initialStock ?? input.estoqueInicial),
    producedToday: number(input.producedToday ?? input.producaoAdicionalDia ?? input.producaoDoDia),
    sold: number(input.sold ?? input.vendido),
    previousLeftover: number(input.previousLeftover ?? input.sobraAnterior),
    finalStock: number(input.finalStock ?? input.estoqueFinal),
    normalPrice: normalizeMoney(input.normalPrice ?? input.precoNormal)
  };
}

function buildGauchoPromoCaption(item, rule) {
  const discount = rule.authorizedDiscountPercent;
  const price = item.normalPrice > 0 ? ` De ${formatMoney(item.normalPrice)} por ${formatMoney(item.normalPrice * (1 - discount / 100))}.` : "";
  return `Bah, hoje tem oportunidade boa no SamBah: ${item.product} com ${discount}% de desconto no pedido do dia.${price} E simples: chamou, pediu, aproveitou. Oferta valida enquanto tiver disponibilidade.`;
}

function buildSuggestedDateTime(date, time) {
  const [hours, minutes] = normalizeSuggestedTime(time).split(":");
  const scheduled = new Date(`${date}T${hours}:${minutes}:00`);
  if (Number.isNaN(scheduled.getTime())) return "";
  return scheduled.toISOString();
}

function sameProduct(left = "", right = "") {
  return safeId(left) === safeId(right);
}

function number(value) {
  const parsed = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSuggestedTime(value = "18:00") {
  const raw = text(value);
  return /^\d{2}:\d{2}$/.test(raw) ? raw : "18:00";
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildAlert(post, nowMs) {
  const scheduledMs = Date.parse(post.scheduledAt);
  if (!Number.isFinite(scheduledMs)) return null;
  const minutesToSchedule = Math.ceil((scheduledMs - nowMs) / 60000);
  const deadlineAt = new Date(scheduledMs + post.humanDeadlineMinutes * 60000).toISOString();
  const deadlineMinutes = Math.ceil((Date.parse(deadlineAt) - nowMs) / 60000);
  if (minutesToSchedule > ALERT_WINDOW_MINUTES && post.status !== "waiting_human") return null;
  return {
    id: post.id,
    title: post.title,
    campaign: post.campaign,
    campaignId: post.campaignId,
    source: post.source,
    productId: post.productId,
    productName: post.productName,
    reportDate: post.reportDate,
    discountPercent: post.discountPercent,
    ruleId: post.ruleId,
    networks: post.networks,
    publishMode: post.publishMode,
    approved: post.approved,
    status: post.status,
    scheduledAt: post.scheduledAt,
    minutesToSchedule,
    deadlineAt,
    deadlineMinutes,
    autoPublishIfExpired: post.autoPublishIfExpired,
    severity: minutesToSchedule < 0 ? "late" : minutesToSchedule <= 5 ? "urgent" : "soon"
  };
}

function markPublished(post, timestamp, source) {
  post.status = "published";
  post.approved = true;
  post.publishedAt = timestamp;
  post.publishedBy = source === "automatic" ? "perola-simulador" : "humano";
  post.autoPublished = source === "automatic";
  post.updatedAt = timestamp;
}

function normalizeNetworks(value) {
  const source = Array.isArray(value) ? value : String(value || "manual").split(",");
  const networks = source.map((item) => text(item).toLowerCase()).filter(Boolean);
  return [...new Set(networks)].slice(0, 8);
}

function normalizeMediaType(value) {
  const mediaType = text(value || "").toUpperCase();
  return ["IMAGE", "REELS"].includes(mediaType) ? mediaType : "IMAGE";
}

function validateCampaignPublicationMedia({ mediaUrl = "", networks = [] } = {}) {
  if (networks.includes("instagram") && !/^https:\/\//i.test(mediaUrl)) {
    return {
      success: false,
      ok: false,
      error: "instagram_public_media_required",
      message: "Para criar publicacao de campanha no Instagram, informe uma URL HTTPS publica da midia.",
      statusCode: 422
    };
  }
  return { success: true, ok: true };
}

function normalizePublishMode(value) {
  const mode = text(value).toLowerCase();
  return PUBLISH_MODES.has(mode) ? mode : "manual";
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  return ["true", "1", "sim", "yes", "on", "aprovado"].includes(String(value || "").toLowerCase());
}

function normalizeDeadline(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return 15;
  return Math.min(Math.max(Math.round(minutes), 1), 1440);
}

function normalizeDateTime(value) {
  const raw = text(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function text(value = "") {
  return String(value || "").trim().slice(0, 1200);
}

function safeId(value = "") {
  return String(value || crypto.randomUUID())
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || crypto.randomUUID();
}

function normalizeMoney(value) {
  const amount = Number(String(value || 0).replace(",", "."));
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function normalizeDate(value) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

function sortByScheduleThenUpdated(left, right) {
  const leftSchedule = Date.parse(left.scheduledAt || "") || Number.MAX_SAFE_INTEGER;
  const rightSchedule = Date.parse(right.scheduledAt || "") || Number.MAX_SAFE_INTEGER;
  if (leftSchedule !== rightSchedule) return leftSchedule - rightSchedule;
  return Date.parse(right.updatedAt || right.createdAt || "") - Date.parse(left.updatedAt || left.createdAt || "");
}

function sortByCreatedAt(left, right) {
  return Date.parse(right.createdAt || "") - Date.parse(left.createdAt || "");
}

async function rotateBackups(backupDir) {
  const entries = await readdir(backupDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  await Promise.all(
    files.slice(BACKUP_KEEP).map((name) => unlink(join(backupDir, name)))
  );
}
