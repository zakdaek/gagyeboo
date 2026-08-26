import { supabase } from "@/lib/supabase";
import type {
  CostType,
  DurationUnit,
  FinancialProduct,
  IncomeOwner,
  InterestType,
  LedgerRecord,
  Loan,
  LoanPayment,
  PaymentMethod,
  ProductType,
  RateChange,
  RecordType,
  RepaymentMethod,
} from "@/lib/types";

/**
 * 앱 데이터는 Supabase의 budget / financial_products / loans 테이블에 저장한다.
 * 컬럼은 snake_case, 앱 타입은 camelCase 이므로 이 파일에서 양방향으로 변환한다.
 */

type BudgetRow = {
  id: string;
  type: RecordType;
  date: string;
  title: string;
  amount: number | string;
  category: string;
  subcategory: string;
  cost_type: CostType;
  payment_method: PaymentMethod;
  repeat_start: string;
  repeat_end: string;
  repeat_forever: boolean;
  owner: IncomeOwner;
  created_at: number | string;
};

type ProductRow = {
  id: string;
  type: ProductType;
  amount: number | string;
  months: number;
  rate: number | string;
  interest_type: InterestType;
  start_date: string | null;
  bank_name: string;
  product_name: string;
  rate_changes: RateChange[] | null;
  created_at: number | string;
};

type LoanRow = {
  id: string;
  bank: string;
  name: string;
  payment_account: string;
  amount: number | string;
  start_date: string | null;
  duration_value: number;
  duration_unit: DurationUnit;
  months: number;
  rate: number | string;
  method: RepaymentMethod;
  payments: LoanPayment[] | null;
  created_at: number | string;
};

// PostgreSQL numeric/bigint은 드라이버에 따라 문자열로 올 수 있어 항상 숫자로 정규화한다.
const num = (value: number | string | null | undefined) => Number(value ?? 0);

function toRecord(row: BudgetRow): LedgerRecord {
  return {
    id: row.id,
    type: row.type,
    date: row.date,
    title: row.title,
    amount: num(row.amount),
    category: row.category,
    subcategory: row.subcategory,
    costType: row.cost_type,
    paymentMethod: row.payment_method,
    repeatStart: row.repeat_start,
    repeatEnd: row.repeat_end,
    repeatForever: row.repeat_forever,
    owner: row.owner,
    createdAt: num(row.created_at),
  };
}

function fromRecord(record: LedgerRecord): BudgetRow {
  return {
    id: record.id,
    type: record.type,
    date: record.date,
    title: record.title,
    amount: record.amount,
    category: record.category,
    subcategory: record.subcategory || "",
    cost_type: record.costType || "",
    payment_method: record.paymentMethod || "",
    repeat_start: record.repeatStart || "",
    repeat_end: record.repeatEnd || "",
    repeat_forever: Boolean(record.repeatForever),
    owner: record.owner || "",
    created_at: record.createdAt,
  };
}

function toProduct(row: ProductRow): FinancialProduct {
  return {
    id: row.id,
    type: row.type,
    amount: num(row.amount),
    months: num(row.months),
    rate: num(row.rate),
    interestType: row.interest_type,
    startDate: row.start_date || "",
    bankName: row.bank_name,
    productName: row.product_name,
    rateChanges: row.rate_changes || [],
    createdAt: num(row.created_at),
  };
}

function fromProduct(product: FinancialProduct): ProductRow {
  return {
    id: product.id,
    type: product.type,
    amount: product.amount,
    months: product.months,
    rate: product.rate,
    interest_type: product.interestType || "simple",
    start_date: product.startDate || null,
    bank_name: product.bankName || "",
    product_name: product.productName || "",
    rate_changes: product.rateChanges || [],
    created_at: product.createdAt,
  };
}

function toLoan(row: LoanRow): Loan {
  return {
    id: row.id,
    bank: row.bank,
    name: row.name,
    paymentAccount: row.payment_account,
    amount: num(row.amount),
    startDate: row.start_date || "",
    durationValue: num(row.duration_value),
    durationUnit: row.duration_unit,
    months: num(row.months),
    rate: num(row.rate),
    method: row.method,
    payments: row.payments || [],
    createdAt: num(row.created_at),
  };
}

function fromLoan(loan: Loan): LoanRow {
  return {
    id: loan.id,
    bank: loan.bank || "",
    name: loan.name || "",
    payment_account: loan.paymentAccount || "",
    amount: loan.amount,
    start_date: loan.startDate || null,
    duration_value: loan.durationValue,
    duration_unit: loan.durationUnit || "years",
    months: loan.months,
    rate: loan.rate,
    method: loan.method || "annuity",
    payments: loan.payments || [],
    created_at: loan.createdAt,
  };
}

