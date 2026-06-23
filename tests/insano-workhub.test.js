import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InsanoWorkhubController } from "../src/insanoWorkhubController.js";
import { InsanoWorkhubService } from "../src/insanoWorkhubService.js";
import { PayPerolaBridgeService } from "../src/payPerolaBridgeService.js";
import { PerolaService } from "../src/perolaService.js";
import { SambahPerolaBridgeService } from "../src/sambahPerolaBridgeService.js";
import { createApp } from "../src/server.js";

test("Insano Workhub persiste, filtra e atualiza tarefas em JSON local", async () => {
  const dir = await mkdtemp(join(tmpdir(), "insano-workhub-"));
  const dataFile = join(dir, "insano-workhub.json");
  let sequence = 0;
  const service = new InsanoWorkhubService({
    dataFile,
    now: () => new Date("2026-06-19T18:00:00.000Z"),
    idGenerator: () => `task-${++sequence}`
  });

  try {
    const [mesaTask, payTask] = await Promise.all([
      service.createTask({ sourceModule: "mesa", targetModule: "sambah", title: "Revisar pedido", priority: "high" }),
      service.createTask({ sourceModule: "pay", targetModule: "perola", title: "Confirmar pagamento" })
    ]);
    await service.createTask({ sourceModule: "mesa", targetModule: "pay", title: "Enviar conferência" });

    assert.equal((await service.listTasks()).total, 3);
    assert.ok((await service.listTasks({ sourceModule: "mesa" })).items.some((task) => task.id === mesaTask.id));
    assert.equal((await service.listTasks({ sourceModule: "pay" })).items[0].id, payTask.id);
    assert.deepEqual(Object.keys(mesaTask), ["id", "sourceModule", "targetModule", "title", "description", "status", "priority", "createdAt", "updatedAt"]);

    const updated = await service.updateTask(payTask.id, { status: "in_progress" });
    assert.equal(updated.status, "in_progress");

    const summary = await service.summary();
    assert.equal(summary.total, 3);
    assert.equal(summary.byStatus.pending, 2);
    assert.equal(summary.byStatus.in_progress, 1);
    assert.equal(summary.bySourceModule.mesa, 2);
    assert.equal(summary.byTargetModule.perola, 1);
    assert.equal(summary.mostActiveModule, "mesa");
    assert.equal(summary.lastActivityAt, "2026-06-19T18:00:00.000Z");
    assert.equal(JSON.parse(await readFile(dataFile, "utf8")).length, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Insano Workhub expoe tela, assets e APIs operacionais", async () => {
  const dir = await mkdtemp(join(tmpdir(), "insano-workhub-http-"));
  const service = new InsanoWorkhubService({ dataFile: join(dir, "insano-workhub.json") });
  const controller = new InsanoWorkhubController({ workhubService: service });
  const server = createApp({ workhubController: controller, authMode: "mock" });

  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const page = await fetch(`${baseUrl}/insano-workhub`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Central Única de Trabalhos/);
    assert.match(html, /workhubBoard/);
    assert.match(html, /insano-workhub\.css/);
    assert.match(html, /insano-workhub\.js/);

    const css = await fetch(`${baseUrl}/insano-workhub.css`);
    assert.equal(css.status, 200);
    assert.match(await css.text(), /\.workhub-board/);

    const javascript = await fetch(`${baseUrl}/insano-workhub.js`);
    assert.equal(javascript.status, 200);
    assert.match(await javascript.text(), /\/api\/insano-workhub\/tasks/);

    const created = await requestJson(baseUrl, "/api/insano-workhub/tasks", {
      method: "POST",
      body: { sourceModule: "perola", targetModule: "workhub", title: "Preparar campanha", priority: "urgent" }
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.json.task.sourceModule, "perola");
    assert.equal(created.json.task.targetModule, "workhub");

    const listed = await requestJson(baseUrl, "/api/insano-workhub/tasks?sourceModule=perola&targetModule=workhub");
    assert.equal(listed.response.status, 200);
    assert.equal(listed.json.total, 1);

    const summary = await requestJson(baseUrl, "/api/insano-workhub/summary");
    assert.equal(summary.response.status, 200);
    assert.equal(summary.json.total, 1);
    assert.equal(summary.json.urgent, 1);

    const updated = await requestJson(baseUrl, `/api/insano-workhub/tasks/${created.json.task.id}`, {
      method: "PATCH",
      body: { status: "completed" }
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.json.task.status, "completed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("pontes Mesa, SamBah, Pay e Perola criam tarefas pendentes automaticamente no WorkHub", async () => {
  const dir = await mkdtemp(join(tmpdir(), "insano-workhub-integrations-"));
  const workhub = new InsanoWorkhubService({ dataFile: join(dir, "workhub.json") });
  const payBridge = new PayPerolaBridgeService({ dataDir: dir, workhubService: workhub });
  const sambahBridge = new SambahPerolaBridgeService({ dataDir: dir, workhubService: workhub });
  const perola = new PerolaService({ dataDir: join(dir, "perola"), workhubService: workhub });

  try {
    await payBridge.registrarSugestaoPerola({ titulo: "Oferta Pay", priority: "high" });
    await sambahBridge.registrarSugestaoPerola({ titulo: "Sugestao SamBah" });
    await perola.createCampaign({ title: "Campanha Perola", objective: "Giro comercial", priority: "medium" });
    await perola.createPostEngineDraft({ type: "promocao", title: "Draft Perola", idea: "Sugestao de post" });
    await perola.runIntelligentGiro();
    await perola.runGiro();

    const tasks = await workhub.listTasks();
    assert.ok(tasks.items.some((task) => task.sourceModule === "pay" && task.targetModule === "perola" && task.status === "pending" && task.title === "Oferta Pay"));
    assert.ok(tasks.items.some((task) => task.sourceModule === "sambah" && task.targetModule === "perola" && task.status === "pending" && task.title === "Sugestao SamBah"));
    assert.ok(tasks.items.some((task) => task.sourceModule === "perola" && task.targetModule === "workhub" && task.title.includes("Campanha do Pérola")));
    assert.ok(tasks.items.some((task) => task.sourceModule === "perola" && task.targetModule === "workhub" && task.title.includes("Sugestão do Pérola")));
    assert.ok(tasks.items.some((task) => task.sourceModule === "perola" && task.targetModule === "workhub" && task.title.includes("Insight do Pérola")));
    assert.ok(tasks.items.some((task) => task.sourceModule === "mesa" && task.targetModule === "perola" && task.title.includes("Mesa sugeriu")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function requestJson(baseUrl, path, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  return { response, json: await response.json() };
}
