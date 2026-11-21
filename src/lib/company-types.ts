// The kinds of CAC registration a business can pick (Dojah's company_type
// values) and the words people see. No provider code here, so a form can use it.

import type { CompanyType } from "./dojah.ts";

export const COMPANY_TYPE_OPTIONS: readonly {
  value: CompanyType;
  label: string;
}[] = [
  { value: "COMPANY", label: "Limited company (RC)" },
  { value: "BUSINESS_NAME", label: "Registered business name (BN)" },
  { value: "INCORPORATED_TRUSTEES", label: "Incorporated trustees (IT)" },
  { value: "LIMITED_PARTNERSHIP", label: "Limited partnership (LP)" },
  {
    value: "LIMITED_LIABILITY_PARTNERSHIP",
    label: "Limited liability partnership (LLP)",
  },
];

export function parseCompanyType(value: string): CompanyType | null {
  return COMPANY_TYPE_OPTIONS.find((o) => o.value === value)?.value ?? null;
}