export type SalimgyeolData = {
  records: LedgerRecord[];
  financialProducts: FinancialProduct[];
  loans: Loan[];
};

export async function fetchAll(): Promise<SalimgyeolData> {
  const [budgetResult, productResult, loanResult] = await Promise.all([
    supabase.from("budget").select("*").order("created_at", { ascending: true }),
    supabase.from("financial_products").select("*").order("created_at", { ascending: true }),
    supabase.from("loans").select("*").order("created_at", { ascending: true }),
  ]);

  const failure = budgetResult.error || productResult.error || loanResult.error;
  if (failure) throw failure;

  return {
    records: ((budgetResult.data || []) as BudgetRow[]).map(toRecord),
    financialProducts: ((productResult.data || []) as ProductRow[]).map(toProduct),
    loans: ((loanResult.data || []) as LoanRow[]).map(toLoan),
  };
}

export async function saveBudgetRecord(record: LedgerRecord) {
  const { error } = await supabase.from("budget").upsert(fromRecord(record));
  if (error) throw error;
}

export async function deleteBudgetRecord(id: string) {
  const { error } = await supabase.from("budget").delete().eq("id", id);
  if (error) throw error;
}

export async function saveFinancialProduct(product: FinancialProduct) {
  const { error } = await supabase.from("financial_products").upsert(fromProduct(product));
  if (error) throw error;
}

export async function deleteFinancialProduct(id: string) {
  const { error } = await supabase.from("financial_products").delete().eq("id", id);
  if (error) throw error;
}

export async function saveLoanRecord(loan: Loan) {
  const { error } = await supabase.from("loans").upsert(fromLoan(loan));
  if (error) throw error;
}

export async function deleteLoanRecord(id: string) {
  const { error } = await supabase.from("loans").delete().eq("id", id);
  if (error) throw error;
}

export async function clearAllData() {
  // PostgREST는 필터 없는 delete를 거부한다. id는 항상 비어있지 않으므로 전체 삭제와 같다.
  const results = await Promise.all([
    supabase.from("budget").delete().neq("id", ""),
    supabase.from("financial_products").delete().neq("id", ""),
    supabase.from("loans").delete().neq("id", ""),
  ]);
  const failure = results.find((result) => result.error)?.error;
  if (failure) throw failure;
}

export function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

/* -------------------------------------------------------------------------
 * localStorage에 남아 있던 기존 데이터를 Supabase로 1회 옮긴다.
 * 원격이 비어 있을 때만 호출하고, 성공하면 플래그를 남겨 다시 올리지 않는다.
 * ---------------------------------------------------------------------- */

const LEGACY_RECORDS_KEY = "salimgyeol-records-v1";
const LEGACY_PRODUCTS_KEY = "salimgyeol-products-v1";
const LEGACY_LOANS_KEY = "salimgyeol-loans-v1";
const MIGRATED_FLAG = "salimgyeol-supabase-migrated-v1";

function readLegacy<T>(key: string): T[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** 옮긴 데이터가 있으면 true를 반환한다. */
export async function migrateLegacyLocalData(): Promise<boolean> {
  if (typeof window === "undefined" || localStorage.getItem(MIGRATED_FLAG)) return false;

  const records = readLegacy<LedgerRecord>(LEGACY_RECORDS_KEY).map((record) =>
    // 예전 버전이 쓰던 카테고리명 보정
    record.type === "income" && record.category === "부가수입" ? { ...record, category: "부수입" } : record,
  );
  const products = readLegacy<FinancialProduct>(LEGACY_PRODUCTS_KEY);
  const loans = readLegacy<Loan>(LEGACY_LOANS_KEY);

  if (!records.length && !products.length && !loans.length) {
    localStorage.setItem(MIGRATED_FLAG, "1");
    return false;
  }

  if (records.length) {
    const { error } = await supabase.from("budget").upsert(records.map(fromRecord));
    if (error) throw error;
  }
  if (products.length) {
    const { error } = await supabase.from("financial_products").upsert(products.map(fromProduct));
    if (error) throw error;
  }
  if (loans.length) {
    const { error } = await supabase.from("loans").upsert(loans.map(fromLoan));
    if (error) throw error;
  }

  localStorage.setItem(MIGRATED_FLAG, "1");
  return true;
}
