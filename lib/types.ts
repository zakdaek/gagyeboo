export type PageKey = "overview" | "ledger" | "loans" | "savings" | "cash";
export type RecordType = "income" | "expense";
export type CostType = "fixed" | "variable" | "";
// `creditCard` is kept for records created before cards were split by issuer.
export type PaymentMethod = "cash" | "hyundaiCard" | "shinhanCard" | "creditCard" | "";
export type IncomeOwner = "me" | "spouse" | "company" | "other" | "";
export type ProductType = "installment" | "deposit";
export type InterestType = "simple" | "compound" | "annualCompound";
export type DurationUnit = "years" | "months";
export type RepaymentMethod = "annuity" | "equalPrincipal" | "bullet";

export interface LedgerRecord {
  id: string;
  type: RecordType;
  date: string;
  title: string;
  amount: number;
  category: string;
  subcategory: string;
  costType: CostType;
  paymentMethod: PaymentMethod;
  repeatStart: string;
  repeatEnd: string;
  repeatForever: boolean;
  owner: IncomeOwner;
  createdAt: number;
  isRecurring?: boolean;
}

export interface RateChange {
  date: string;
  rate: number;
}

export interface FinancialProduct {
  id: string;
  type: ProductType;
  amount: number;
  months: number;
  rate: number;
  interestType: InterestType;
  startDate: string;
  bankName: string;
  productName: string;
  rateChanges: RateChange[];
  createdAt: number;
}

export interface LoanPayment {
  id: string;
  date: string;
  principal: number;
  interest: number;
}

export interface Loan {
  id: string;
  bank: string;
  name: string;
  paymentAccount: string;
  amount: number;
  startDate: string;
  durationValue: number;
  durationUnit: DurationUnit;
  months: number;
  rate: number;
  method: RepaymentMethod;
  payments: LoanPayment[];
  createdAt: number;
}

export interface MaturityResult {
  principal: number;
  grossInterest: number;
  tax: number;
  maturity: number;
  maturityDate: string;
}

export interface LoanCalculation {
  monthlyPayment: number;
  totalInterest: number;
  note: string;
}
