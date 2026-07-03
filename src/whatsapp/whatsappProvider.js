import { MockWhatsAppProvider } from "./providers/mockProvider.js";
import { MetaCloudWhatsAppProvider } from "./providers/metaCloudProvider.js";

export function createWhatsAppProvider({ config = {}, fetchImpl = globalThis.fetch, logger = console } = {}) {
  const provider = String(config.provider || "mock").toLowerCase();
  if (provider === "meta") {
    return new MetaCloudWhatsAppProvider({ config, fetchImpl });
  }
  return new MockWhatsAppProvider({ logger });
}

export function whatsappProviderStatus(provider) {
  return provider.status();
}
