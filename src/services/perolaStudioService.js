import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateClaudeCampaignVariations } from "./contentGenerationService.js";
import { generatePerolaPosts } from "./perolaPostEngine.js";

const BRAND_FILE = "perola-brand-profiles.json";

const DEFAULT_BRANDS = [
  {
    id: "insano",
    name: "Insano Food Truck / Insano 1909",
    identity: "butequeria de rua",
    since: 2014,
    voice: "humano, direto, brasileiro, gaucho leve e comercial",
    callToAction: "WhatsApp para orcamento",
    products: [
      "hamburguer artesanal",
      "assados",
      "pizzas",
      "pancho",
      "hot dog",
      "PanBagnat",
      "porcoes de boteco"
    ],
    channels: ["instagram", "facebook", "tiktok", "whatsapp-status", "youtube-shorts"],
    active: true
  }
];

export const STUDIO_WORKFLOW = [
  { id: "radar", label: "Radar", description: "Transforma sinais do ecossistema em oportunidades priorizadas." },
  { id: "creator", label: "Criador", description: "Gera pacote multiformato sem inventar preco, promocao ou disponibilidade." },
  { id: "review", label: "Revisao", description: "Mantem humano no circuito antes de liberar conteudo." },
  { id: "schedule", label: "Agenda", description: "Organiza drafts aprovados no calendario interno." },
  { id: "publish", label: "Publicacao", description: "Usa publisher real somente quando o canal estiver configurado." },
  { id: "measure", label: "Metricas", description: "Separa metricas operacionais de metricas externas reais." }
];

export async function buildPerolaStudioOverview({ service, signals = [] } = {}) {
  if (!service) throw new Error("perola_service_required");

  const [summary, operationalStatus, campaigns, drafts, calendar, stats, channels, posts, brands] = await Promise.all([
    service.summary(),
    service.operationalStatus(),
    service.listCampaigns(),
    service.listPostEngineDrafts(),
    service.postEngineCalendar(),
    service.postEngineStats(),
    service.listChannels(),
    service.listPosts(),
    listPerolaBrandProfiles({ dataDir: service.dataDir })
  ]);

  const draftItems = Array.isArray(drafts?.drafts) ? drafts.drafts : [];
  const postItems = Array.isArray(posts?.items) ? posts.items : [];
  const channelItems = Array.isArray(channels?.items) ? channels.items : [];
  const generated = generatePerolaPosts();

  const workflow = {
    draft: countBy(draftItems, "status", "draft"),
    pendingReview: countBy(draftItems, "status", "pending_review"),
    approved: countBy(draftItems, "status", "approved"),
    rejected: countBy(draftItems, "status", "rejected"),
    scheduled: countBy(draftItems, "status", "scheduled") + countBy(postItems, "status", "scheduled"),
    waitingHuman: countBy(postItems, "status", "waiting_human"),
    published: countBy(postItems, "status", "published"),
    failed: postItems.filter((item) => Boolean(clean(item.lastPublishError))).length
  };

  const realInstagramPublications = postItems.filter((item) => item.publishProvider === "instagram").length;
  const simulatedPublications = postItems.filter((item) => item.status === "published" && item.publishProvider !== "instagram").length;

  return {
    success: true,
    module: "perola-studio",
    version: 1,
    workflow: STUDIO_WORKFLOW,
    pipeline: workflow,
    radar: {
      signals: Array.isArray(signals) ? signals.length : 0,
      ideas: Array.isArray(generated?.postIdeas) ? generated.postIdeas.slice(0, 6) : [],
      insights: generated?.insights || {},
      source: generated?.source || "perola-post-engine"
    },
    creator: {
      brandProfiles: brands.items,
      formats: ["instagram_feed", "instagram_carousel", "reels", "stories", "whatsapp", "tiktok", "youtube_shorts"],
      humanApprovalRequired: true,
      guardrails: [
        "sem precos inventados",
        "sem promocoes inventadas",
        "sem promessa de disponibilidade",
        "sem publicacao externa sem canal configurado"
      ]
    },
    campaigns: {
      total: Number(campaigns?.total || 0),
      items: Array.isArray(campaigns?.items) ? campaigns.items.slice(0, 10) : []
    },
    calendar: {
      total: Number(calendar?.total || calendar?.items?.length || 0),
      items: Array.isArray(calendar?.items) ? calendar.items.slice(0, 10) : []
    },
    publication: {
      operationalMode: operationalStatus?.mode || "Simulado",
      instagram: operationalStatus?.instagram || {},
      channels: channelItems.map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        enabled: channel.enabled !== false,
        mode: channel.mode || "simulated",
        formatsSupported: Array.isArray(channel.formatsSupported) ? channel.formatsSupported : []
      }))
    },
    metrics: {
      mode: "operational",
      externalSocialMetricsAvailable: false,
      note: "Alcance, curtidas, compartilhamentos e conversoes so entram quando forem lidos das APIs reais das redes.",
      posts: Number(summary?.totals?.posts || postItems.length),
      drafts: Number(stats?.draftsCreated || draftItems.length),
      published: workflow.published,
      realInstagramPublications,
      simulatedPublications,
      failed: workflow.failed
    },
    generatedAt: new Date().toISOString()
  };
}

