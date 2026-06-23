import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DEV_AUTH_USERS } from "./users.dev.js";

const COOKIE_NAME = "sambah_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const AUTH_ROLES = ["ADMIN", "GERENTE", "CAIXA", "OPERADOR", "ATENDENTE", "AUDITOR"];

export class SambahAuthService {
  constructor({
    users = DEV_AUTH_USERS,
    usersFile = null,
    secret = globalThis.process?.env?.SAMBAH_SESSION_SECRET || "sambah-local-dev-session-secret",
    now = () => new Date()
  } = {}) {
    this.users = users;
    this.usersFile = usersFile;
    this.secret = secret;
    this.now = now;
    this.sessions = new Map();
    this.loaded = false;
  }

  async login({ username = "", password = "" } = {}) {
    await this.ensureLoaded();
    const user = this.users.find((item) => item.username === String(username).trim().toLowerCase());
    if (!user || user.active === false || !this.verifyPassword(user, password)) {
      return { ok: false, statusCode: 401, error: "invalid_credentials", message: "Usuario ou senha invalidos" };
    }
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS).toISOString();
    const publicUser = this.publicUser(user);
    this.sessions.set(sessionId, { id: sessionId, user: publicUser, createdAt: this.now().toISOString(), expiresAt });
    return { ok: true, user: publicUser, cookie: this.sessionCookie(sessionId, { expiresAt }), expiresAt };
  }

  logout(req) {
    const session = this.sessionFromRequest(req);
    if (session?.id) this.sessions.delete(session.id);
    return { ok: true, cookie: this.clearCookie() };
  }

  currentUser(req) {
    const session = this.sessionFromRequest(req);
    return session?.user || null;
  }

  async listUsers() {
    await this.ensureLoaded();
    return this.users.map((user) => this.publicUser(user));
  }

  async createUser({ username = "", displayName = "", role = "ATENDENTE", password = "" } = {}) {
    await this.ensureLoaded();
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) return authValidation("invalid_username", "Informe um usuario valido");
    if (this.users.some((user) => user.username === normalizedUsername)) return authValidation("user_already_exists", "Usuario ja cadastrado");
    if (!validPassword(password)) return authValidation("invalid_password", "Senha deve ter pelo menos 8 caracteres");
    const user = {
      username: normalizedUsername,
      displayName: cleanDisplayName(displayName) || normalizedUsername,
      role: normalizeRole(role),
      active: true,
      ...this.hashPassword(password),
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString()
    };
    this.users.push(user);
    await this.persist();
    return { ok: true, user: this.publicUser(user) };
  }

  async updateUser(username, { displayName, role } = {}) {
    await this.ensureLoaded();
    const user = this.findUser(username);
    if (!user) return { ok: false, statusCode: 404, error: "user_not_found", message: "Usuario nao encontrado" };
    if (displayName !== undefined) user.displayName = cleanDisplayName(displayName) || user.username;
    if (role !== undefined) user.role = normalizeRole(role);
    user.updatedAt = this.now().toISOString();
    this.refreshUserSessions(user);
    await this.persist();
    return { ok: true, user: this.publicUser(user) };
  }

  async setUserActive(username, active = true) {
    await this.ensureLoaded();
    const user = this.findUser(username);
    if (!user) return { ok: false, statusCode: 404, error: "user_not_found", message: "Usuario nao encontrado" };
    user.active = Boolean(active);
    user.updatedAt = this.now().toISOString();
    if (!user.active) this.dropUserSessions(user.username);
    await this.persist();
    return { ok: true, user: this.publicUser(user) };
  }

  async changePassword(username, { password = "" } = {}) {
    await this.ensureLoaded();
    const user = this.findUser(username);
    if (!user) return { ok: false, statusCode: 404, error: "user_not_found", message: "Usuario nao encontrado" };
    if (!validPassword(password)) return authValidation("invalid_password", "Senha deve ter pelo menos 8 caracteres");
    Object.assign(user, this.hashPassword(password), { updatedAt: this.now().toISOString() });
    this.dropUserSessions(user.username);
    await this.persist();
    return { ok: true, user: this.publicUser(user) };
  }

  async ensureLoaded() {
    if (this.loaded || !this.usersFile) return;
    try {
      const raw = await readFile(this.usersFile, "utf8");
      const parsed = JSON.parse(raw);
      this.users = Array.isArray(parsed.users) ? parsed.users : [];
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.users = this.users.map((user) => ({ active: true, ...user }));
      await this.persist();
    }
    this.loaded = true;
  }

  async persist() {
    if (!this.usersFile) return;
    await mkdir(dirname(this.usersFile), { recursive: true });
    const payload = {
      updatedAt: this.now().toISOString(),
      users: this.users
    };
    await writeFile(this.usersFile, JSON.stringify(payload, null, 2));
  }

  findUser(username) {
    const normalizedUsername = normalizeUsername(username);
    return this.users.find((user) => user.username === normalizedUsername);
  }

  hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = crypto.scryptSync(String(password || ""), salt, 32).toString("hex");
    return { salt, passwordHash };
  }

  refreshUserSessions(user) {
    const publicUser = this.publicUser(user);
    for (const session of this.sessions.values()) {
      if (session.user?.username === user.username) session.user = publicUser;
    }
  }

  dropUserSessions(username) {
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.user?.username === username) this.sessions.delete(sessionId);
    }
  }

  sessionFromRequest(req) {
    const token = parseCookies(req.headers.cookie || "")[COOKIE_NAME];
    if (!token) return null;
    const sessionId = this.verifyToken(token);
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() <= this.now().getTime()) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  verifyPassword(user, password) {
    const hash = crypto.scryptSync(String(password || ""), user.salt, 32);
    const expected = Buffer.from(user.passwordHash, "hex");
    return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
  }

  publicUser(user) {
    return { username: user.username, role: user.role, displayName: user.displayName || user.username, active: user.active !== false };
  }

  sessionCookie(sessionId, { expiresAt } = {}) {
    const token = `${sessionId}.${this.sign(sessionId)}`;
    const expires = expiresAt ? `; Expires=${new Date(expiresAt).toUTCString()}` : "";
    return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${expires}`;
  }

  clearCookie() {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }

  sign(value) {
    return crypto.createHmac("sha256", this.secret).update(value).digest("base64url");
  }

  verifyToken(token = "") {
    const [sessionId, signature] = String(token).split(".");
    if (!sessionId || !signature) return null;
    const expected = this.sign(sessionId);
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
    return sessionId;
  }
}

function normalizeUsername(username = "") {
  return String(username || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

function normalizeRole(role = "ATENDENTE") {
  const value = String(role || "").trim().toUpperCase();
  return AUTH_ROLES.includes(value) ? value : "ATENDENTE";
}

function cleanDisplayName(value = "") {
  return String(value || "").trim().slice(0, 80);
}

function validPassword(password = "") {
  return String(password || "").length >= 8;
}

function authValidation(error, message) {
  return { ok: false, statusCode: 400, error, message };
}

export function parseCookies(header = "") {
  return String(header || "").split(";").reduce((cookies, part) => {
    const [rawName, ...rest] = part.trim().split("=");
    if (!rawName) return cookies;
    cookies[rawName] = rest.join("=");
    return cookies;
  }, {});
}
