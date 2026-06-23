import { join } from "node:path";
import { createRepositoryFactory } from "./database/repositoryFactory.js";
import { MigrationService } from "./database/migrationService.js";
import { SeedService } from "./database/seedService.js";
import { DatabaseHealthService } from "./database/databaseHealthService.js";
import { MessagingHealthService } from "./messaging/messagingHealthService.js";
import { SimulatedPaymentAdapter } from "./adapters/paymentAdapter.js";
import { SimulatedErpAdapter } from "./adapters/erpAdapter.js";
import { SimulatedDeviceAdapter } from "./adapters/deviceAdapter.js";
import { SimulatedSensorAdapter } from "./adapters/sensorAdapter.js";
import { MockWhatsappAdapter } from "./adapters/mockWhatsappAdapter.js";
import { MockSttAdapter } from "./adapters/mockSttAdapter.js";
import { MockTtsAdapter } from "./adapters/mockTtsAdapter.js";
import { MockAiIntentAdapter } from "./adapters/mockAiIntentAdapter.js";
import { MockHumanHandoffAdapter } from "./adapters/mockHumanHandoffAdapter.js";
import { MockScaleAdapter } from "./adapters/mockScaleAdapter.js";
import { SambahPayAuditService } from "./services/auditService.js";
import { SambahPayCoreService } from "./services/coreService.js";
import { SambahPayWalletService } from "./services/walletService.js";
import { SambahDeviceControllerService } from "./services/deviceControllerService.js";
import { SambahPayAutoServeService } from "./services/autoserveService.js";
import { SambahPayEventService } from "./services/eventService.js";
import { SambahPayBiService } from "./services/biService.js";
import { SambahVoicePayService } from "./services/voicePayService.js";
import { SambahPermissionService } from "./services/permissionService.js";
import { SambahWeightControlService } from "./services/weightControlService.js";
import { SambahEcosystemService } from "./services/ecosystemService.js";
import { SambahSecurePickupLockerService } from "./services/securePickupLockerService.js";
import { SambahEventBusService } from "./services/eventBusService.js";
import { SambahEventOutboxService } from "./services/eventOutboxService.js";
import { SambahEventConsumerService } from "./services/eventConsumerService.js";
import { SambahEventRetryService } from "./services/eventRetryService.js";
import { SambahEventDeadLetterService } from "./services/eventDeadLetterService.js";
import { SambahErpFailoverService } from "./services/erpFailoverService.js";
import { SambahObservabilityService } from "./services/observabilityService.js";
import { SambahMetricsService } from "./services/metricsService.js";
import { SambahTraceService } from "./services/traceService.js";
import { SambahOperationalAlertService } from "./services/operationalAlertService.js";
import { SambahSecurityBridgeService } from "./services/securityBridgeService.js";
import { SambahSecurityIncidentService } from "./services/securityIncidentService.js";
import { SambahSecurityRuleService } from "./services/securityRuleService.js";
import { SambahSecurityActionService } from "./services/securityActionService.js";
import { SambahSecurityDeviceMapService } from "./services/securityDeviceMapService.js";
import { SambahLgpdService } from "./services/lgpdService.js";
import { SambahCrmService } from "./services/sambahCrmService.js";
import { SambahMemoryService } from "./services/sambahMemoryService.js";
import { SambahWhatsappMockService } from "./services/sambahWhatsappMockService.js";
import { SambahHandoffService } from "./services/sambahHandoffService.js";
import { SambahChannelService } from "./services/sambahChannelService.js";
import { SambahMetaWhatsappService } from "./services/sambahMetaWhatsappService.js";
import { SambahMetaSendService } from "./services/sambahMetaSendService.js";
import { SambahPayCoreController } from "./controllers/coreController.js";
import { SambahPayWalletController } from "./controllers/walletController.js";
import { SambahPayDeviceController } from "./controllers/deviceController.js";
import { SambahPayAutoServeController } from "./controllers/autoserveController.js";
import { SambahPayEventController } from "./controllers/eventController.js";
import { SambahPayBiController } from "./controllers/biController.js";
import { SambahVoicePayController } from "./controllers/voiceController.js";
import { SambahWeightControlController } from "./controllers/weightController.js";
import { SambahEcosystemController } from "./controllers/ecosystemController.js";
import { SambahSecurePickupLockerController } from "./controllers/securePickupLockerController.js";
import { SambahSecurityController } from "./controllers/securityController.js";
import { SambahLgpdController } from "./controllers/lgpdController.js";
import { SambahDatabaseController } from "./controllers/databaseController.js";
import { SambahMessagingController } from "./controllers/messagingController.js";
import { SambahCrmController } from "./controllers/sambahCrmController.js";
import { SambahMemoryController } from "./controllers/sambahMemoryController.js";
import { SambahWhatsappMockController } from "./controllers/sambahWhatsappMockController.js";
import { SambahHandoffController } from "./controllers/sambahHandoffController.js";
import { SambahChannelController } from "./controllers/sambahChannelController.js";
import { SambahMetaWhatsappController } from "./controllers/sambahMetaWhatsappController.js";
import { SambahMetaSendController } from "./controllers/sambahMetaSendController.js";
import { SambahPayRouter } from "./routes.js";