export function createPerolaStudioContentPack(input = {}, { brandProfile = null } = {}) {
  const idea = clean(input.idea || input.title || input.campaign || "Atendimento do Insano para eventos e encontros");
  const objective = clean(input.objective || "gerar interesse e conversa comercial");
  const campaignId = clean(input.campaignId || input.campanhaId || "");
  const brand = normalizeBrandProfile(brandProfile || input.brand || DEFAULT_BRANDS[0]);
  const base = generateClaudeCampaignVariations({
    idea,
    product: clean(input.product || input.productName || "")
  });
  const caption = cleanLong(base?.variations?.instagramCaption || idea, 1200);
  const artCall = cleanLong(base?.variations?.artCall || idea, 220);
  const direct = cleanLong(base?.variations?.directSalesVersion || caption, 600);
  const whatsapp = cleanLong(base?.variations?.whatsappShort || direct, 500);
  const emotional = cleanLong(base?.variations?.emotionalVersion || caption, 900);
  const hook = shortSentence(artCall || idea, 90);
  const cta = clean(brand.callToAction || "Chama no WhatsApp para conversar.");

  return {
    success: true,
    mode: "assistive-local",
    source: "perola-studio",
    campaignId,
    brand,
    brief: {
      idea,
      objective,
      audience: clean(input.audience || brand.audience || "publico da marca"),
      product: clean(input.product || input.productName || ""),
      callToAction: cta
    },
    formats: {
      instagramFeed: {
        type: "image_or_carousel",
        caption,
        artCall,
        cta
      },
      instagramCarousel: {
        type: "carousel",
        slides: [
          { order: 1, role: "hook", text: hook },
          { order: 2, role: "context", text: shortSentence(emotional, 130) },
          { order: 3, role: "offer", text: shortSentence(direct, 150) },
          { order: 4, role: "cta", text: cta }
        ],
        caption
      },
      reels: {
        type: "vertical_video",
        hook,
        scenes: [
          { order: 1, durationSeconds: 3, direction: "Abrir com produto, movimento ou cena forte da operacao.", text: hook },
          { order: 2, durationSeconds: 6, direction: "Mostrar preparo, atendimento ou contexto real da campanha.", text: shortSentence(emotional, 120) },
          { order: 3, durationSeconds: 5, direction: "Fechar com marca e chamada comercial.", text: cta }
        ],
        voiceOver: direct,
        caption
      },
      stories: {
        type: "story_sequence",
        frames: [
          { order: 1, text: hook },
          { order: 2, text: shortSentence(direct, 110) },
          { order: 3, text: cta }
        ]
      },
      whatsapp: {
        type: "short_message",
        text: whatsapp,
        cta
      },
      tiktok: {
        type: "vertical_video",
        hook,
        script: direct,
        cta
      },
      youtubeShorts: {
        type: "vertical_video",
        title: hook,
        script: direct,
        cta
      }
    },
    approval: {
      status: "draft",
      required: true,
      nextStatus: "pending_review"
    },
    guardrails: Array.isArray(base?.guardrails) ? base.guardrails : [
      "sem precos inventados",
      "sem promocoes inventadas",
      "sem promessa de disponibilidade"
    ],
    createdAt: new Date().toISOString()
  };
}

