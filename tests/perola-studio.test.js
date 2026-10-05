import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  STUDIO_WORKFLOW,
  buildPerolaStudioOverview,
  createPerolaStudioContentPack,
  listPerolaBrandProfiles,
  upsertPerolaBrandProfile
} from "../src/services/perolaStudioService.js";

test("Perola Studio gera pacote multiformato com aprovacao humana", () => {
  const result = createPerolaStudioContentPack({
    idea: "Evento de empresa com o Insano",
    product: "hamburguer artesanal"
  });

  assert.equal(result.success, true);
  assert.equal(result.approval.status, "draft");
  assert.equal(result.approval.required, true);
  assert.ok(result.formats.instagramFeed.caption.includes("Insano"));
  assert.equal(result.formats.instagramCarousel.slides.length, 4);
  assert.equal(result.formats.reels.scenes.length, 3);
  assert.equal(result.formats.stories.frames.length, 3);
  assert.ok(result.formats.whatsapp.text.length > 0);
  assert.ok(result.formats.tiktok.script.length > 0);
  assert.ok(result.formats.youtubeShorts.script.length > 0);
  assert.ok(result.guardrails.includes("sem precos inventados"));
});

test("Perola Studio cria e atualiza memoria de marca em JSON", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "perola-studio-"));
  const initial = await listPerolaBrandProfiles({ dataDir });

  assert.equal(initial.success, true);
  assert.ok(initial.items.some((item) => item.id === "insano"));

  const saved = await upsertPerolaBrandProfile({
    dataDir,
    id: "marca-teste",
    input: {
      name: "Marca Teste",
      voice: "direta e simples",
      products: ["produto a", "produto b"],
      channels: ["instagram", "whatsapp-status"]
    }
  });

  assert.equal(saved.success, true);
  assert.equal(saved.profile.id, "marca-teste");
  assert.equal(saved.profile.products.length, 2);

  const persisted = JSON.parse(await readFile(join(dataDir, "perola-brand-profiles.json"), "utf8"));
  assert.ok(persisted.some((item) => item.id === "marca-teste"));
});

test("Perola Studio separa metricas operacionais de metricas sociais externas", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "perola-studio-overview-"));
  const mockService = {
    dataDir,
    async summary() {
      return { totals: { posts: 4 } };
    },
    async operationalStatus() {
      return { mode: "Operacional", instagram: { enabled: true, account: "insano" } };
    },
    async listCampaigns() {
      return { total: 2, items: [{ id: "c1" }, { id: "c2" }] };
    },
    async listPostEngineDrafts() {
      return {
        drafts: [
          { id: "d1", status: "draft" },
          { id: "d2", status: "pending_review" },
          { id: "d3", status: "approved" },
          { id: "d4", status: "rejected" },
          { id: "d5", status: "scheduled" }
        ]
      };
    },
    async postEngineCalendar() {
      return { total: 1, items: [{ id: "d5", scheduledAt: "2026-09-01T18:00:00.000Z" }] };
    },
    async postEngineStats() {
      return { draftsCreated: 5 };
    },
    async listChannels() {
      return { items: [{ id: "instagram-feed", name: "Instagram Feed", type: "instagram", enabled: true, mode: "real" }] };
    },
    async listPosts() {
      return {
        items: [
          { id: "p1", status: "scheduled", publishProvider: "simulated" },
          { id: "p2", status: "published", publishProvider: "instagram" },
          { id: "p3", status: "published", publishProvider: "simulated" },
          { id: "p4", status: "draft", lastPublishError: "falhou" }
        ]
      };
    }
  };

  const result = await buildPerolaStudioOverview({
    service: mockService,
    signals: [{ id: "s1" }, { id: "s2" }]
  });

  assert.equal(result.success, true);
  assert.equal(result.radar.signals, 2);
  assert.equal(result.pipeline.pendingReview, 1);
  assert.equal(result.pipeline.scheduled, 2);
  assert.equal(result.pipeline.published, 2);
  assert.equal(result.pipeline.failed, 1);
  assert.equal(result.metrics.realInstagramPublications, 1);
  assert.equal(result.metrics.simulatedPublications, 1);
  assert.equal(result.metrics.externalSocialMetricsAvailable, false);
  assert.match(result.metrics.note, /Alcance/);
  assert.equal(STUDIO_WORKFLOW.length, 6);
});
