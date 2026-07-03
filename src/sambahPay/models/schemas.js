export const PAYMENT_STATUS = ["pending", "paid", "partial", "canceled", "refunded", "failed", "manual_review"];
export const WALLET_STATUS = ["active", "blocked", "expired"];
export const EVENT_ACCOUNT_STATUS = ["open", "closed", "suspended"];
export const ACCESS_TOKEN_STATUS = ["valid", "used", "expired", "canceled"];
export const RELEASE_STATUS = [
  "release_pending",
  "release_authorized",
  "releasing",
  "delivered",
  "partial_delivery",
  "delivery_failed",
  "blocked",
  "manual_review",
  "refunded"
];
export const DEVICE_TYPES = [
  "beverage_machine",
  "beer_tap",
  "soda_dispenser",
  "juice_dispenser",
  "coffee_machine",
  "smart_fridge",
  "cold_locker",
  "vending_machine",
  "buffet_scale",
  "pickup_locker",
  "access_gate",
  "generic_relay"
];
export const CONTROL_MODES = ["time_based", "pulse_based", "volume_based", "unit_based", "weight_based", "access_based"];
export const STOCK_UNITS = ["ml", "litro", "unidade", "grama", "kg", "g"];
export const WEIGHT_USE_TYPES = ["locker_zone_weight", "self_service_by_weight", "beverage_cup_weight", "smart_fridge_shelf_weight", "pickup_weight_check", "stock_inventory_weight", "generic_weight_check"];
export const WEIGHT_STATUSES = ["weight_ok", "weight_under", "weight_over", "weight_missing", "weight_unstable", "weight_fraud_suspected", "manual_review"];

export function requireFields(input, fields) {
  const missing = fields.filter((field) => input[field] === undefined || input[field] === null || input[field] === "");
  if (missing.length) {
    const error = new Error(`Campos obrigatorios ausentes: ${missing.join(", ")}`);
    error.code = "missing_required_fields";
    error.statusCode = 400;
    error.fields = missing;
    throw error;
  }
}

export function assertOneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    const error = new Error(`${field} invalido`);
    error.code = "invalid_enum";
    error.statusCode = 400;
    error.field = field;
    error.allowed = allowed;
    throw error;
  }
}

export function normalizeMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}