export async function createPerolaStudioDraft({ service, input = {}, actorRole = "SYSTEM" } = {}) {
  if (!service) throw new Error("perola_service_required");
  const brandId = clean(input.brandId || "insano");
  const brands = await listPerolaBrandProfiles({ dataDir: service.dataDir });
  const brandProfile = brands.items.find((item) => item.id === brandId) || brands.items[0] || DEFAULT_BRANDS[0];
  const pack = createPerolaStudioContentPack(input, { brandProfile });
  const draftResult = await service.createPostEngineDraft({
    type: clean(input.type || "promocao"),
    title: clean(input.title || pack.formats.instagramFeed.artCall || "Conteudo Perola Studio"),
    description: pack.formats.instagramFeed.caption,
    campaignId: pack.campaignId
  }, { actorRole });

  return {
    success: Boolean(draftResult?.success),
    contentPack: pack,
    draft: draftResult?.draft || null,
    error: draftResult?.error,
    message: draftResult?.message,
    statusCode: draftResult?.statusCode
  };
}

export async function listPerolaBrandProfiles({ dataDir } = {}) {
  const filePath = join(dataDir, BRAND_FILE);
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    const items = Array.isArray(parsed) ? parsed.map(normalizeBrandProfile).filter((item) => item.id) : [];
    return { success: true, total: items.length, items: items.length ? items : DEFAULT_BRANDS.map(normalizeBrandProfile) };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const items = DEFAULT_BRANDS.map(normalizeBrandProfile);
    await writeFile(filePath, `${JSON.stringify(items, null, 2)}\n`, "utf8");
    return { success: true, total: items.length, items };
  }
}

export async function upsertPerolaBrandProfile({ dataDir, id, input = {} } = {}) {
  const targetId = slug(id || input.id || input.name);
  if (!targetId) return { success: false, error: "brand_id_required", statusCode: 400 };
  const current = await listPerolaBrandProfiles({ dataDir });
  const items = current.items.slice();
  const index = items.findIndex((item) => item.id === targetId);
  const profile = normalizeBrandProfile({
    ...(index >= 0 ? items[index] : {}),
    ...input,
    id: targetId,
    updatedAt: new Date().toISOString()
  });
  if (!profile.name) return { success: false, error: "brand_name_required", statusCode: 400 };
  if (index >= 0) items[index] = profile;
  else items.push(profile);
  await writeFile(join(dataDir, BRAND_FILE), `${JSON.stringify(items, null, 2)}\n`, "utf8");
  return { success: true, profile };
}

function normalizeBrandProfile(input = {}) {
  return {
    id: slug(input.id || input.name),
    name: clean(input.name),
    identity: clean(input.identity),
    since: Number(input.since || 0) || null,
    voice: clean(input.voice),
    audience: clean(input.audience),
    callToAction: clean(input.callToAction),
    products: uniqueList(input.products),
    channels: uniqueList(input.channels),
    active: input.active !== false,
    ...(input.updatedAt ? { updatedAt: clean(input.updatedAt) } : {})
  };
}

function countBy(items, field, expected) {
  return items.filter((item) => item?.[field] === expected).length;
}

function uniqueList(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map((item) => clean(item)).filter(Boolean))];
}

function slug(value) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 300);
}

function cleanLong(value, max = 1200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function shortSentence(value, max = 120) {
  const normalized = cleanLong(value, max * 2);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3).trim()}...`;
}