export function createSambahPayModule({ dataDir = "data", auditService, now = () => new Date() } = {}) {
  const eventBusFiles = {
    events: "sambah-events.json",
    "event-outbox": "sambah-event-outbox.json",
    "event-dead-letter": "sambah-event-dead-letter.json",
    "event-consumer-state": "sambah-event-consumer-state.json",
    metrics: "sambah-metrics.json",
    traces: "sambah-traces.json",
    "operational-alerts": "sambah-operational-alerts.json",
    "security-events": "sambah-security-events.json",
    "security-incidents": "sambah-security-incidents.json",
    "security-actions": "sambah-security-actions.json",
    "security-rules": "sambah-security-rules.json",
    "security-device-map": "sambah-security-device-map.json",
    "lgpd-privacy-requests": "sambah-lgpd-privacy-requests.json",
    "lgpd-retention-policies": "sambah-lgpd-retention-policies.json"
  };
  const repositoryFactory = createRepositoryFactory({ dataDir, fileNames: eventBusFiles, now });
  const repository = (name) => repositoryFactory.repository(name);
  const repositories = {
    auditLogs: repository("audit-logs"),
    payments: repository("payments"),
    paymentMethods: repository("payment-methods"),
    wallets: repository("wallets"),
    walletMovements: repository("wallet-movements"),
    blocklist: repository("customer-blocklist"),
    devices: repository("devices"),
    deviceProducts: repository("device-products"),
    deviceCommands: repository("device-commands"),
    deviceStatusLogs: repository("device-status-logs"),
    releaseTokens: repository("release-tokens"),
    releaseAttempts: repository("release-attempts"),
    deliveryEvents: repository("delivery-events"),
    flowMeterReadings: repository("flow-meter-readings"),
    stockVolumes: repository("stock-volumes"),
    machineAlerts: repository("machine-alerts"),
    autoserveSessions: repository("autoserve-sessions"),
    pickupCodes: repository("pickup-codes"),
    scaleReadings: repository("scale-readings"),
    eventAccounts: repository("event-accounts"),
    eventParticipants: repository("event-participants"),
    eventConsumptions: repository("event-consumptions"),
    biSnapshots: repository("bi-snapshots"),
    voiceMessages: repository("voice-messages"),
    voiceTranscriptions: repository("voice-transcriptions"),
    voiceIntents: repository("voice-intents"),
    voiceSessions: repository("voice-sessions"),
    voiceResponses: repository("voice-responses"),
    voiceHandoffLogs: repository("voice-handoff-logs"),
    voicePaymentLinks: repository("voice-payment-links"),
    weightReadings: repository("weight-readings"),
    weightValidations: repository("weight-validations"),
    weightEvents: repository("weight-events"),
    weightCalibrations: repository("weight-calibrations"),
    i9acaoSecurityEvents: repository("i9acao-security-events"),
    securePickupSessions: repository("secure-pickup-sessions"),
    securePickupItems: repository("secure-pickup-items"),
    securePickupAttempts: repository("secure-pickup-attempts"),
    securePickupEvents: repository("secure-pickup-events"),
    lockerZones: repository("locker-zones"),
    events: repository("events"),
    eventOutbox: repository("event-outbox"),
    eventDeadLetter: repository("event-dead-letter"),
    eventConsumerState: repository("event-consumer-state"),
    metrics: repository("metrics"),
    traces: repository("traces"),
    operationalAlerts: repository("operational-alerts"),
    securityEvents: repository("security-events"),
    securityIncidents: repository("security-incidents"),
    securityActions: repository("security-actions"),
    securityRules: repository("security-rules"),
    securityDeviceMap: repository("security-device-map"),
    lgpdPrivacyRequests: repository("lgpd-privacy-requests"),
    lgpdRetentionPolicies: repository("lgpd-retention-policies")
  };

  const audit = new SambahPayAuditService({ repository: repositories.auditLogs, auditService, now });
  const paymentAdapter = new SimulatedPaymentAdapter({ now });
  const erpAdapter = new SimulatedErpAdapter({ now });
  const deviceAdapter = new SimulatedDeviceAdapter({ now });
  const sensorAdapter = new SimulatedSensorAdapter({ now });
  const whatsappAdapter = new MockWhatsappAdapter({ now });
  const sttAdapter = new MockSttAdapter({ now });
  const ttsAdapter = new MockTtsAdapter({ now });
  const intentAdapter = new MockAiIntentAdapter({ now });
  const handoffAdapter = new MockHumanHandoffAdapter({ now });
  const scaleAdapter = new MockScaleAdapter({ now });

  const eventBusService = new SambahEventBusService({ repositories, audit, now });
  const eventOutboxService = new SambahEventOutboxService({ eventBus: eventBusService });
  const eventConsumerService = new SambahEventConsumerService({ eventBus: eventBusService });
  const eventRetryService = new SambahEventRetryService({ eventBus: eventBusService });
  const eventDeadLetterService = new SambahEventDeadLetterService({ eventBus: eventBusService });
  const erpFailoverService = new SambahErpFailoverService({ eventBus: eventBusService });
  const observabilityService = new SambahObservabilityService({ eventBus: eventBusService });
  const metricsService = new SambahMetricsService({ eventBus: eventBusService });
  const traceService = new SambahTraceService({ eventBus: eventBusService });
  const operationalAlertService = new SambahOperationalAlertService({ eventBus: eventBusService });
  const securityBridgeService = new SambahSecurityBridgeService({ repositories, audit, eventBus: eventBusService, now });
  const securityIncidentService = new SambahSecurityIncidentService({ bridge: securityBridgeService });
  const securityRuleService = new SambahSecurityRuleService({ bridge: securityBridgeService });
  const securityActionService = new SambahSecurityActionService({ bridge: securityBridgeService });
  const securityDeviceMapService = new SambahSecurityDeviceMapService({ bridge: securityBridgeService });
  const lgpdService = new SambahLgpdService({ repositories, audit, now });
  const crmService = new SambahCrmService({ dataDir, now });
  const memoryService = new SambahMemoryService({ dataDir, now });
  const handoffService = new SambahHandoffService({ dataDir, now });
  const whatsappMockService = new SambahWhatsappMockService({ memoryService, handoffService, crmService });
  const channelService = new SambahChannelService({ whatsappMockService });
  const metaWhatsappService = new SambahMetaWhatsappService({ channelService });
  const metaSendService = new SambahMetaSendService();
  const migrationService = new MigrationService();
  const seedService = new SeedService({ repositoryFactory, now });
  const databaseHealthService = new DatabaseHealthService({ repositoryFactory, migrationService, seedService });
  const messagingHealthService = new MessagingHealthService({ eventBus: eventBusService, audit, now });
  eventBusService.setSecurityBridge(securityBridgeService);

  const coreService = new SambahPayCoreService({ paymentsRepository: repositories.payments, paymentMethodsRepository: repositories.paymentMethods, audit, paymentAdapter, erpAdapter, eventBus: eventBusService, now });
  const walletService = new SambahPayWalletService({ walletsRepository: repositories.wallets, movementsRepository: repositories.walletMovements, blocklistRepository: repositories.blocklist, audit, eventBus: eventBusService, now });
  const deviceService = new SambahDeviceControllerService({ repositories, audit, deviceAdapter, sensorAdapter, eventBus: eventBusService, now });
  const autoserveService = new SambahPayAutoServeService({ repositories, audit, coreService, deviceService, erpAdapter, eventBus: eventBusService, now });
  const eventService = new SambahPayEventService({ eventAccountsRepository: repositories.eventAccounts, participantsRepository: repositories.eventParticipants, consumptionsRepository: repositories.eventConsumptions, audit, now });
  const biService = new SambahPayBiService({ repositories, now });
  const weightService = new SambahWeightControlService({ repositories, audit, scaleAdapter, deviceService, coreService, now });
  const permissionService = new SambahPermissionService({ audit, now });
  const voiceService = new SambahVoicePayService({
    repositories,
    audit,
    adapters: { whatsapp: whatsappAdapter, stt: sttAdapter, tts: ttsAdapter, intent: intentAdapter, handoff: handoffAdapter },
    coreService,
    walletService,
    autoserveService,
    deviceService,
    now
  });

  const lockerService = new SambahSecurePickupLockerService({ repositories, audit, coreService, deviceService, eventBus: eventBusService, now });
  const ecosystemService = new SambahEcosystemService({ repositories, audit, coreService, walletService, deviceService, autoserveService, voiceService, permissionService, now });

  const controllers = {
    core: new SambahPayCoreController({ coreService }),
    wallet: new SambahPayWalletController({ walletService }),
    device: new SambahPayDeviceController({ deviceService }),
    autoserve: new SambahPayAutoServeController({ autoserveService }),
    event: new SambahPayEventController({ eventService }),
    bi: new SambahPayBiController({ biService }),
    voice: new SambahVoicePayController({ voiceService }),
    weight: new SambahWeightControlController({ weightService }),
    permissions: permissionService,
    ecosystem: new SambahEcosystemController({ ecosystemService }),
    locker: new SambahSecurePickupLockerController({ lockerService }),
    security: new SambahSecurityController({ securityBridgeService }),
    lgpd: new SambahLgpdController({ lgpdService }),
    database: new SambahDatabaseController({ databaseHealthService }),
    messaging: new SambahMessagingController({ messagingService: messagingHealthService }),
    crm: new SambahCrmController({ crmService }),
    memory: new SambahMemoryController({ memoryService }),
    whatsappMock: new SambahWhatsappMockController({ whatsappMockService }),
    handoff: new SambahHandoffController({ handoffService }),
    channel: new SambahChannelController({ channelService }),
    metaWhatsapp: new SambahMetaWhatsappController({ metaWhatsappService }),
    metaSend: new SambahMetaSendController({ metaSendService }),
    events: eventBusService,
    observability: observabilityService
  };

  return {
    repositories,
    adapters: { paymentAdapter, erpAdapter, deviceAdapter, sensorAdapter, whatsappAdapter, sttAdapter, ttsAdapter, intentAdapter, handoffAdapter, scaleAdapter },
    services: { audit, coreService, walletService, deviceService, autoserveService, eventService, biService, voiceService, weightService, permissionService, ecosystemService, lockerService, eventBusService, eventOutboxService, eventConsumerService, eventRetryService, eventDeadLetterService, erpFailoverService, observabilityService, metricsService, traceService, operationalAlertService, securityBridgeService, securityIncidentService, securityRuleService, securityActionService, securityDeviceMapService, lgpdService, crmService, memoryService, whatsappMockService, handoffService, channelService, metaWhatsappService, metaSendService, migrationService, seedService, databaseHealthService, messagingHealthService },
    controllers,
    router: new SambahPayRouter({ controllers }),
    handle(req, res, url) {
      return this.router.handle(req, res, url);
    }
  };
}

