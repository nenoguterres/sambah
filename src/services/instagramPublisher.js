const MEDIA_TYPES = new Set(["IMAGE", "REELS"]);

export class InstagramPublisher {
  constructor(config = {}) {
    this.enabled = config.enabled === true;
    this.accessToken = String(config.accessToken || "").trim();
    this.userId = String(config.userId || "").trim();
    this.account = String(config.account || "").trim();
    this.apiBaseUrl = String(config.apiBaseUrl || "https://graph.instagram.com").replace(/\/$/, "");
    this.apiVersion = String(config.apiVersion || "v25.0").replace(/^\/+|\/+$/g, "");
  }

  isEnabled() {
    return this.enabled && Boolean(this.accessToken && this.userId);
  }

  async publish(post = {}) {
    if (!this.isEnabled()) throw publisherError("instagram_not_configured", "Instagram ainda nao esta configurado no Perola.", 503);
    const mediaUrl = String(post.mediaUrl || "").trim();
    if (!/^https:\/\//i.test(mediaUrl)) throw publisherError("instagram_public_media_required", "Informe uma URL HTTPS publica para a imagem ou video.", 422);

    const mediaType = MEDIA_TYPES.has(String(post.mediaType || "").toUpperCase()) ? String(post.mediaType).toUpperCase() : "IMAGE";
    const creation = await this.request(`/${this.userId}/media`, {
      method: "POST",
      body: {
        caption: String(post.caption || ""),
        ...(mediaType === "REELS" ? { media_type: "REELS", video_url: mediaUrl } : { image_url: mediaUrl })
      }
    });
    if (!creation.id) throw publisherError("instagram_container_missing", "A Meta nao retornou o container da publicacao.", 502);
    await this.waitUntilReady(creation.id);

    const published = await this.request(`/${this.userId}/media_publish`, { method: "POST", body: { creation_id: creation.id } });
    if (!published.id) throw publisherError("instagram_media_missing", "A Meta nao retornou o ID da publicacao.", 502);
    const details = await this.request(`/${published.id}`, { query: { fields: "id,permalink,media_type,timestamp" } });
    return {
      provider: "instagram",
      account: this.account,
      creationId: creation.id,
      mediaId: published.id,
      permalink: String(details.permalink || ""),
      mediaType: String(details.media_type || mediaType),
      timestamp: String(details.timestamp || "")
    };
  }

  async waitUntilReady(containerId) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const status = await this.request(`/${containerId}`, { query: { fields: "status_code" } });
      if (status.status_code === "FINISHED") return;
      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
        throw publisherError("instagram_container_failed", `A Meta recusou o processamento da midia (${status.status_code}).`, 502);
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    throw publisherError("instagram_container_timeout", "A midia nao ficou pronta para publicacao no tempo esperado.", 504);
  }

  async request(path, { method = "GET", body = null, query = {} } = {}) {
    const url = new URL(`${this.apiBaseUrl}/${this.apiVersion}${path}`);
    const params = new URLSearchParams({ ...query, access_token: this.accessToken });
    const options = { method, headers: { accept: "application/json" } };
    if (method === "GET") {
      url.search = params.toString();
    } else {
      options.headers["content-type"] = "application/x-www-form-urlencoded";
      options.body = new URLSearchParams({ ...(body || {}), access_token: this.accessToken }).toString();
    }
    let response;
    try {
      response = await fetch(url, options);
    } catch {
      throw publisherError("instagram_network_error", "Nao foi possivel conectar a API do Instagram.", 502);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw publisherError("instagram_api_error", String(payload.error?.message || "Falha na API do Instagram."), response.status >= 400 ? response.status : 502);
    }
    return payload;
  }
}

function publisherError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}
