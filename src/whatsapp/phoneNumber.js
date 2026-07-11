export function digitsOnly(value = "") {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeWhatsAppPhone(value = "") {
  const digits = digitsOnly(value);
  if (!digits) return "";
  if (!isBrazilianCandidate(digits)) return digits;
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  const withNinthDigit = local.length === 10 ? `${local.slice(0, 2)}9${local.slice(2)}` : local;
  return `55${withNinthDigit}`;
}

export function whatsappPhoneAliases(value = "") {
  const digits = digitsOnly(value);
  const canonical = normalizeWhatsAppPhone(digits);
  const aliases = [canonical];
  if (canonical.startsWith("55")) {
    const local = canonical.slice(2);
    if (local.length === 11 && local[2] === "9") aliases.push(`55${local.slice(0, 2)}${local.slice(3)}`);
  }
  if (digits && digits !== canonical) aliases.push(digits);
  if (digits && !digits.startsWith("55")) aliases.push(`55${digits}`);
  return [...new Set(aliases.filter(Boolean))];
}

export function sameWhatsAppPhone(left = "", right = "") {
  const leftAliases = new Set(whatsappPhoneAliases(left));
  return whatsappPhoneAliases(right).some((alias) => leftAliases.has(alias));
}

export function maskWhatsAppPhone(value = "") {
  const digits = digitsOnly(value);
  if (!digits) return "";
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function isBrazilianCandidate(digits = "") {
  if (digits.startsWith("55")) return digits.length === 12 || digits.length === 13;
  return digits.length === 10 || digits.length === 11;
}
