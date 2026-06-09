import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditService } from "../src/auditService.js";
import { CrmService } from "../src/crmService.js";
import { EventScheduleService } from "../src/eventScheduleService.js";
import { MenuSyncService } from "../src/menuSyncService.js";
import { MesaIntegrationService } from "../src/mesaIntegrationService.js";
import { OrderDraftService } from "../src/orderDraftService.js";
import { createApp } from "../src/server.js";

function tempCrm(dir) {
  return new CrmService({
    files: {
      clientes: join(dir, "clientes.json"),
      leads: join(dir, "leads.json"),
      atendimentos: join(dir, "atendimentos.json"),
      eventos: join(dir, "eventos.json"),
      precomandas: join(dir, "precomandas.json")
    }
  });
}

test("Agenda Insano cria, lista, atualiza, cancela e calcula stats", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-events-service-"));
  try {
    const service = new EventScheduleService({
      leadsFile: join(dir, "event-leads.json"),
      servicesFile: join(dir, "insano-services.json")
    });
    const created = await service.createLead({
      eventId: "evt-service-1",
      source: "site / samBah!",
      name: "Cliente Evento",
      phone: "51999990000",
      formType: "foodtruck",
      formData: {
        date: "2026-07-10",
        place: "Porto Alegre",
        people: "80",
        message: "Food truck para festa"
      }
    });
    assert.equal(created.ok, true);
    assert.equal(created.lead.status, "new");
    assert.equal(created.lead.customer.phoneMasked, "****0000");
    assert.equal(created.lead.event.service, "Insano Food Truck");

    const duplicated = await service.createLead({ eventId: "evt-service-1", name: "Outro" });
    assert.equal(duplicated.duplicated, true);

    const updated = await service.updateLead({ id: created.lead.id, status: "quote_sent", note: "Orcamento enviado" });
    assert.equal(updated.ok, true);
    assert.equal(updated.lead.status, "quote_sent");

    const stats = await service.stats();
    assert.equal(stats.byStatus.quote_sent, 1);
    assert.equal(stats.quotePending, 0);
    assert.equal(stats.upcoming.length, 1);

    const canceled = await service.cancelLead({ id: created.lead.id, reason: "Cliente desistiu" });
    assert.equal(canceled.ok, true);
    assert.equal(canceled.lead.status, "canceled");

    const services = await service.services();
    assert.ok(services.items.some((item) => item.name === "Beer Truck / Chope"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("endpoints Agenda Insano e webhook site registram lead de evento", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-events-http-"));
  const audit = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu-cache.json") });
  const draftService = new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") });
  const mesaService = new MesaIntegrationService({ queueFile: join(dir, "queue.json") });
  const eventService = new EventScheduleService({
    leadsFile: join(dir, "event-leads.json"),
    servicesFile: join(dir, "insano-services.json")
  });
  const server = createApp({ auditService: audit, menuService, draftService, mesaService, eventService, crmService: tempCrm(dir) });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const eventResponse = await fetch(`http://127.0.0.1:${port}/webhook/site`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventId: "evt-http-1",
        source: "site",
        name: "Cliente Food",
        phone: "51999990001",
        message: "food truck evento data 2026-07-11 local centro pessoas 60",
        formType: "foodtruck",
        formData: {
          name: "Cliente Food",
          phone: "51999990001",
          date: "2026-07-11",
          place: "Centro",
          people: "60",
          message: "Evento de empresa"
        }
      })
    });
    assert.equal(eventResponse.status, 202);
    const eventPayload = await eventResponse.json();
    assert.equal(eventPayload.intent, "event_lead");
    assert.equal(eventPayload.route, "agenda_insano");
    assert.equal(eventPayload.lead.status, "new");

    const leadsResponse = await fetch(`http://127.0.0.1:${port}/admin/events/leads`);
    assert.equal(leadsResponse.status, 200);
    const leads = await leadsResponse.json();
    assert.equal(leads.total, 1);
    assert.equal(leads.items[0].customer.phoneMasked, "****0001");

    const statsResponse = await fetch(`http://127.0.0.1:${port}/admin/events/stats`);
    assert.equal(statsResponse.status, 200);
    assert.equal((await statsResponse.json()).byStatus.new, 1);

    const servicesResponse = await fetch(`http://127.0.0.1:${port}/admin/events/services`);
    assert.equal(servicesResponse.status, 200);
    assert.ok((await servicesResponse.json()).total >= 12);

    const updateResponse = await fetch(`http://127.0.0.1:${port}/admin/events/leads/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: eventPayload.lead.id, status: "needs_info" })
    });
    assert.equal(updateResponse.status, 200);

    const cancelResponse = await fetch(`http://127.0.0.1:${port}/admin/events/leads/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: eventPayload.lead.id })
    });
    assert.equal(cancelResponse.status, 200);

    const queue = await mesaService.queueSnapshot();
    assert.equal(queue.total, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test("webhook site preserva servicos internos de Food Truck e Beer Truck", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sambha-events-service-flow-"));
  const audit = new AuditService({ filePath: join(dir, "audit.json") });
  const menuService = new MenuSyncService({ cacheFile: join(dir, "menu-cache.json") });
  const draftService = new OrderDraftService({ draftsFile: join(dir, "drafts.json"), rulesFile: join(dir, "rules.json") });
  const mesaService = new MesaIntegrationService({ queueFile: join(dir, "queue.json") });
  const eventService = new EventScheduleService({
    leadsFile: join(dir, "event-leads.json"),
    servicesFile: join(dir, "insano-services.json")
  });
  const server = createApp({ auditService: audit, menuService, draftService, mesaService, eventService, crmService: tempCrm(dir) });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const createLead = async ({ eventId, service, type }) => {
      const response = await fetch(`http://127.0.0.1:${port}/webhook/site`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId,
          source: "site",
          selectedFlow: "foodtruck",
          service,
          event: { type, service },
          name: "Cliente Evento",
          phone: "51999990002",
          message: "evento data 2026-07-11 local centro pessoas 60",
          formType: "foodtruck",
          formData: {
            name: "Cliente Evento",
            phone: "51999990002",
            date: "2026-07-11",
            place: "Centro",
            people: "60",
            eventType: "Corporativo",
            message: "Evento de empresa"
          }
        })
      });
      assert.equal(response.status, 202);
      return response.json();
    };

    const foodTruck = await createLead({
      eventId: "evt-food-truck-flow",
      service: "food_truck_insano",
      type: "food_truck"
    });
    assert.equal(foodTruck.intent, "event_lead");
    assert.equal(foodTruck.route, "agenda_insano");
    assert.equal(foodTruck.lead.event.service, "food_truck_insano");
    assert.equal(foodTruck.lead.event.type, "food_truck");

    const beerTruck = await createLead({
      eventId: "evt-beer-truck-flow",
      service: "beer_truck_insano",
      type: "beer_truck"
    });
    assert.equal(beerTruck.intent, "event_lead");
    assert.equal(beerTruck.route, "agenda_insano");
    assert.equal(beerTruck.lead.event.service, "beer_truck_insano");
    assert.equal(beerTruck.lead.event.type, "beer_truck");

    const queue = await mesaService.queueSnapshot();
    assert.equal(queue.total, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
