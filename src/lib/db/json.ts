// Reading the JSON that our database functions return. The shapes are owned
// by the SQL functions; these readers keep a surprise (a missing or renamed
// field) from becoming a crash.

import type { Json } from "@/types/database";

export function isObject(
  value: Json | undefined,
): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const str = (value: Json | undefined) =>
  typeof value === "string" ? value : null;

export const num = (value: Json | undefined) =>
  typeof value === "number" ? value : null;

export const bool = (value: Json | undefined) => value === true;

export const list = (value: Json | undefined) =>
  Array.isArray(value) ? value : [];

export const obj = (value: Json | undefined) => (isObject(value) ? value : {});
