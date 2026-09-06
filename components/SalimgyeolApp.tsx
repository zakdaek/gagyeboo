"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addDaysToDate,
  addMonthsToDate,
  calculateInstallmentProgress,
  calculateLoan,
  calculateMaturity,
  formatLocalDate,
  interestTypeName,
  loanBalance,
  money,
  monthKey,
  repaymentMethodName,
  uid,
} from "@/lib/calculations";
import type {
  CostType,
  DurationUnit,
  FinancialProduct,
  IncomeOwner,
  Installment,
  InterestType,
  LedgerRecord,
  Loan,
  PageKey,
  PaymentMethod,
  ProductType,
  RepaymentMethod,
} from "@/lib/types";
import {
  clearAllData,
  deleteBudgetRecord,
  deleteFinancialProduct,
  deleteLoanRecord,
  errorMessage,
  fetchAll,
  migrateLegacyLocalData,
  saveBudgetRecord,
  saveFinancialProduct,
  saveInstallment,
  saveLoanRecord,
  deleteInstallment,
} from "@/lib/store";

const categories = {
  expense: [
    "식비",
    "주거·공과금",
    "통신비",
    "대출 상환",
    "교통",
    "자동차 정비",
    "보험",
    "의료비",
    "생활용품",
    "교육",
    "문화",
    "여행",
    "출장비 지출",
    "기타 지출",
  ],
  income: ["월급", "회사 출장비 지급", "부수입", "앱테크 수입", "기타 수입"],
} as const;

const APPTECH_ADJUSTMENT_TITLE = "앱테크 누적금액 수정";

const pageInfo: Record<PageKey, { title: string; eyebrow: string; href: string }> = {
  overview: { title: "이번 달 살림", eyebrow: "우리 집 돈의 흐름", href: "/" },
  ledger: { title: "수입·지출 관리", eyebrow: "내역 · 출장비 · 월간 통계", href: "/ledger" },
  installments: { title: "할부 관리", eyebrow: "카드 할부와 남은 납부금", href: "/installments" },
  loans: { title: "대출 관리", eyebrow: "빌린 돈과 상환 흐름", href: "/loans" },
  savings: { title: "적금·예금", eyebrow: "모으는 돈과 만기 예상", href: "/savings" },
  cash: { title: "현금 모으기", eyebrow: "수입 대비 지출 분석과 실행 플랜", href: "/cash" },
};

const navItems: Array<{ page: PageKey; label: string; mobileLabel: string; icon: string }> = [
  { page: "ledger", label: "수입·지출·통계", mobileLabel: "내역·통계", icon: "≡" },
  { page: "installments", label: "할부 관리", mobileLabel: "할부", icon: "◫" },
  { page: "loans", label: "대출 관리", mobileLabel: "대출", icon: "₩" },
  { page: "savings", label: "적금·예금 계산", mobileLabel: "적금·예금", icon: "◇" },
  { page: "overview", label: "한눈에 보기", mobileLabel: "한눈에", icon: "▦" },
  { page: "cash", label: "현금 모으기 분석", mobileLabel: "현금 분석", icon: "◎" },
];

const chartColors = [
  "#347866",
  "#d37945",
  "#6879a6",
  "#b26884",
  "#8b704d",
  "#4e8d98",
  "#896ea4",
  "#b2913c",
  "#618d59",
  "#c1605a",
  "#67849b",
  "#a27655",
  "#59967d",
  "#986f82",
  "#798b47",
  "#cd8d68",
];

const paymentMethodOptions: Array<{
  value: Exclude<PaymentMethod, "" | "creditCard">;
  label: string;
}> = [
  { value: "cash", label: "현금" },
  { value: "hyundaiCard", label: "현대카드" },
  { value: "shinhanCard", label: "신한카드" },
];

function paymentMethodName(paymentMethod: PaymentMethod) {
  if (paymentMethod === "cash") return "현금";
  if (paymentMethod === "hyundaiCard") return "현대카드";
  if (paymentMethod === "shinhanCard") return "신한카드";
  if (paymentMethod === "creditCard") return "신용카드(기존)";
  return "미분류";
}

function aggregate(
  expenses: LedgerRecord[],
  keySelector: (record: LedgerRecord) => string,
): Array<{ name: string; amount: number; count: number }> {
  const groups = new Map<string, { name: string; amount: number; count: number }>();
  expenses.forEach((record) => {
    const key = keySelector(record);
    const current = groups.get(key) || { name: key, amount: 0, count: 0 };
    current.amount += record.amount;
    current.count += 1;
    groups.set(key, current);
  });
  return [...groups.values()].sort((a, b) => b.amount - a.amount);
}

type QuickIncomeForm = {
  date: string;
  amount: string;
  title: string;
  category: string;
  owner: Exclude<IncomeOwner, "">;
};

type AppTechForm = {
  date: string;
  amount: string;
  title: string;
  repeatForever: boolean;
};

type QuickExpenseForm = {
  date: string;
  amount: string;
  title: string;
  category: string;
  paymentMethod: Exclude<PaymentMethod, "">;
  subcategory: string;
  repeatStart: string;
  repeatEnd: string;
  repeatForever: boolean;
};

type ProductFormState = {
  type: ProductType;
  bankName: string;
  productName: string;
  startDate: string;
  amount: string;
  months: string;
  rate: string;
  interestType: InterestType;
};

type LoanFormState = {
  bank: string;
  name: string;
  paymentAccount: string;
  amount: string;
  startDate: string;
  durationValue: string;
  durationUnit: DurationUnit;
  rate: string;
  method: RepaymentMethod;
};

type InstallmentFormState = {
  name: string;
  cardName: string;
  totalAmount: string;
  months: string;
  paidMonths: string;
  startDate: string;
  paymentDay: string;
};

type RecordEditState = {
  id: string;
  type: "income" | "expense";
  date: string;
  amount: string;
  title: string;
  category: string;
  subcategory: string;
  costType: CostType;
  paymentMethod: PaymentMethod;
  repeatStart: string;
  repeatEnd: string;
  repeatForever: boolean;
  owner: IncomeOwner;
};

function firstOfMonth(date: Date) {
  const copy = new Date(date);
  copy.setDate(1);
  return copy;
}

function placeholderDate() {
  return new Date(2000, 0, 1);
}

export default function SalimgyeolApp({ initialPage }: { initialPage: PageKey }) {
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [financialProducts, setFinancialProducts] = useState<FinancialProduct[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [viewDate, setViewDate] = useState<Date>(placeholderDate);
  const [typeFilter, setTypeFilter] = useState("all");
  const [toast, setToast] = useState("");

  const [incomeForm, setIncomeForm] = useState<QuickIncomeForm>({
    date: "2000-01-01",
    amount: "",
    title: "",
    category: categories.income[0],
    owner: "me",
  });
  const [appTechForm, setAppTechForm] = useState<AppTechForm>({
    date: "2000-01-01",
    amount: "",
    title: "",
    repeatForever: false,
  });
  const [editingAppTechTotal, setEditingAppTechTotal] = useState(false);
  const [appTechTotalForm, setAppTechTotalForm] = useState("");
  const [fixedForm, setFixedForm] = useState<QuickExpenseForm>({
    date: "2000-01-01",
    amount: "",
    title: "",
    category: categories.expense[0],
    paymentMethod: "cash",
    subcategory: "외식비",
    repeatStart: "2000-01",
    repeatEnd: "2000-01",
    repeatForever: false,
  });
  const [variableForm, setVariableForm] = useState<QuickExpenseForm>({
    date: "2000-01-01",
    amount: "",
    title: "",
    category: categories.expense[0],
    paymentMethod: "cash",
    subcategory: "외식비",
    repeatStart: "",
    repeatEnd: "",
    repeatForever: false,
  });

  const [editingRecord, setEditingRecord] = useState<RecordEditState | null>(null);
  const [editingProductId, setEditingProductId] = useState("");
  const [productForm, setProductForm] = useState<ProductFormState>({
    type: "installment",
    bankName: "",
    productName: "",
    startDate: "2000-01-01",
    amount: "",
    months: "12",
    rate: "",
    interestType: "simple",
  });
  const [rateProductId, setRateProductId] = useState("");
  const [rateDate, setRateDate] = useState("");
  const [changedRate, setChangedRate] = useState("");

  const [editingLoanId, setEditingLoanId] = useState("");
  const [loanForm, setLoanForm] = useState<LoanFormState>({
    bank: "",
    name: "",
    paymentAccount: "",
    amount: "",
    startDate: "2000-01-01",
    durationValue: "30",
    durationUnit: "years",
    rate: "",
    method: "annuity",
  });
  const [repaymentLoanId, setRepaymentLoanId] = useState("");
  const [repaymentDate, setRepaymentDate] = useState("");
  const [repaidPrincipal, setRepaidPrincipal] = useState("");
  const [repaidInterest, setRepaidInterest] = useState("");

  const [editingInstallmentId, setEditingInstallmentId] = useState("");
  const [installmentForm, setInstallmentForm] = useState<InstallmentFormState>({
    name: "",
    cardName: "",
    totalAmount: "",
    months: "12",
    paidMonths: "0",
    startDate: "2000-01-01",
    paymentDay: "1",
  });

  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        let data = await fetchAll();
        // 원격이 비어 있을 때만 예전 localStorage 데이터를 한 번 올려준다.
        if (!data.records.length && !data.financialProducts.length && !data.loans.length) {
          if (await migrateLegacyLocalData()) data = await fetchAll();
        }
        if (cancelled) return;
        setRecords(data.records);
        setFinancialProducts(data.financialProducts);
        setLoans(data.loans);
        setInstallments(data.installments);
      } catch (error) {
        console.error(error);
        if (!cancelled) setLoadError(errorMessage(error));
      }
    };

    void load().then(() => {
      if (!cancelled) setHydrated(true);
    });

    const now = firstOfMonth(new Date());
    setViewDate(now);
    const date = formatLocalDate(new Date());
    const month = monthKey(now);
    setIncomeForm((form) => ({ ...form, date }));
    setAppTechForm((form) => ({ ...form, date }));
    setVariableForm((form) => ({ ...form, date }));
    setFixedForm((form) => ({ ...form, date, repeatStart: month, repeatEnd: month }));
    setProductForm((form) => ({ ...form, startDate: date }));
    setLoanForm((form) => ({ ...form, startDate: date }));
    setInstallmentForm((form) => ({ ...form, startDate: date }));
    setRepaymentDate(date);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const quickEntryDate = (date = viewDate) => {
    const today = new Date();
    if (monthKey(today) === monthKey(date)) return formatLocalDate(today);
    return `${monthKey(date)}-01`;
  };

  const resetQuickFormsForMonth = (date: Date) => {
    const quickDate = quickEntryDate(date);
    const key = monthKey(date);
    setIncomeForm({ date: quickDate, amount: "", title: "", category: categories.income[0], owner: "me" });
    setAppTechForm({ date: quickDate, amount: "", title: "", repeatForever: false });
    setEditingAppTechTotal(false);
    setAppTechTotalForm("");
    setVariableForm({
      date: quickDate,
      amount: "",
      title: "",
      category: categories.expense[0],
      paymentMethod: "cash",
      subcategory: "외식비",
      repeatStart: "",
      repeatEnd: "",
      repeatForever: false,
    });
    setFixedForm({
      date: quickDate,
      amount: "",
      title: "",
      category: categories.expense[0],
      paymentMethod: "cash",
      subcategory: "외식비",
      repeatStart: key,
      repeatEnd: key,
      repeatForever: false,
    });
  };

  const moveMonth = (amount: number) => {
    const next = new Date(viewDate);
    next.setMonth(next.getMonth() + amount);
    next.setDate(1);
    setViewDate(next);
    resetQuickFormsForMonth(next);
  };

  const currentRecords = useMemo(() => {
    const key = monthKey(viewDate);
    return records.flatMap((record) => {
      const isRecurringExpense = record.type === "expense" && record.costType === "fixed";
      const isRecurringAppTech = record.type === "income" && record.category === "앱테크 수입" && record.repeatForever;
      if (isRecurringExpense || isRecurringAppTech) {
        const effectiveRepeatStart = record.repeatStart || record.date.slice(0, 7);
        const repeatsWithoutEnd = record.repeatForever || !record.repeatEnd;
        if (key < effectiveRepeatStart || (!repeatsWithoutEnd && key > record.repeatEnd)) return [];
        const day = Math.min(
          Number(record.date.slice(8, 10)) || 1,
          new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate(),
        );
        return [
          {
            ...record,
            repeatStart: effectiveRepeatStart,
            repeatForever: repeatsWithoutEnd,
            date: `${key}-${String(day).padStart(2, "0")}`,
            isRecurring: true,
          },
        ];
      }
      return record.date.startsWith(key) ? [record] : [];
    });
  }, [records, viewDate]);

  const income = currentRecords.filter((record) => record.type === "income").reduce((sum, record) => sum + record.amount, 0);
  const expenses = currentRecords.filter((record) => record.type === "expense");
  const expense = expenses.reduce((sum, record) => sum + record.amount, 0);
  const fixed = expenses.filter((record) => record.costType === "fixed").reduce((sum, record) => sum + record.amount, 0);
  const variable = expense - fixed;
  const balance = income - expense;
  const maxCost = Math.max(fixed, variable, 1);
  const installmentTotal = installments.reduce((sum, item) => sum + item.totalAmount, 0);
  const installmentRemaining = installments.reduce(
    (sum, item) => sum + Math.max(0, item.totalAmount - item.monthlyAmount * item.paidMonths),
    0,
  );
  const installmentMonthly = installments
    .filter((item) => item.paidMonths < item.months)
    .reduce((sum, item) => sum + item.monthlyAmount, 0);

  const tripExpense = expenses.filter((record) => record.category === "출장비 지출").reduce((sum, record) => sum + record.amount, 0);
  const tripIncome = currentRecords
    .filter((record) => record.type === "income" && record.category === "회사 출장비 지급")
    .reduce((sum, record) => sum + record.amount, 0);
  const tripDiff = tripIncome - tripExpense;

  const salaryRows = currentRecords.filter((record) => record.type === "income" && record.category === "월급");
  const mySalary = salaryRows.filter((record) => record.owner === "me").reduce((sum, record) => sum + record.amount, 0);
  const spouseSalary = salaryRows.filter((record) => record.owner === "spouse").reduce((sum, record) => sum + record.amount, 0);
  const sideIncome = currentRecords
    .filter((record) => record.type === "income" && record.category === "부수입")
    .reduce((sum, record) => sum + record.amount, 0);
  const appTechRecords = currentRecords.filter((record) => record.type === "income" && record.category === "앱테크 수입");
  const appTechBaseIncome = appTechRecords
    .filter((record) => record.title !== APPTECH_ADJUSTMENT_TITLE)
    .reduce((sum, record) => sum + record.amount, 0);
  const appTechIncome = appTechRecords
    .reduce((sum, record) => sum + record.amount, 0);
  const appTechAdjustment = appTechRecords.find((record) => record.title === APPTECH_ADJUSTMENT_TITLE);

  const filteredRecords = useMemo(() => {
    let items = [...currentRecords];
    if (typeFilter === "income" || typeFilter === "expense") items = items.filter((record) => record.type === typeFilter);
    if (typeFilter === "fixed" || typeFilter === "variable") {
      items = items.filter((record) => record.type === "expense" && record.costType === typeFilter);
    }
    if (typeFilter === "trip") {
      items = items.filter((record) => ["출장비 지출", "회사 출장비 지급"].includes(record.category));
    }
    const appTechItems = items.filter((record) => record.type === "income" && record.category === "앱테크 수입");
    if (appTechItems.length > 0) {
      const appTechTotal = appTechItems.reduce((sum, record) => sum + record.amount, 0);
      items = [
        ...items.filter((record) => !(record.type === "income" && record.category === "앱테크 수입")),
        {
          ...appTechItems[0],
          id: `apptech-month-${monthKey(viewDate)}`,
          date: `${monthKey(viewDate)}-01`,
          title: `${String(viewDate.getFullYear()).slice(2)}년 ${viewDate.getMonth() + 1}월 앱테크 수입`,
          amount: appTechTotal,
          repeatStart: "",
          repeatEnd: "",
          repeatForever: false,
          isRecurring: false,
        },
      ];
    }
    return items.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [currentRecords, typeFilter, viewDate]);

  const categoryEntries = useMemo(() => aggregate(expenses, (record) => record.category || "기타 지출"), [expenses]);
  const paymentEntries = useMemo(
    () => aggregate(expenses, (record) => paymentMethodName(record.paymentMethod)),
    [expenses],
  );

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Sunday-first calendar: JavaScript's Sunday=0 matches the first column.
    const leadingDays = firstDay.getDay();
    const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;
    const recordsByDate = new Map<string, LedgerRecord[]>();

    currentRecords.forEach((record) => {
      const items = recordsByDate.get(record.date) || [];
      items.push(record);
      recordsByDate.set(record.date, items);
    });

    return Array.from({ length: totalCells }, (_, index) => {
      const dayNumber = index - leadingDays + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) return { date: "", dayNumber: 0, records: [] };
      const date = `${monthKey(viewDate)}-${String(dayNumber).padStart(2, "0")}`;
      return { date, dayNumber, records: recordsByDate.get(date) || [] };
    });
  }, [currentRecords, viewDate]);

  const showSummary = initialPage === "overview" || initialPage === "ledger";
  const showCalendar = initialPage === "overview";
  const showContent = initialPage === "ledger";
  const showOverviewOnly = initialPage === "overview";
  const showStatistics = initialPage === "ledger";
  const showInstallments = initialPage === "installments";
  const showLoans = initialPage === "loans";
  const showSavings = initialPage === "savings";
  const showCash = initialPage === "cash";
  const showData = false;
  const showMonthControl = initialPage !== "loans" && initialPage !== "savings" && initialPage !== "installments";

  const page = pageInfo[initialPage];

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--paper)] text-[var(--muted)]">
        <p className="text-sm">살림결을 불러오는 중...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--paper)] px-6 text-center text-[var(--muted)]">
        <div>
          <p className="text-sm font-semibold">Supabase에서 데이터를 불러오지 못했어요.</p>
          <p className="mt-2 text-xs">{loadError}</p>
          <p className="mt-1 text-xs">.env.local의 URL·키 설정과 네트워크 상태를 확인해주세요.</p>
        </div>
      </div>
    );
  }

  const showToast = (message: string) => setToast(message);

  // 화면은 먼저 바꾸고 Supabase에 반영한다. 실패하면 서버 상태를 다시 읽어 되돌린다.
  const persist = async (run: () => Promise<void>, failureMessage: string) => {
    try {
      await run();
    } catch (error) {
      console.error(error);
      setToast(`${failureMessage} 최신 데이터를 다시 불러옵니다.`);
      try {
        const data = await fetchAll();
        setRecords(data.records);
        setFinancialProducts(data.financialProducts);
        setLoans(data.loans);
        setInstallments(data.installments);
      } catch (reloadError) {
        console.error(reloadError);
      }
    }
  };

  const saveIncome = (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(incomeForm.amount);
    if (!amount || !incomeForm.title.trim()) return;
    const record: LedgerRecord = {
      id: uid(),
      type: "income",
      date: incomeForm.date,
      title: incomeForm.title.trim(),
      amount,
      category: incomeForm.category,
      subcategory: "",
      costType: "",
      paymentMethod: "",
      repeatStart: "",
      repeatEnd: "",
      repeatForever: false,
      owner: incomeForm.owner,
      createdAt: Date.now(),
    };
    setRecords((items) => [...items, record]);
    void persist(() => saveBudgetRecord(record), "수입을 저장하지 못했어요.");
    setIncomeForm({ ...incomeForm, amount: "", title: "", date: quickEntryDate() });
    showToast("수입을 저장했어요.");
  };

  const saveAppTech = (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(appTechForm.amount);
    if (!amount || !appTechForm.title.trim()) return;
    const record: LedgerRecord = {
      id: uid(),
      type: "income",
      date: appTechForm.date,
      title: appTechForm.title.trim(),
      amount,
      category: "앱테크 수입",
      subcategory: "",
      costType: "",
      paymentMethod: "",
      repeatStart: appTechForm.repeatForever ? appTechForm.date.slice(0, 7) : "",
      repeatEnd: "",
      repeatForever: appTechForm.repeatForever,
      owner: "me",
      createdAt: Date.now(),
    };
    setRecords((items) => [...items, record]);
    void persist(() => saveBudgetRecord(record), "앱테크 수입을 저장하지 못했어요.");
    setAppTechForm({ date: quickEntryDate(), amount: "", title: "", repeatForever: false });
    showToast("앱테크 수입을 저장했어요.");
  };

  const saveAppTechTotal = (event: FormEvent) => {
    event.preventDefault();
    const targetAmount = Number(appTechTotalForm);
    if (!Number.isFinite(targetAmount) || targetAmount < 0) return;

    const adjustmentAmount = targetAmount - appTechBaseIncome;
    if (adjustmentAmount === 0) {
      if (appTechAdjustment) {
        setRecords((items) => items.filter((record) => record.id !== appTechAdjustment.id));
        void persist(() => deleteBudgetRecord(appTechAdjustment.id), "앱테크 누적금액 수정을 저장하지 못했어요.");
      }
    } else {
      const adjustmentRecord: LedgerRecord = appTechAdjustment
        ? { ...appTechAdjustment, amount: adjustmentAmount }
        : {
            id: uid(),
            type: "income",
            date: `${monthKey(viewDate)}-01`,
            title: APPTECH_ADJUSTMENT_TITLE,
            amount: adjustmentAmount,
            category: "앱테크 수입",
            subcategory: "",
            costType: "",
            paymentMethod: "",
            repeatStart: "",
            repeatEnd: "",
            repeatForever: false,
            owner: "me",
            createdAt: Date.now(),
          };
      setRecords((items) => {
        const existingIndex = items.findIndex((record) => record.id === adjustmentRecord.id);
        if (existingIndex < 0) return [...items, adjustmentRecord];
        return items.map((record) => (record.id === adjustmentRecord.id ? adjustmentRecord : record));
      });
      void persist(() => saveBudgetRecord(adjustmentRecord), "앱테크 누적금액 수정을 저장하지 못했어요.");
    }
    setEditingAppTechTotal(false);
    setAppTechTotalForm("");
    showToast("앱테크 누적금액을 수정했어요.");
  };

  const saveFixed = (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(fixedForm.amount);
    if (!amount || !fixedForm.title.trim()) return;
    if (!fixedForm.repeatForever && fixedForm.repeatEnd < fixedForm.repeatStart) {
      showToast("반복 종료 월을 시작 월 이후로 설정해주세요.");
      return;
    }
    const record: LedgerRecord = {
      id: uid(),
      type: "expense",
      date: fixedForm.date,
      title: fixedForm.title.trim(),
      amount,
      category: fixedForm.category,
      subcategory: fixedForm.category === "식비" ? fixedForm.subcategory : "",
      costType: "fixed",
      paymentMethod: fixedForm.paymentMethod,
      repeatStart: fixedForm.repeatStart,
      repeatEnd: fixedForm.repeatForever ? "" : fixedForm.repeatEnd,
      repeatForever: fixedForm.repeatForever,
      owner: "",
      createdAt: Date.now(),
    };
    setRecords((items) => [...items, record]);
    void persist(() => saveBudgetRecord(record), "고정지출을 저장하지 못했어요.");
    setFixedForm({
      ...fixedForm,
      amount: "",
      title: "",
      date: quickEntryDate(),
      repeatStart: monthKey(viewDate),
      repeatEnd: monthKey(viewDate),
      repeatForever: false,
    });
    showToast("고정지출을 저장했어요.");
  };

  const saveVariable = (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(variableForm.amount);
    if (!amount || !variableForm.title.trim()) return;
    const record: LedgerRecord = {
      id: uid(),
      type: "expense",
      date: variableForm.date,
      title: variableForm.title.trim(),
      amount,
      category: variableForm.category,
      subcategory: variableForm.category === "식비" ? variableForm.subcategory : "",
      costType: "variable",
      paymentMethod: variableForm.paymentMethod,
      repeatStart: "",
      repeatEnd: "",
      repeatForever: false,
      owner: "",
      createdAt: Date.now(),
    };
    setRecords((items) => [...items, record]);
    void persist(() => saveBudgetRecord(record), "변동지출을 저장하지 못했어요.");
    setVariableForm({ ...variableForm, amount: "", title: "", date: quickEntryDate() });
    showToast("변동지출을 저장했어요.");
  };

  const openRecordEdit = (id: string) => {
    const record = records.find((item) => item.id === id);
    if (!record) return;
    setEditingRecord({
      id: record.id,
      type: record.type,
      date: record.date,
      amount: String(record.amount),
      title: record.title,
      category: record.category,
      subcategory: record.subcategory || "외식비",
      costType: record.type === "expense" ? record.costType || "variable" : "",
      paymentMethod: record.type === "expense" ? record.paymentMethod || "cash" : "",
      repeatStart: record.repeatStart || record.date.slice(0, 7),
      repeatEnd: record.repeatEnd || record.date.slice(0, 7),
      repeatForever: Boolean(record.repeatForever || (record.repeatStart && !record.repeatEnd)),
      owner: record.type === "income" ? record.owner || "me" : "",
    });
  };

  const saveEditedRecord = (event: FormEvent) => {
    event.preventDefault();
    if (!editingRecord) return;
    const original = records.find((record) => record.id === editingRecord.id);
    if (!original) return;
    if (
      editingRecord.type === "expense" &&
      editingRecord.costType === "fixed" &&
      !editingRecord.repeatForever &&
      editingRecord.repeatEnd < editingRecord.repeatStart
    ) {
      showToast("반복 종료 월을 시작 월 이후로 설정해주세요.");
      return;
    }
    const category = editingRecord.category;
    const next: LedgerRecord = {
      id: editingRecord.id,
      type: editingRecord.type,
      date: editingRecord.date,
      title: editingRecord.title.trim(),
      amount: Number(editingRecord.amount),
      category,
      subcategory: editingRecord.type === "expense" && category === "식비" ? editingRecord.subcategory : "",
      costType: editingRecord.type === "expense" ? editingRecord.costType : "",
      paymentMethod: editingRecord.type === "expense" ? editingRecord.paymentMethod : "",
      repeatStart:
        editingRecord.type === "expense" && editingRecord.costType === "fixed" ? editingRecord.repeatStart : "",
      repeatEnd:
        editingRecord.type === "expense" && editingRecord.costType === "fixed" && !editingRecord.repeatForever
          ? editingRecord.repeatEnd
          : "",
      repeatForever:
        editingRecord.type === "expense" && editingRecord.costType === "fixed" ? editingRecord.repeatForever : false,
      owner: editingRecord.type === "income" ? editingRecord.owner : "",
      createdAt: original.createdAt,
    };
    setRecords((items) => items.map((record) => (record.id === next.id ? next : record)));
    void persist(() => saveBudgetRecord(next), "내역 수정을 저장하지 못했어요.");
    setEditingRecord(null);
    showToast("내역을 수정했어요.");
  };

  const productPreview = calculateMaturity(
    productForm.type,
    Number(productForm.amount) || 0,
    Number(productForm.months) || 0,
    Number(productForm.rate) || 0,
    productForm.interestType,
    productForm.startDate,
    financialProducts.find((product) => product.id === editingProductId)?.rateChanges || [],
  );

  const resetProductForm = (type: ProductType = "installment") => {
    setEditingProductId("");
    setProductForm({
      type,
      bankName: "",
      productName: "",
      startDate: formatLocalDate(new Date()),
      amount: "",
      months: "12",
      rate: "",
      interestType: "simple",
    });
  };

  const saveProduct = (event: FormEvent) => {
    event.preventDefault();
    const existing = financialProducts.find((product) => product.id === editingProductId);
    const months = Number(productForm.months);
    const startDate = productForm.startDate;
    const maturityDate = addMonthsToDate(startDate, months);
    const product: FinancialProduct = {
      id: editingProductId || uid(),
      type: productForm.type,
      amount: Number(productForm.amount),
      months,
      rate: Number(productForm.rate),
      interestType: productForm.interestType,
      startDate,
      bankName: productForm.bankName.trim(),
      productName: productForm.productName.trim(),
      rateChanges: (existing?.rateChanges || []).filter((change) => change.date > startDate && change.date < maturityDate),
      createdAt: existing?.createdAt || Date.now(),
    };
    setFinancialProducts((items) =>
      editingProductId ? items.map((item) => (item.id === editingProductId ? product : item)) : [...items, product],
    );
    void persist(() => saveFinancialProduct(product), "상품 정보를 저장하지 못했어요.");
    const wasEditing = Boolean(editingProductId);
    resetProductForm(productForm.type);
    showToast(wasEditing ? "상품 정보를 수정했어요." : `${productForm.type === "installment" ? "적금" : "예금"} 상품을 저장했어요.`);
  };

  const editProduct = (id: string) => {
    const product = financialProducts.find((item) => item.id === id);
    if (!product) return;
    setEditingProductId(id);
    setProductForm({
      type: product.type,
      bankName: product.bankName,
      productName: product.productName,
      startDate: product.startDate || formatLocalDate(new Date(product.createdAt)),
      amount: String(product.amount),
      months: String(product.months),
      rate: String(product.rate),
      interestType: product.interestType || "simple",
    });
    window.setTimeout(() => document.getElementById("savingsForm")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const openRateDialog = (id: string) => {
    const product = financialProducts.find((item) => item.id === id);
    if (!product) return;
    const startDate = product.startDate || formatLocalDate(new Date(product.createdAt));
    const maturityDate = addMonthsToDate(startDate, product.months);
    const today = formatLocalDate(new Date());
    const min = addDaysToDate(startDate, 1);
    const max = addDaysToDate(maturityDate, -1);
    setRateProductId(id);
    setChangedRate("");
    setRateDate(today < min ? min : today > max ? max : today);
  };

  const saveRateChange = (event: FormEvent) => {
    event.preventDefault();
    if (!rateProductId || !rateDate || changedRate === "") return;
    const target = financialProducts.find((product) => product.id === rateProductId);
    if (!target) return;
    const updated: FinancialProduct = {
      ...target,
      rateChanges: [
        ...(target.rateChanges || []).filter((change) => change.date !== rateDate),
        { date: rateDate, rate: Number(changedRate) },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    };
    setFinancialProducts((items) => items.map((product) => (product.id === updated.id ? updated : product)));
    void persist(() => saveFinancialProduct(updated), "변경 금리를 저장하지 못했어요.");
    setChangedRate("");
    showToast("변경 금리를 적용해 만기액을 다시 계산했어요.");
  };

  const removeRateChange = (date: string) => {
    const target = financialProducts.find((product) => product.id === rateProductId);
    if (!target) return;
    const updated: FinancialProduct = {
      ...target,
      rateChanges: (target.rateChanges || []).filter((change) => change.date !== date),
    };
    setFinancialProducts((items) => items.map((product) => (product.id === updated.id ? updated : product)));
    void persist(() => saveFinancialProduct(updated), "금리 변경 이력을 삭제하지 못했어요.");
    showToast("금리 변경 이력을 삭제했어요.");
  };

  const loanMonths = () => {
    const value = Math.max(1, Math.floor(Number(loanForm.durationValue) || 0));
    return loanForm.durationUnit === "years" ? value * 12 : value;
  };

  const loanPreview = calculateLoan(
    Number(loanForm.amount) || 0,
    Number(loanForm.rate) || 0,
    loanMonths(),
    loanForm.method,
  );

  const resetLoanForm = () => {
    setEditingLoanId("");
    setLoanForm({
      bank: "",
      name: "",
      paymentAccount: "",
      amount: "",
      startDate: formatLocalDate(new Date()),
      durationValue: "30",
      durationUnit: "years",
      rate: "",
      method: "annuity",
    });
  };

  const saveLoan = (event: FormEvent) => {
    event.preventDefault();
    const existing = loans.find((loan) => loan.id === editingLoanId);
    const loan: Loan = {
      id: editingLoanId || uid(),
      bank: loanForm.bank.trim(),
      name: loanForm.name.trim(),
      paymentAccount: loanForm.paymentAccount.trim(),
      amount: Number(loanForm.amount),
      startDate: loanForm.startDate,
      durationValue: Math.max(1, Math.floor(Number(loanForm.durationValue))),
      durationUnit: loanForm.durationUnit,
      months: loanMonths(),
      rate: Number(loanForm.rate),
      method: loanForm.method,
      payments: existing?.payments || [],
      createdAt: existing?.createdAt || Date.now(),
    };
    setLoans((items) => (editingLoanId ? items.map((item) => (item.id === editingLoanId ? loan : item)) : [...items, loan]));
    void persist(() => saveLoanRecord(loan), "대출 정보를 저장하지 못했어요.");
    const wasEditing = Boolean(editingLoanId);
    resetLoanForm();
    showToast(wasEditing ? "대출 정보를 수정했어요." : "대출을 등록했어요.");
  };

  const resetInstallmentForm = () => {
    setEditingInstallmentId("");
    setInstallmentForm({
      name: "",
      cardName: "",
      totalAmount: "",
      months: "12",
      paidMonths: "0",
      startDate: formatLocalDate(new Date()),
      paymentDay: "1",
    });
  };

  const saveInstallmentEntry = (event: FormEvent) => {
    event.preventDefault();
    const months = Math.max(1, Math.floor(Number(installmentForm.months) || 0));
    const paidMonths = Math.min(months, Math.max(0, Math.floor(Number(installmentForm.paidMonths) || 0)));
    const totalAmount = Number(installmentForm.totalAmount);
    if (!installmentForm.name.trim() || !totalAmount || totalAmount <= 0) return;
    const installment: Installment = {
      id: editingInstallmentId || uid(),
      name: installmentForm.name.trim(),
      cardName: installmentForm.cardName.trim(),
      totalAmount,
      monthlyAmount: totalAmount / months,
      months,
      paidMonths,
      startDate: installmentForm.startDate,
      paymentDay: Math.min(31, Math.max(1, Math.floor(Number(installmentForm.paymentDay) || 1))),
      createdAt: installments.find((item) => item.id === editingInstallmentId)?.createdAt || Date.now(),
    };
    setInstallments((items) => editingInstallmentId ? items.map((item) => item.id === installment.id ? installment : item) : [...items, installment]);
    void persist(() => saveInstallment(installment), "할부 정보를 저장하지 못했어요.");
    const wasEditing = Boolean(editingInstallmentId);
    resetInstallmentForm();
    showToast(wasEditing ? "할부 정보를 수정했어요." : "할부를 등록했어요.");
  };

  const editInstallment = (id: string) => {
    const installment = installments.find((item) => item.id === id);
    if (!installment) return;
    setEditingInstallmentId(id);
    setInstallmentForm({
      name: installment.name,
      cardName: installment.cardName,
      totalAmount: String(installment.totalAmount),
      months: String(installment.months),
      paidMonths: String(installment.paidMonths),
      startDate: installment.startDate,
      paymentDay: String(installment.paymentDay),
    });
    window.setTimeout(() => document.getElementById("installmentForm")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const editLoan = (id: string) => {
    const loan = loans.find((item) => item.id === id);
    if (!loan) return;
    let durationValue = loan.durationValue;
    let durationUnit = loan.durationUnit;
    if (!durationValue || !durationUnit) {
      if (loan.months % 12 === 0) {
        durationValue = loan.months / 12;
        durationUnit = "years";
      } else {
        durationValue = loan.months;
        durationUnit = "months";
      }
    }
    setEditingLoanId(id);
    setLoanForm({
      bank: loan.bank,
      name: loan.name,
      paymentAccount: loan.paymentAccount || "",
      amount: String(loan.amount),
      startDate: loan.startDate,
      durationValue: String(durationValue),
      durationUnit,
      rate: String(loan.rate),
      method: loan.method,
    });
    window.setTimeout(() => document.getElementById("loanForm")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const openRepaymentDialog = (id: string) => {
    setRepaymentLoanId(id);
    setRepaymentDate(formatLocalDate(new Date()));
    setRepaidPrincipal("");
    setRepaidInterest("");
  };

  const saveRepayment = (event: FormEvent) => {
    event.preventDefault();
    const principal = Number(repaidPrincipal);
    const interest = Number(repaidInterest);
    if (principal <= 0 && interest <= 0) {
      showToast("상환 원금이나 이자를 입력해주세요.");
      return;
    }
    const target = loans.find((loan) => loan.id === repaymentLoanId);
    if (!target) return;
    const updated: Loan = {
      ...target,
      payments: [...(target.payments || []), { id: uid(), date: repaymentDate, principal, interest }],
    };
    setLoans((items) => items.map((loan) => (loan.id === updated.id ? updated : loan)));
    void persist(() => saveLoanRecord(updated), "상환 내역을 저장하지 못했어요.");
    setRepaidPrincipal("");
    setRepaidInterest("");
    showToast("상환 내역을 기록했어요.");
  };

  const deleteRepayment = (paymentId: string) => {
    const target = loans.find((loan) => loan.id === repaymentLoanId);
    if (!target) return;
    const updated: Loan = {
      ...target,
      payments: (target.payments || []).filter((payment) => payment.id !== paymentId),
    };
    setLoans((items) => items.map((loan) => (loan.id === updated.id ? updated : loan)));
    void persist(() => saveLoanRecord(updated), "상환 기록을 삭제하지 못했어요.");
    showToast("상환 기록을 삭제했어요.");
  };

  const resetAllData = (event: FormEvent) => {
    event.preventDefault();
    if (resetConfirmText.trim() !== "초기화") return;
    setRecords([]);
    setFinancialProducts([]);
    setLoans([]);
    void persist(() => clearAllData(), "데이터를 모두 삭제하지 못했어요.");
    const now = firstOfMonth(new Date());
    setViewDate(now);
    setTypeFilter("all");
    resetQuickFormsForMonth(now);
    resetProductForm();
    resetLoanForm();
    setResetConfirmText("");
    setResetOpen(false);
    showToast("모든 데이터를 삭제했어요. 처음부터 입력할 수 있습니다.");
  };

  const cashVariableRows = expenses.filter((record) => record.costType !== "fixed");
  const cashVariable = cashVariableRows.reduce((sum, record) => sum + record.amount, 0);
  const surplus = income - expense;
  const expenseRatio = income > 0 ? (expense / income) * 100 : 0;
  const savingsRate = income > 0 ? (Math.max(0, surplus) / income) * 100 : 0;
  const comparisonBase = Math.max(income, expense, 1);
  const flowWidth = (amount: number) => `${Math.min(100, (amount / comparisonBase) * 100)}%`;

  const categoryTotals = new Map<string, number>();
  cashVariableRows.forEach((record) =>
    categoryTotals.set(record.category || "기타 지출", (categoryTotals.get(record.category || "기타 지출") || 0) + record.amount),
  );
  const topVariable = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const variableCut = Math.round(cashVariable * 0.1);
  const positiveSurplus = Math.max(0, surplus);
  const autoSave = Math.round(positiveSurplus * 0.7);
  const monthlyCashGoal = positiveSurplus + variableCut;
  const emergencyTarget = Math.round(fixed * 3);
  const emergencyMonthly = autoSave + variableCut;
  const emergencyMonths = emergencyTarget > 0 && emergencyMonthly > 0 ? Math.ceil(emergencyTarget / emergencyMonthly) : 0;

  const cashPlans: Array<{ title: string; amount: string; reason: string; action: string; effect: string }> = [];
  if (!income && !expense) {
    cashPlans.push({
      title: "수입과 지출부터 입력하기",
      amount: "분석 준비",
      reason: "현재 선택한 달에 분석할 내역이 없어 목표 금액을 계산할 수 없어요.",
      action: "수입, 고정지출, 변동지출을 각각 입력한 뒤 이 메뉴로 돌아오세요.",
      effect: "입력된 금액을 기준으로 잉여 현금, 절감 목표, 비상금 규모가 자동 계산돼요.",
    });
  } else if (surplus > 0) {
    cashPlans.push({
      title: "잉여 현금 70% 자동 분리",
      amount: `월 ${money(autoSave)}`,
      reason: `월 수입 ${money(income)}에서 지출 ${money(expense)}을 빼면 ${money(surplus)}이 남아요. 이 금액의 70%인 ${money(autoSave)}을 저축 목표로 잡았어요.`,
      action: "급여일 다음 날 별도 입출금 계좌로 자동이체하세요. 남은 30%는 병원비·경조사비 같은 비정기 지출에 대비해 생활비 계좌에 두세요.",
      effect: `같은 흐름이 유지되면 자동 분리만으로 1년에 약 ${money(autoSave * 12)}을 모을 수 있어요.`,
    });
  } else if (surplus === 0) {
    cashPlans.push({
      title: "월간 현금흐름을 흑자로 만들기",
      amount: "수입의 5%부터",
      reason: `월 수입과 지출이 모두 ${money(income)}으로 같아 현재 남는 현금이 없어요.`,
      action: `먼저 월 ${money(Math.round(income * 0.05))}을 저축액으로 정하고, 급여일에 선이체한 뒤 남은 금액 안에서 생활하세요.`,
      effect: `수입의 5%만 먼저 분리해도 1년에 ${money(Math.round(income * 0.05) * 12)}을 확보할 수 있어요.`,
    });
  } else {
    const deficitRecovery = Math.abs(surplus);
    cashPlans.push({
      title: "월간 적자부터 해소하기",
      amount: `최소 ${money(deficitRecovery)}`,
      reason: `월 수입 ${money(income)}보다 지출 ${money(expense)}이 ${money(deficitRecovery)} 더 많아, 현재 구조가 유지되면 현금 잔액이 매달 줄어들어요.`,
      action: "고정비의 요금제·보험·구독을 먼저 재검토하고, 변동비에는 주간 한도를 설정해 적자 금액 이상을 줄이세요.",
      effect: `${money(deficitRecovery)}을 줄여야 손익이 0원이 됩니다. 그 이후부터 줄인 금액이 실제 저축 가능한 현금으로 바뀌어요.`,
    });
  }

  if (cashVariable > 0) {
    const topVariableWeekly = topVariable ? Math.round((topVariable[1] * 0.9) / 4) : 0;
    cashPlans.push({
      title: `${topVariable ? topVariable[0] : "변동지출"} 10% 줄이기`,
      amount: `월 ${money(variableCut)}`,
      reason: topVariable
        ? `전체 변동지출은 ${money(cashVariable)}이며, 가장 큰 항목은 ${topVariable[0]} ${money(topVariable[1])}이에요. 전체 변동비의 10%를 절감 목표로 계산했어요.`
        : `전체 변동지출 ${money(cashVariable)}의 10%를 절감 목표로 계산했어요.`,
      action: topVariable
        ? `${topVariable[0]} 예산을 월초에 따로 정하고 주당 약 ${money(topVariableWeekly)} 이내로 사용해보세요. 결제 직후 남은 한도를 확인하면 초과 지출을 막기 쉬워요.`
        : "변동지출을 주 단위로 나누어 한도를 정하고, 사용하지 않은 금액은 월말에 별도 계좌로 옮기세요.",
      effect: `목표를 지키면 월 ${money(variableCut)}, 1년이면 약 ${money(variableCut * 12)}의 현금을 추가로 확보할 수 있어요.`,
    });
  } else {
    cashPlans.push({
      title: "변동지출 한도 정하기",
      amount: "입력 후 계산",
      reason: "현재 선택한 달에는 변동지출 내역이 없어 절감 가능한 항목을 비교할 수 없어요.",
      action: "식비·교통비·문화비 등 금액이 달라지는 지출을 입력하세요.",
      effect: "가장 큰 변동지출 분류와 월 10% 절감액, 연간 기대 금액을 자동으로 보여드려요.",
    });
  }

  if (fixed > 0) {
    cashPlans.push({
      title: "고정지출 3개월분 비상금",
      amount: `목표 ${money(emergencyTarget)}`,
      reason: `매월 반드시 나가는 고정지출 ${money(fixed)}의 3개월분인 ${money(emergencyTarget)}을 최소 비상금 목표로 계산했어요.`,
      action:
        emergencyMonthly > 0
          ? `앞에서 제안한 자동 분리 저축과 변동비 절감액을 합쳐 매달 ${money(emergencyMonthly)}씩 비상금 계좌에 적립하세요.`
          : "월간 적자를 먼저 해소한 뒤, 확보된 잉여 현금을 비상금 전용 계좌에 우선 적립하세요.",
      effect: emergencyMonths
        ? `현재 제안 금액을 유지하면 약 ${emergencyMonths}개월 뒤 목표에 도달할 수 있어요. 목표 달성 후에는 적금이나 장기 저축으로 전환할 수 있어요.`
        : "비상금은 소득 중단이나 예상하지 못한 필수지출이 생겼을 때 약 3개월간 고정비를 감당하는 안전판이 돼요.",
    });
  } else {
    cashPlans.push({
      title: "비상금 목표 만들기",
      amount: "고정비 3개월분",
      reason: "고정지출 내역이 없어 생활 유지에 필요한 최소 비상금 규모를 계산할 수 없어요.",
      action: "주거비·보험료·통신비·대출상환처럼 매달 반드시 나가는 비용을 고정지출로 입력하세요.",
      effect: "월 고정지출의 3개월분을 목표로 정하고, 매월 모을 수 있는 금액에 따라 예상 달성 기간을 계산해드려요.",
    });
  }

  const pieBackground = (entries: Array<{ name: string; amount: number; count: number }>) => {
    if (!entries.length || !expense) return "transparent";
    let cursor = 0;
    const segments = entries.map((entry, index) => {
      const start = cursor;
      cursor += (entry.amount / expense) * 100;
      return `${chartColors[index % chartColors.length]} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${segments.join(", ")})`;
  };

  return (
    <>
      <div className="shell min-h-screen">
        <aside className="sidebar">
          <Link href="/" className="brand no-underline text-white" aria-label="살림결 홈">
            <div className="brand-mark">⌂</div>
            <strong>살림결</strong>
          </Link>
          <nav className="nav" aria-label="주 메뉴">
            {navItems.map((item) => (
              <Link
                key={item.page}
                href={pageInfo[item.page].href}
                className={`nav-item no-underline ${initialPage === item.page ? "active" : ""}`}
                aria-current={initialPage === item.page ? "page" : undefined}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="storage-note">
            <strong>내 데이터는 안전하게</strong>
            입력한 내역은 서버 전송 없이 이 브라우저에만 보관됩니다.
          </div>
        </aside>

        <main>
          <header className="topbar">
            <div>
              <p className="eyebrow">{page.eyebrow}</p>
              <h1>{page.title}</h1>
            </div>
            {showMonthControl && (
              <div className="month-control" aria-label="조회 월 선택">
                <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달">
                  ‹
                </button>
                <span id="monthLabel">
                  {viewDate.getFullYear()}. {String(viewDate.getMonth() + 1).padStart(2, "0")}
                </span>
                <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달">
                  ›
                </button>
              </div>
            )}
          </header>

          {showSummary && (
            <section className="summary-grid" aria-label="월간 요약">
              <article className="summary-card">
                <div className="summary-label">총수입</div>
                <div className="summary-value">{money(income)}</div>
                <div className="summary-caption">
                  {income ? `수입 ${currentRecords.filter((record) => record.type === "income").length}건` : "등록된 수입이 없어요"}
                </div>
              </article>
              <article className="summary-card">
                <div className="summary-label">총지출</div>
                <div className="summary-value">{money(expense)}</div>
                <div className="summary-caption">{expense ? `지출 ${expenses.length}건` : "등록된 지출이 없어요"}</div>
              </article>
              <article className="summary-card balance">
                <div className="summary-label">남은 생활비</div>
                <div className={`summary-value ${balance < 0 ? "negative" : ""}`}>{money(balance)}</div>
                <div className="summary-caption">
                  {balance < 0 ? "이번 달 지출이 수입보다 많아요" : "수입에서 지출을 뺀 금액"}
                </div>
              </article>
              <article className="summary-card installment-summary-card">
                <div className="summary-label">남은 할부</div>
                <div className="summary-value">{money(installmentRemaining)}</div>
                <div className="summary-caption">
                  {installments.length ? `매월 ${money(installmentMonthly)} · ${installments.length}건` : "등록된 할부가 없어요"}
                </div>
              </article>
            </section>
          )}

          {showCalendar && (
            <section className="panel calendar-panel" aria-labelledby="calendarTitle">
              <div className="panel-header calendar-header">
                <div>
                  <h2 className="panel-title" id="calendarTitle">월간 수입·지출 달력</h2>
                  <p className="panel-subtitle">날짜별로 어떤 항목이 들어오고 나갔는지 한눈에 확인해요</p>
                </div>
                <div className="calendar-legend" aria-label="수입과 지출 범례">
                  <span><i className="legend-dot income" />수입</span>
                  <span><i className="legend-dot expense" />지출</span>
                </div>
              </div>
              <div className="calendar-weekdays" aria-hidden="true">
                {['일', '월', '화', '수', '목', '금', '토'].map((weekday) => <span key={weekday}>{weekday}</span>)}
              </div>
              <div className="calendar-grid">
                {calendarDays.map((cell, index) => {
                  const dayIncome = cell.records.filter((record) => record.type === "income").reduce((sum, record) => sum + record.amount, 0);
                  const dayExpense = cell.records.filter((record) => record.type === "expense").reduce((sum, record) => sum + record.amount, 0);
                  return (
                    <div className={`calendar-cell ${cell.date ? "" : "is-empty"}`} key={cell.date || `empty-${index}`}>
                      {cell.date && (
                        <>
                          <time dateTime={cell.date}>{cell.dayNumber}</time>
                          <div className="calendar-amounts">
                            {dayIncome > 0 && <span className="calendar-income">+{money(dayIncome)}</span>}
                            {dayExpense > 0 && <span className="calendar-expense">−{money(dayExpense)}</span>}
                          </div>
                          <div className="calendar-records">
                            {cell.records.map((record) => (
                              <span className={record.type === "income" ? "calendar-record income" : "calendar-record expense"} key={record.id} title={`${record.title} ${money(record.amount)}`}>
                                {record.title} <b>{money(record.amount)}</b>
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {showContent && (
            <section className="content-grid single">
              <div className="left-column">
                {showOverviewOnly && (
                  <article className="panel overview-only">
                    <div className="panel-header">
                      <div>
                        <h2 className="panel-title">수입</h2>
                        <p className="panel-subtitle">부부의 월급과 부수입을 함께 모아봐요</p>
                      </div>
                    </div>
                    <div className="income-sources">
                      <div className="person-row">
                        <div className="avatar">나</div>
                        <div className="person-copy">
                          <strong>나의 월급</strong>
                          <span>현재 수입원</span>
                        </div>
                        <div className="person-amount">{money(mySalary)}</div>
                      </div>
                      <div className="person-row">
                        <div className="avatar future">배</div>
                        <div className="person-copy">
                          <strong>배우자 월급</strong>
                          <span>{spouseSalary ? "함께 계산 중" : "추가 입력 가능"}</span>
                        </div>
                        <div>{spouseSalary ? <span className="person-amount">{money(spouseSalary)}</span> : <span className="future-tag">아직 없음</span>}</div>
                      </div>
                      <div className="person-row">
                        <div className="avatar">부</div>
                        <div className="person-copy">
                          <strong>부수입</strong>
                          <span>{sideIncome ? "이번 달 부수입" : "등록된 내역 없음"}</span>
                        </div>
                        <div className="person-amount">{money(sideIncome)}</div>
                      </div>
                      <div className="person-row">
                        <div className="avatar apptech-avatar">앱</div>
                        <div className="person-copy">
                          <strong>앱테크 수입</strong>
                          <span>{appTechIncome ? "이번 달 앱테크 수입" : "매일 기록해보세요"}</span>
                        </div>
                        <div className="person-amount">{money(appTechIncome)}</div>
                      </div>
                    </div>
                  </article>
                )}

                {showOverviewOnly && (
                  <article className="panel overview-only">
                    <div className="panel-header">
                      <div>
                        <h2 className="panel-title">비용 성격별 지출</h2>
                        <p className="panel-subtitle">고정비와 변동비를 구분해 확인해요</p>
                      </div>
                    </div>
                    <div>
                      <div className="spending-row">
                        <span className="spending-label">고정 비용</span>
                        <div className="bar-track">
                          <div className="bar" style={{ width: `${(fixed / maxCost) * 100}%` }} />
                        </div>
                        <strong className="spending-amount">{money(fixed)}</strong>
                      </div>
                      <div className="spending-row">
                        <span className="spending-label">변동 비용</span>
                        <div className="bar-track">
                          <div className="bar variable" style={{ width: `${(variable / maxCost) * 100}%` }} />
                        </div>
                        <strong className="spending-amount">{money(variable)}</strong>
                      </div>
                    </div>
                    <div className="cost-legend">
                      <span>
                        <i className="legend-dot" />매달 반복되는 비용
                      </span>
                      <span>
                        <i className="legend-dot variable" />상황에 따라 달라지는 비용
                      </span>
                    </div>
                  </article>
                )}

                <article className="panel entry-panel">
                  <div className="panel-header">
                    <div>
                      <h2 className="panel-title">월간 수입·지출 입력</h2>
                      <p className="panel-subtitle">수입, 고정지출, 변동지출을 각각의 칸에서 입력해요</p>
                    </div>
                  </div>
                  <div className="entry-grid">
                    <section className="entry-box income-entry">
                      <h3>수입 입력</h3>
                      <p>월급과 부수입 등 들어온 돈을 기록해요.</p>
                      <form className="quick-form" onSubmit={saveIncome}>
                        <div className="two-fields">
                          <div className="field">
                            <label htmlFor="incomeQuickDate">날짜</label>
                            <input
                              id="incomeQuickDate"
                              type="date"
                              value={incomeForm.date}
                              onChange={(event) => setIncomeForm({ ...incomeForm, date: event.target.value })}
                              required
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="incomeQuickAmount">금액</label>
                            <input
                              id="incomeQuickAmount"
                              type="number"
                              min="1"
                              step="1"
                              placeholder="0"
                              value={incomeForm.amount}
                              onChange={(event) => setIncomeForm({ ...incomeForm, amount: event.target.value })}
                              required
                            />
                          </div>
                        </div>
                        <div className="field">
                          <label htmlFor="incomeQuickTitle">내용</label>
                          <input
                            id="incomeQuickTitle"
                            type="text"
                            lang="ko"
                            maxLength={40}
                            placeholder="예: 8월 월급"
                            value={incomeForm.title}
                            onChange={(event) => setIncomeForm({ ...incomeForm, title: event.target.value })}
                            required
                          />
                        </div>
                        <div className="two-fields">
                          <div className="field">
                            <label htmlFor="incomeQuickCategory">수입 분류</label>
                            <select
                              id="incomeQuickCategory"
                              value={incomeForm.category}
                              onChange={(event) => setIncomeForm({ ...incomeForm, category: event.target.value })}
                            >
                              {categories.income.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label htmlFor="incomeQuickOwner">수입 주체</label>
                            <select
                              id="incomeQuickOwner"
                              value={incomeForm.owner}
                              onChange={(event) =>
                                setIncomeForm({ ...incomeForm, owner: event.target.value as QuickIncomeForm["owner"] })
                              }
                            >
                              <option value="me">나</option>
                              <option value="spouse">배우자</option>
                              <option value="company">회사</option>
                              <option value="other">기타</option>
                            </select>
                          </div>
                        </div>
                        <button type="submit" className="primary-btn">
                          수입 저장
                        </button>
                      </form>
                    </section>

                    <section className="entry-box fixed-entry">
                      <h3>고정지출 입력</h3>
                      <p>정해진 기간 동안 매월 반복되는 비용을 기록해요.</p>
                      <form className="quick-form" onSubmit={saveFixed}>
                        <div className="two-fields">
                          <div className="field">
                            <label htmlFor="fixedQuickDate">최초 지출일</label>
                            <input
                              id="fixedQuickDate"
                              type="date"
                              value={fixedForm.date}
                              onChange={(event) => setFixedForm({ ...fixedForm, date: event.target.value })}
                              required
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="fixedQuickAmount">금액</label>
                            <input
                              id="fixedQuickAmount"
                              type="number"
                              min="1"
                              step="1"
                              placeholder="0"
                              value={fixedForm.amount}
                              onChange={(event) => setFixedForm({ ...fixedForm, amount: event.target.value })}
                              required
                            />
                          </div>
                        </div>
                        <div className="field">
                          <label htmlFor="fixedQuickTitle">내용</label>
                          <input
                            id="fixedQuickTitle"
                            type="text"
                            lang="ko"
                            maxLength={40}
                            placeholder="예: 월세"
                            value={fixedForm.title}
                            onChange={(event) => setFixedForm({ ...fixedForm, title: event.target.value })}
                            required
                          />
                        </div>
                        <div className="two-fields">
                          <div className="field">
                            <label htmlFor="fixedQuickCategory">지출 분류</label>
                            <select
                              id="fixedQuickCategory"
                              value={fixedForm.category}
                              onChange={(event) => setFixedForm({ ...fixedForm, category: event.target.value })}
                            >
                              {categories.expense.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label htmlFor="fixedQuickPayment">결제 수단</label>
                            <select
                              id="fixedQuickPayment"
                              value={fixedForm.paymentMethod}
                              onChange={(event) =>
                                setFixedForm({ ...fixedForm, paymentMethod: event.target.value as QuickExpenseForm["paymentMethod"] })
                              }
                            >
                              {paymentMethodOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {fixedForm.category === "식비" && (
                          <div className="field fixed-food-detail">
                            <label htmlFor="fixedQuickSubcategory">식비 상세</label>
                            <select
                              id="fixedQuickSubcategory"
                              value={fixedForm.subcategory}
                              onChange={(event) => setFixedForm({ ...fixedForm, subcategory: event.target.value })}
                            >
                              <option value="외식비">외식 비용</option>
                              <option value="재료구매비">재료 구매 비용</option>
                            </select>
                          </div>
                        )}
                        <div className="quick-repeat">
                          <div className="field">
                            <label htmlFor="fixedQuickStart">반복 시작 월</label>
                            <input
                              id="fixedQuickStart"
                              type="month"
                              value={fixedForm.repeatStart}
                              onChange={(event) => {
                                const start = event.target.value;
                                setFixedForm({
                                  ...fixedForm,
                                  repeatStart: start,
                                  repeatEnd: fixedForm.repeatEnd < start ? start : fixedForm.repeatEnd,
                                });
                              }}
                              required
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="fixedQuickEnd">반복 종료 월</label>
                            <input
                              id="fixedQuickEnd"
                              type="month"
                              min={fixedForm.repeatStart}
                              value={fixedForm.repeatEnd}
                              onChange={(event) => setFixedForm({ ...fixedForm, repeatEnd: event.target.value })}
                              required={!fixedForm.repeatForever}
                              disabled={fixedForm.repeatForever}
                            />
                          </div>
                          <label className="repeat-forever">
                            <input
                              type="checkbox"
                              checked={fixedForm.repeatForever}
                              onChange={(event) => setFixedForm({ ...fixedForm, repeatForever: event.target.checked })}
                            />
                            종료 월 없이 계속 반복
                          </label>
                        </div>
                        <button type="submit" className="primary-btn">
                          고정지출 저장
                        </button>
                      </form>
                    </section>

                    <section className="entry-box variable-entry">
                      <h3>변동지출 입력</h3>
                      <p>이번 달에 한 번 발생한 생활비를 기록해요.</p>
                      <form className="quick-form" onSubmit={saveVariable}>
                        <div className="two-fields">
                          <div className="field">
                            <label htmlFor="variableQuickDate">날짜</label>
                            <input
                              id="variableQuickDate"
                              type="date"
                              value={variableForm.date}
                              onChange={(event) => setVariableForm({ ...variableForm, date: event.target.value })}
                              required
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="variableQuickAmount">금액</label>
                            <input
                              id="variableQuickAmount"
                              type="number"
                              min="1"
                              step="1"
                              placeholder="0"
                              value={variableForm.amount}
                              onChange={(event) => setVariableForm({ ...variableForm, amount: event.target.value })}
                              required
                            />
                          </div>
                        </div>
                        <div className="field">
                          <label htmlFor="variableQuickTitle">내용</label>
                          <input
                            id="variableQuickTitle"
                            type="text"
                            lang="ko"
                            maxLength={40}
                            placeholder="예: 장보기"
                            value={variableForm.title}
                            onChange={(event) => setVariableForm({ ...variableForm, title: event.target.value })}
                            required
                          />
                        </div>
                        <div className="two-fields">
                          <div className="field">
                            <label htmlFor="variableQuickCategory">지출 분류</label>
                            <select
                              id="variableQuickCategory"
                              value={variableForm.category}
                              onChange={(event) => setVariableForm({ ...variableForm, category: event.target.value })}
                            >
                              {categories.expense.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label htmlFor="variableQuickPayment">결제 수단</label>
                            <select
                              id="variableQuickPayment"
                              value={variableForm.paymentMethod}
                              onChange={(event) =>
                                setVariableForm({
                                  ...variableForm,
                                  paymentMethod: event.target.value as QuickExpenseForm["paymentMethod"],
                                })
                              }
                            >
                              {paymentMethodOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {variableForm.category === "식비" && (
                          <div className="field variable-food-detail">
                            <label htmlFor="variableQuickSubcategory">식비 상세</label>
                            <select
                              id="variableQuickSubcategory"
                              value={variableForm.subcategory}
                              onChange={(event) => setVariableForm({ ...variableForm, subcategory: event.target.value })}
                            >
                              <option value="외식비">외식 비용</option>
                              <option value="재료구매비">재료 구매 비용</option>
                            </select>
                          </div>
                        )}
                        <button type="submit" className="primary-btn">
                          변동지출 저장
                        </button>
                      </form>
                    </section>
                  </div>
                </article>

                <article className="panel apptech-panel" id="appTechIncome">
                  <div className="panel-header">
                    <div>
                      <h2 className="panel-title">매일 앱테크 수입</h2>
                      <p className="panel-subtitle">한 번 번 금액부터 매월 반복되는 소액 수입까지 간편하게 기록해요</p>
                    </div>
                    <div className="apptech-total">
                      <span>이번 달 합계</span>
                      {editingAppTechTotal ? (
                        <form className="apptech-total-edit" onSubmit={saveAppTechTotal}>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            aria-label="이번 달 앱테크 누적금액"
                            value={appTechTotalForm}
                            onChange={(event) => setAppTechTotalForm(event.target.value)}
                            autoFocus
                          />
                          <div>
                            <button type="submit">저장</button>
                            <button type="button" onClick={() => { setEditingAppTechTotal(false); setAppTechTotalForm(""); }}>취소</button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <strong>{money(appTechIncome)}</strong>
                          <button
                            type="button"
                            className="apptech-edit-btn"
                            onClick={() => { setAppTechTotalForm(String(appTechIncome)); setEditingAppTechTotal(true); }}
                          >
                            수정
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="apptech-layout">
                    <form className="quick-form apptech-form" onSubmit={saveAppTech}>
                      <div className="two-fields">
                        <div className="field">
                          <label htmlFor="appTechDate">날짜</label>
                          <input
                            id="appTechDate"
                            type="date"
                            value={appTechForm.date}
                            onChange={(event) => setAppTechForm({ ...appTechForm, date: event.target.value })}
                            required
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="appTechAmount">수입 금액</label>
                          <input
                            id="appTechAmount"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="0"
                            value={appTechForm.amount}
                            onChange={(event) => setAppTechForm({ ...appTechForm, amount: event.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor="appTechTitle">앱 또는 활동명</label>
                        <input
                          id="appTechTitle"
                          type="text"
                          lang="ko"
                          maxLength={40}
                          placeholder="예: 만보기, 설문조사"
                          value={appTechForm.title}
                          onChange={(event) => setAppTechForm({ ...appTechForm, title: event.target.value })}
                          required
                        />
                      </div>
                      <label className="repeat-forever apptech-repeat-toggle">
                        <input
                          type="checkbox"
                          checked={appTechForm.repeatForever}
                          onChange={(event) => setAppTechForm({ ...appTechForm, repeatForever: event.target.checked })}
                        />
                        <span>매월 자동 반영</span>
                      </label>
                      <p className="apptech-repeat-note">매달 비슷하게 들어오는 포인트·캐시백이면 한 번만 등록해도 다음 달부터 자동으로 합산돼요.</p>
                      <button type="submit" className="primary-btn">앱테크 수입 저장</button>
                    </form>
                    <div className="apptech-history">
                      <div className="apptech-history-head">
                        <strong>월별 누적 기록</strong>
                        <span>건별 합산</span>
                      </div>
                      {!appTechIncome ? (
                        <div className="apptech-empty">아직 기록이 없어요. 오늘 번 금액부터 남겨보세요.</div>
                      ) : (
                        <div className="apptech-row">
                          <div>
                            <strong>{String(viewDate.getFullYear()).slice(2)}년 {viewDate.getMonth() + 1}월</strong>
                            <span>이번 달 앱테크 수입 누적</span>
                          </div>
                          <b>+{money(appTechIncome)}</b>
                        </div>
                      )}
                    </div>
                  </div>
                </article>

                <article className="panel trip-panel" id="businessTrip">
                  <div className="panel-header">
                    <div>
                      <h2 className="panel-title">출장비 정산</h2>
                      <p className="panel-subtitle">내가 쓴 돈과 회사 지급액을 비교해요</p>
                    </div>
                  </div>
                  <div className="trip-card">
                    <div className="trip-stat">
                      <span>출장 지출</span>
                      <strong>{money(tripExpense)}</strong>
                    </div>
                    <div className="trip-stat">
                      <span>회사 지급</span>
                      <strong>{money(tripIncome)}</strong>
                    </div>
                    <hr className="trip-divider" />
                    <div className="trip-result">
                      <div>
                        <small>{tripDiff < 0 ? "회사에서 더 받을 금액" : tripDiff > 0 ? "남은 출장비" : "정산 차액"}</small>
                        <strong>{money(Math.abs(tripDiff))}</strong>
                      </div>
                      <span className={`status ${tripDiff < 0 ? "due" : ""}`}>{tripDiff < 0 ? "미정산" : "정산 완료"}</span>
                    </div>
                  </div>
                </article>

                <article className="panel transactions-panel" id="transactions">
                  <div className="panel-header">
                    <div>
                      <h2 className="panel-title">수입·지출 내역</h2>
                      <p className="panel-subtitle">총 {filteredRecords.length}건</p>
                    </div>
                    <div className="toolbar">
                      <select
                        className="filter-select"
                        aria-label="내역 유형 필터"
                        value={typeFilter}
                        onChange={(event) => setTypeFilter(event.target.value)}
                      >
                        <option value="all">전체 내역</option>
                        <option value="income">수입만</option>
                        <option value="fixed">고정지출만</option>
                        <option value="variable">변동지출만</option>
                        <option value="expense">전체 지출</option>
                        <option value="trip">출장 관련</option>
                      </select>
                    </div>
                  </div>
                  {filteredRecords.length === 0 ? (
                    <div className="empty">
                      <div className="empty-icon">✎</div>
                      <strong>아직 내역이 없어요</strong>
                      <p>첫 수입이나 지출을 기록해보세요.</p>
                    </div>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>날짜</th>
                            <th>내용</th>
                            <th>분류</th>
                            <th>비용 성격</th>
                            <th>결제 수단</th>
                            <th style={{ textAlign: "right" }}>금액</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRecords.map((record) => (
                            <tr key={`${record.id}-${record.date}`}>
                              <td>{record.date.slice(5).replace("-", ".")}</td>
                              <td>
                                <span className={`type-dot ${record.type}`} />
                                {record.title}
                                {record.isRecurring && (
                                  <span className="tag">{record.repeatForever || !record.repeatEnd ? "계속 반복" : "매월 반복"}</span>
                                )}
                              </td>
                              <td>
                                {record.category}
                                {record.subcategory && <span className="tag">{record.subcategory}</span>}
                              </td>
                              <td>{record.type === "expense" ? (record.costType === "fixed" ? "고정 비용" : "변동 비용") : "—"}</td>
                              <td>
                                {record.type === "expense" ? paymentMethodName(record.paymentMethod) : "—"}
                              </td>
                              <td className={`amount-cell ${record.type}`}>
                                {record.type === "income" ? "+" : "-"}
                                {money(record.amount)}
                              </td>
                              <td className="row-actions">
                                {!record.id.startsWith("apptech-month-") && <span className="apptech-row-actions">
                                <button type="button" className="icon-btn" onClick={() => openRecordEdit(record.id)}>
                                  수정
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  onClick={() => {
                                    if (window.confirm("이 내역을 삭제할까요?")) {
                                      setRecords((items) => items.filter((item) => item.id !== record.id));
                                      void persist(() => deleteBudgetRecord(record.id), "내역을 삭제하지 못했어요.");
                                      showToast("내역을 삭제했어요.");
                                    }
                                  }}
                                >
                                  삭제
                                </button>
                                </span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              </div>
            </section>
          )}

          {showStatistics && (
            <section className="panel statistics-panel" id="statistics">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">월간 지출 통계</h2>
                  <p className="panel-subtitle">
                    {viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월 · 총지출 {money(expense)}
                  </p>
                </div>
              </div>
              <div className="statistics-grid">
                {[
                  { title: "분류별 통계", subtitle: "어디에 가장 많이 지출했는지 확인해요", entries: categoryEntries, label: "분류별 지출" },
                  { title: "결제 수단별 통계", subtitle: "현금과 카드별 사용 비중을 비교해요", entries: paymentEntries, label: "결제 수단별 지출" },
                ].map((group) => (
                  <div className="statistics-group" key={group.title}>
                    <h3>{group.title}</h3>
                    <p>{group.subtitle}</p>
                    {group.entries.length ? (
                      <div className="pie-stat-content">
                        <div className="pie-figure">
                          <div
                            className="pie-chart"
                            style={{ background: pieBackground(group.entries) }}
                            role="img"
                            aria-label={`${group.label} 원형 그래프`}
                          >
                            <div className="pie-center">
                              <span>총지출</span>
                              <strong>{money(expense)}</strong>
                            </div>
                          </div>
                        </div>
                        <div className="stats-table-wrap">
                          <table className="stats-table" aria-label={`${group.label} 상세`}>
                            <thead>
                              <tr>
                                <th scope="col">항목</th>
                                <th scope="col">건수</th>
                                <th scope="col">금액</th>
                                <th scope="col">비중</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.entries.map((entry, index) => (
                                <tr key={entry.name}>
                                  <td>
                                    <i className="chart-swatch" style={{ background: chartColors[index % chartColors.length] }} />
                                    {entry.name}
                                  </td>
                                  <td>{entry.count}건</td>
                                  <td>{money(entry.amount)}</td>
                                  <td>{expense ? ((entry.amount / expense) * 100).toFixed(1) : "0.0"}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="stats-empty">통계를 표시할 지출 내역이 없어요.</div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {showInstallments && (
            <section className="panel installment-panel" id="installments">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">할부 관리</h2>
                  <p className="panel-subtitle">카드 할부 금액과 남은 납부 회차를 한눈에 관리해요</p>
                </div>
                <div className="installment-overview">
                  <div><span>남은 할부</span><strong>{money(installmentRemaining)}</strong></div>
                  <div><span>이번 달 납부 예정</span><strong>{money(installmentMonthly)}</strong></div>
                </div>
              </div>
              <div className="installment-layout">
                <form id="installmentForm" className="installment-form" onSubmit={saveInstallmentEntry}>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="installmentName">할부 내용</label>
                      <input id="installmentName" type="text" maxLength={40} placeholder="예: 노트북" value={installmentForm.name} onChange={(event) => setInstallmentForm({ ...installmentForm, name: event.target.value })} required />
                    </div>
                    <div className="field">
                      <label htmlFor="installmentCard">카드·결제수단</label>
                      <input id="installmentCard" type="text" maxLength={30} placeholder="예: 현대카드" value={installmentForm.cardName} onChange={(event) => setInstallmentForm({ ...installmentForm, cardName: event.target.value })} />
                    </div>
                    <div className="field full">
                      <label htmlFor="installmentTotal">총 할부 금액</label>
                      <input id="installmentTotal" type="number" min="1" step="1" placeholder="1200000" value={installmentForm.totalAmount} onChange={(event) => setInstallmentForm({ ...installmentForm, totalAmount: event.target.value })} required />
                    </div>
                    <div className="field">
                      <label htmlFor="installmentMonths">할부 기간</label>
                      <input id="installmentMonths" type="number" min="1" max="120" step="1" value={installmentForm.months} onChange={(event) => setInstallmentForm({ ...installmentForm, months: event.target.value })} required />
                    </div>
                    <div className="field">
                      <label htmlFor="installmentPaidMonths">납부 완료 회차</label>
                      <input id="installmentPaidMonths" type="number" min="0" step="1" value={installmentForm.paidMonths} onChange={(event) => setInstallmentForm({ ...installmentForm, paidMonths: event.target.value })} required />
                    </div>
                    <div className="field">
                      <label htmlFor="installmentStartDate">할부 시작일</label>
                      <input id="installmentStartDate" type="date" value={installmentForm.startDate} onChange={(event) => setInstallmentForm({ ...installmentForm, startDate: event.target.value })} required />
                    </div>
                    <div className="field">
                      <label htmlFor="installmentPaymentDay">결제일</label>
                      <input id="installmentPaymentDay" type="number" min="1" max="31" step="1" value={installmentForm.paymentDay} onChange={(event) => setInstallmentForm({ ...installmentForm, paymentDay: event.target.value })} required />
                    </div>
                  </div>
                  <p className="form-note">월 납입액은 총 할부 금액을 할부 기간으로 나눠 자동 계산합니다.</p>
                  <div className="modal-actions">
                    {editingInstallmentId && <button type="button" className="secondary-btn" onClick={resetInstallmentForm}>수정 취소</button>}
                    <button type="submit" className="primary-btn">{editingInstallmentId ? "할부 정보 수정" : "할부 등록"}</button>
                  </div>
                </form>
                <div className="installment-list">
                  <div className="panel-header"><div><h3 className="panel-title">등록한 할부</h3><p className="panel-subtitle">총 {installments.length}건 · 전체 {money(installmentTotal)}</p></div></div>
                  {installments.length === 0 ? <div className="product-empty">관리할 할부를 등록해보세요.</div> : installments.slice().sort((a, b) => b.createdAt - a.createdAt).map((item) => {
                    const remaining = Math.max(0, item.totalAmount - item.monthlyAmount * item.paidMonths);
                    const progress = item.months ? Math.min(100, (item.paidMonths / item.months) * 100) : 0;
                    return (
                      <article className="installment-item" key={item.id}>
                        <div className="installment-item-head"><div><strong>{item.name}</strong><span>{item.cardName || "결제수단 미입력"} · 매월 {money(item.monthlyAmount)} · {item.paymentDay}일 결제</span></div><b>{money(remaining)}</b></div>
                        <div className="installment-track"><div style={{ width: `${progress}%` }} /></div>
                        <div className="installment-item-foot"><span>{item.paidMonths}/{item.months}회 납부 · 남은 {money(remaining)}</span><div className="loan-actions"><button type="button" className="icon-btn" onClick={() => editInstallment(item.id)}>수정</button><button type="button" className="icon-btn" onClick={() => { if (window.confirm("이 할부를 삭제할까요?")) { setInstallments((items) => items.filter((current) => current.id !== item.id)); void persist(() => deleteInstallment(item.id), "할부를 삭제하지 못했어요."); showToast("할부를 삭제했어요."); } }}>삭제</button></div></div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {showLoans && (
            <section className="panel loan-panel" id="loans">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">대출 관리</h2>
                  <p className="panel-subtitle">대출 조건과 실제 상환 내역을 함께 관리해요</p>
                </div>
              </div>
              <div className="loan-layout">
                <form id="loanForm" onSubmit={saveLoan}>
                  <div className="savings-form-grid">
                    <div className="field">
                      <label htmlFor="loanBank">금융기관</label>
                      <input
                        id="loanBank"
                        type="text"
                        lang="ko"
                        maxLength={30}
                        placeholder="예: 행복은행"
                        value={loanForm.bank}
                        onChange={(event) => setLoanForm({ ...loanForm, bank: event.target.value })}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="loanName">대출 상품명</label>
                      <input
                        id="loanName"
                        type="text"
                        lang="ko"
                        maxLength={40}
                        placeholder="예: 주택담보대출"
                        value={loanForm.name}
                        onChange={(event) => setLoanForm({ ...loanForm, name: event.target.value })}
                        required
                      />
                    </div>
                    <div className="field full">
                      <label htmlFor="loanPaymentAccount">납입 계좌</label>
                      <input
                        id="loanPaymentAccount"
                        type="text"
                        lang="ko"
                        maxLength={50}
                        placeholder="예: 행복은행 123-456-789012"
                        value={loanForm.paymentAccount}
                        onChange={(event) => setLoanForm({ ...loanForm, paymentAccount: event.target.value })}
                        required
                      />
                    </div>
                    <div className="field full">
                      <label htmlFor="loanAmount">대출 실행 금액</label>
                      <input
                        id="loanAmount"
                        type="number"
                        min="1"
                        step="1"
                        placeholder="100000000"
                        value={loanForm.amount}
                        onChange={(event) => setLoanForm({ ...loanForm, amount: event.target.value })}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="loanStartDate">대출 실행일</label>
                      <input
                        id="loanStartDate"
                        type="date"
                        value={loanForm.startDate}
                        onChange={(event) => setLoanForm({ ...loanForm, startDate: event.target.value })}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="loanDuration">상환 기간</label>
                      <div className="duration-input">
                        <input
                          id="loanDuration"
                          type="number"
                          min="1"
                          step="1"
                          value={loanForm.durationValue}
                          onChange={(event) => setLoanForm({ ...loanForm, durationValue: event.target.value })}
                          required
                        />
                        <select
                          aria-label="상환 기간 단위"
                          value={loanForm.durationUnit}
                          onChange={(event) => setLoanForm({ ...loanForm, durationUnit: event.target.value as DurationUnit })}
                        >
                          <option value="years">년</option>
                          <option value="months">개월</option>
                        </select>
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="loanRate">연 금리</label>
                      <input
                        id="loanRate"
                        type="number"
                        min="0"
                        max="30"
                        step="0.01"
                        placeholder="4.20"
                        value={loanForm.rate}
                        onChange={(event) => setLoanForm({ ...loanForm, rate: event.target.value })}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="repaymentMethod">상환 방식</label>
                      <select
                        id="repaymentMethod"
                        value={loanForm.method}
                        onChange={(event) => setLoanForm({ ...loanForm, method: event.target.value as RepaymentMethod })}
                      >
                        <option value="annuity">원리금균등</option>
                        <option value="equalPrincipal">원금균등</option>
                        <option value="bullet">만기일시상환</option>
                      </select>
                    </div>
                    <div className="loan-preview">
                      <div>
                        <span>
                          {loanForm.method === "equalPrincipal"
                            ? "첫 달 예상 상환액"
                            : loanForm.method === "bullet"
                              ? "예상 월 이자"
                              : "예상 월 상환액"}
                        </span>
                        <strong>{money(loanPreview.monthlyPayment)}</strong>
                      </div>
                      <div>
                        <span>예상 총이자</span>
                        <strong>{money(loanPreview.totalInterest)}</strong>
                      </div>
                      <p>{loanPreview.note}</p>
                    </div>
                    <div className="product-form-actions">
                      {editingLoanId && (
                        <button type="button" className="secondary-btn" onClick={resetLoanForm}>
                          수정 취소
                        </button>
                      )}
                      <button type="submit" className="primary-btn">
                        {editingLoanId ? "대출 정보 수정하기" : "대출 등록하기"}
                      </button>
                    </div>
                  </div>
                </form>

                <div>
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title">등록한 대출</h3>
                      <p className="panel-subtitle">총 {loans.length}개</p>
                    </div>
                  </div>
                  {loans.length === 0 ? (
                    <div className="product-empty">관리할 대출을 등록해보세요.</div>
                  ) : (
                    <div className="loan-list">
                      {[...loans]
                        .sort((a, b) => b.createdAt - a.createdAt)
                        .map((loan) => {
                          const balanceInfo = loanBalance(loan);
                          const estimated = calculateLoan(loan.amount, loan.rate, loan.months, loan.method);
                          const paidInterest = (loan.payments || []).reduce((sum, payment) => sum + payment.interest, 0);
                          const progress = loan.amount ? Math.min(100, (balanceInfo.repaid / loan.amount) * 100) : 0;
                          const maturity = addMonthsToDate(loan.startDate, loan.months);
                          return (
                            <article className="loan-item" key={loan.id}>
                              <div className="loan-item-head">
                                <div className="loan-icon">₩</div>
                                <div className="loan-copy">
                                  <strong>{loan.name}</strong>
                                  <span>
                                    {loan.bank} · {repaymentMethodName(loan.method)} · 연 {loan.rate}%
                                    <br />
                                    {loan.paymentAccount ? (
                                      <>
                                        납입 계좌 {loan.paymentAccount}
                                        <br />
                                      </>
                                    ) : null}
                                    실행 {loan.startDate} · 만기 {maturity}
                                  </span>
                                </div>
                                <div className="loan-balance">
                                  <small>남은 원금</small>
                                  <strong>{money(balanceInfo.remaining)}</strong>
                                </div>
                              </div>
                              <div className="loan-progress">
                                <div style={{ width: `${progress}%` }} />
                              </div>
                              <div className="loan-item-foot">
                                <span>
                                  상환 원금 {money(balanceInfo.repaid)} · 납부 이자 {money(paidInterest)} · 예상 월액 {money(estimated.monthlyPayment)}
                                </span>
                                <div className="loan-actions">
                                  <button type="button" className="icon-btn" onClick={() => editLoan(loan.id)}>
                                    수정
                                  </button>
                                  <button type="button" className="icon-btn" onClick={() => openRepaymentDialog(loan.id)}>
                                    상환 기록
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={() => {
                                      if (window.confirm("이 대출과 상환 기록을 모두 삭제할까요?")) {
                                        setLoans((items) => items.filter((item) => item.id !== loan.id));
                                        void persist(() => deleteLoanRecord(loan.id), "대출을 삭제하지 못했어요.");
                                        showToast("대출 정보를 삭제했어요.");
                                      }
                                    }}
                                  >
                                    삭제
                                  </button>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {showSavings && (
            <section className="panel savings-panel" id="savings">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">적금·예금 계산</h2>
                  <p className="panel-subtitle">금리와 기간을 입력해 세후 만기 예상액을 확인해요</p>
                </div>
              </div>
              <div className="savings-layout">
                <form id="savingsForm" onSubmit={saveProduct}>
                  <div className="product-tabs" role="tablist">
                    <button
                      type="button"
                      className={productForm.type === "installment" ? "active" : ""}
                      onClick={() => setProductForm({ ...productForm, type: "installment" })}
                    >
                      적금
                    </button>
                    <button
                      type="button"
                      className={productForm.type === "deposit" ? "active" : ""}
                      onClick={() => setProductForm({ ...productForm, type: "deposit" })}
                    >
                      예금
                    </button>
                  </div>
                  <div className="savings-form-grid">
                    <div className="field">
                      <label htmlFor="bankName">가입 은행</label>
                      <input
                        id="bankName"
                        type="text"
                        lang="ko"
                        maxLength={30}
                        placeholder="예: 행복은행"
                        value={productForm.bankName}
                        onChange={(event) => setProductForm({ ...productForm, bankName: event.target.value })}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="productName">가입 상품명</label>
                      <input
                        id="productName"
                        type="text"
                        lang="ko"
                        maxLength={40}
                        placeholder="예: 매일 든든 적금"
                        value={productForm.productName}
                        onChange={(event) => setProductForm({ ...productForm, productName: event.target.value })}
                        required
                      />
                    </div>
                    <div className="field full">
                      <label htmlFor="subscriptionDate">가입일</label>
                      <input
                        id="subscriptionDate"
                        type="date"
                        value={productForm.startDate}
                        onChange={(event) => setProductForm({ ...productForm, startDate: event.target.value })}
                        required
                      />
                    </div>
                    <div className="field full">
                      <label htmlFor="savingAmount">{productForm.type === "installment" ? "월 납입액" : "예금 금액"}</label>
                      <input
                        id="savingAmount"
                        type="number"
                        min="1"
                        step="1"
                        placeholder={productForm.type === "installment" ? "500000" : "10000000"}
                        value={productForm.amount}
                        onChange={(event) => setProductForm({ ...productForm, amount: event.target.value })}
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="savingPeriod">{productForm.type === "installment" ? "적금 기간" : "예금 기간"}</label>
                      <select
                        id="savingPeriod"
                        value={productForm.months}
                        onChange={(event) => setProductForm({ ...productForm, months: event.target.value })}
                      >
                        {[6, 12, 18, 24, 36, 60].map((months) => (
                          <option key={months} value={months}>
                            {months}개월
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="interestRate">연 금리</label>
                      <input
                        id="interestRate"
                        type="number"
                        min="0"
                        max="30"
                        step="0.01"
                        placeholder="3.50"
                        value={productForm.rate}
                        onChange={(event) => setProductForm({ ...productForm, rate: event.target.value })}
                        required
                      />
                    </div>
                    <div className="field full">
                      <label htmlFor="interestType">이자 계산 방식</label>
                      <select
                        id="interestType"
                        value={productForm.interestType}
                        onChange={(event) => setProductForm({ ...productForm, interestType: event.target.value as InterestType })}
                      >
                        <option value="simple">단리</option>
                        <option value="compound">복리 (월복리)</option>
                        <option value="annualCompound">복리 (연복리)</option>
                      </select>
                    </div>
                    <div className="maturity-preview" aria-live="polite">
                      <span>세후 만기 예상액</span>
                      <strong>{money(productPreview.maturity)}</strong>
                      <small>
                        {Number(productForm.amount) && Number(productForm.rate)
                          ? `원금 ${money(productPreview.principal)} + 세후 이자 ${money(productPreview.grossInterest - productPreview.tax)} · ${interestTypeName(productForm.interestType)} · 일반과세 15.4%${productPreview.maturityDate ? ` · 만기 ${productPreview.maturityDate}` : ""}`
                          : `일반과세 15.4% 기준 · ${interestTypeName(productForm.interestType)} 예상`}
                      </small>
                    </div>
                    <div className="product-form-actions">
                      {editingProductId && (
                        <button type="button" className="secondary-btn" onClick={() => resetProductForm()}>
                          수정 취소
                        </button>
                      )}
                      <button type="submit" className="primary-btn">
                        {editingProductId ? "상품 정보 수정하기" : "이 상품 저장하기"}
                      </button>
                    </div>
                  </div>
                </form>

                <div>
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title">저장한 금융상품</h3>
                      <p className="panel-subtitle">총 {financialProducts.length}개</p>
                    </div>
                  </div>
                  {financialProducts.length === 0 ? (
                    <div className="product-empty">계산한 적금이나 예금을 저장해보세요.</div>
                  ) : (
                    <div className="product-list">
                      {[...financialProducts]
                        .sort((a, b) => b.createdAt - a.createdAt)
                        .map((product) => {
                          const startDate = product.startDate || formatLocalDate(new Date(product.createdAt));
                          const rateChanges = product.rateChanges || [];
                          const result = calculateMaturity(
                            product.type,
                            product.amount,
                            product.months,
                            product.rate,
                            product.interestType || "simple",
                            startDate,
                            rateChanges,
                          );
                          const latestRate = [...rateChanges].sort((a, b) => b.date.localeCompare(a.date))[0]?.rate ?? product.rate;
                          const progress = product.type === "installment" ? calculateInstallmentProgress(product, startDate) : null;
                          return (
                            <article className="product-item" key={product.id}>
                              <div className={`product-kind ${product.type}`}>{product.type === "installment" ? "적금" : "예금"}</div>
                              <div className="product-copy">
                                <strong>{product.productName}</strong>
                                <span>
                                  {product.bankName} · {product.type === "installment" ? `월 ${money(product.amount)}` : money(product.amount)} · {product.months}개월 · 최초 연 {product.rate}% · {interestTypeName(product.interestType || "simple")}
                                  {rateChanges.length ? ` · 금리 변경 ${rateChanges.length}회 · 현재 ${latestRate}%` : ""}
                                  <br />
                                  가입 {startDate} · 만기 {result.maturityDate}
                                </span>
                                {progress && (
                                  <div className="installment-progress">
                                    <span>
                                      현재 적립금액 <strong>{money(progress.principal)}</strong>
                                    </span>
                                    <span>
                                      현재 세전이자 <strong>{money(progress.grossInterest)}</strong>
                                    </span>
                                    <span>
                                      {progress.paymentCount}회 납입 · {progress.asOfDate} 기준
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="product-result">
                                <small>변동금리 반영 세후 만기</small>
                                <strong>{money(result.maturity)}</strong>
                              </div>
                              <div className="product-actions">
                                <button type="button" className="icon-btn" onClick={() => editProduct(product.id)}>
                                  수정
                                </button>
                                <button type="button" className="icon-btn" onClick={() => openRateDialog(product.id)}>
                                  금리 변경
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  onClick={() => {
                                    if (window.confirm("이 금융상품을 삭제할까요?")) {
                                      setFinancialProducts((items) => items.filter((item) => item.id !== product.id));
                                      void persist(() => deleteFinancialProduct(product.id), "금융상품을 삭제하지 못했어요.");
                                      showToast("금융상품을 삭제했어요.");
                                    }
                                  }}
                                >
                                  삭제
                                </button>
                              </div>
                            </article>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {showCash && (
            <section className="panel cash-analysis-panel" id="cashAnalysis">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">현금 모으기 분석</h2>
                  <p className="panel-subtitle">
                    {viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월 수입과 지출을 바탕으로 분석해요
                  </p>
                </div>
              </div>
              <div className="cash-analysis-grid">
                <div>
                  <div className="cash-metrics">
                    <div className="cash-metric">
                      <span>월 수입</span>
                      <strong>{money(income)}</strong>
                      <small>등록된 전체 수입</small>
                    </div>
                    <div className="cash-metric">
                      <span>월 지출</span>
                      <strong>{money(expense)}</strong>
                      <small>{income > 0 ? `수입 대비 ${expenseRatio.toFixed(1)}%` : expense > 0 ? "수입이 없어 비율 산정 불가" : "수입 대비 0%"}</small>
                    </div>
                    <div className={`cash-metric ${surplus < 0 ? "warning" : "highlight"}`}>
                      <span>남길 수 있는 현금</span>
                      <strong>{money(surplus)}</strong>
                      <small>{surplus < 0 ? `지출이 ${money(Math.abs(surplus))} 더 많아요` : surplus > 0 ? "이번 달 확보 가능한 잉여 현금" : "수입과 지출이 같아요"}</small>
                    </div>
                    <div className="cash-metric">
                      <span>현재 저축 가능률</span>
                      <strong>{savingsRate.toFixed(1)}%</strong>
                      <small>잉여 현금 ÷ 수입</small>
                    </div>
                  </div>
                  <div className="flow-analysis">
                    <div className="flow-row">
                      <span>전체 지출</span>
                      <div className="flow-track">
                        <div className="flow-fill" style={{ width: flowWidth(expense) }} />
                      </div>
                      <strong>{money(expense)}</strong>
                    </div>
                    <div className="flow-row">
                      <span>고정지출</span>
                      <div className="flow-track">
                        <div className="flow-fill fixed" style={{ width: flowWidth(fixed) }} />
                      </div>
                      <strong>{money(fixed)}</strong>
                    </div>
                    <div className="flow-row">
                      <span>변동지출</span>
                      <div className="flow-track">
                        <div className="flow-fill variable" style={{ width: flowWidth(cashVariable) }} />
                      </div>
                      <strong>{money(cashVariable)}</strong>
                    </div>
                  </div>
                  <p className="analysis-note">
                    이 분석은 선택한 한 달의 입력 내역을 기준으로 한 단순 추정입니다. 실제 저축 계획은 비정기 지출과 생활 예비비를 함께 고려하세요.
                  </p>
                </div>
                <div>
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title">추천 현금 확보 플랜</h3>
                      <p className="panel-subtitle">
                        {monthlyCashGoal > 0
                          ? `현재 잉여 현금 ${money(positiveSurplus)}과 변동비 10% 절감액 ${money(variableCut)}을 합치면 월 ${money(monthlyCashGoal)} 확보 가능`
                          : "계산 근거와 실행 방법을 확인하고 한 단계씩 적용해보세요"}
                      </p>
                    </div>
                  </div>
                  <div className="cash-plan">
                    {cashPlans.map((plan, index) => (
                      <article className="cash-plan-item" key={`${plan.title}-${index}`}>
                        <span className="plan-number">{index + 1}</span>
                        <div className="cash-plan-copy">
                          <strong>{plan.title}</strong>
                          <div className="plan-details">
                            <div className="plan-detail">
                              <b>계산 근거</b>
                              <span>{plan.reason}</span>
                            </div>
                            <div className="plan-detail">
                              <b>실행 방법</b>
                              <span>{plan.action}</span>
                            </div>
                            <div className="plan-detail">
                              <b>기대 효과</b>
                              <span>{plan.effect}</span>
                            </div>
                          </div>
                        </div>
                        <div className="cash-plan-amount">{plan.amount}</div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {showData && (
            <section className="panel data-panel" aria-labelledby="dataManagementTitle">
              <div className="data-panel-copy">
                <h2 id="dataManagementTitle">데이터 관리</h2>
                <p>저장된 가계부와 금융상품 데이터를 모두 지우고 처음부터 시작할 수 있어요.</p>
              </div>
              <button
                type="button"
                className="danger-btn"
                onClick={() => {
                  setResetConfirmText("");
                  setResetOpen(true);
                }}
              >
                모든 데이터 초기화
              </button>
            </section>
          )}
        </main>
      </div>

      <nav className="mobile-bar" aria-label="모바일 메뉴">
        {navItems.map((item) => (
          <Link
            key={item.page}
            href={pageInfo[item.page].href}
            className={initialPage === item.page ? "active" : ""}
            aria-current={initialPage === item.page ? "page" : undefined}
          >
            {item.icon}
            <br />
            {item.mobileLabel}
          </Link>
        ))}
      </nav>

      {editingRecord && (
        <div className="modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditingRecord(null)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="recordEditTitle">
            <form className="modal" onSubmit={saveEditedRecord}>
              <div className="modal-head">
                <div>
                  <h2 id="recordEditTitle">내역 수정</h2>
                  <p className="panel-subtitle">등록한 수입·지출 내용을 수정해요.</p>
                </div>
                <button type="button" className="close-btn" onClick={() => setEditingRecord(null)} aria-label="닫기">×</button>
              </div>

              <div className="type-tabs" role="tablist" aria-label="내역 유형">
                <button
                  type="button"
                  className={editingRecord.type === "expense" && editingRecord.costType === "fixed" ? "active" : ""}
                  onClick={() =>
                    setEditingRecord({
                      ...editingRecord,
                      type: "expense",
                      costType: "fixed",
                      category: categories.expense.includes(editingRecord.category as (typeof categories.expense)[number])
                        ? editingRecord.category
                        : categories.expense[0],
                      paymentMethod: editingRecord.paymentMethod || "cash",
                      owner: "",
                      repeatStart: editingRecord.repeatStart || editingRecord.date.slice(0, 7),
                      repeatEnd: editingRecord.repeatEnd || editingRecord.date.slice(0, 7),
                    })
                  }
                >
                  고정지출
                </button>
                <button
                  type="button"
                  className={editingRecord.type === "expense" && editingRecord.costType !== "fixed" ? "active" : ""}
                  onClick={() =>
                    setEditingRecord({
                      ...editingRecord,
                      type: "expense",
                      costType: "variable",
                      category: categories.expense.includes(editingRecord.category as (typeof categories.expense)[number])
                        ? editingRecord.category
                        : categories.expense[0],
                      paymentMethod: editingRecord.paymentMethod || "cash",
                      repeatStart: "",
                      repeatEnd: "",
                      repeatForever: false,
                      owner: "",
                    })
                  }
                >
                  변동지출
                </button>
                <button
                  type="button"
                  className={editingRecord.type === "income" ? "active" : ""}
                  onClick={() =>
                    setEditingRecord({
                      ...editingRecord,
                      type: "income",
                      costType: "",
                      paymentMethod: "",
                      category: categories.income.includes(editingRecord.category as (typeof categories.income)[number])
                        ? editingRecord.category
                        : categories.income[0],
                      repeatStart: "",
                      repeatEnd: "",
                      repeatForever: false,
                      owner: editingRecord.owner || "me",
                    })
                  }
                >
                  수입
                </button>
              </div>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor="editRecordDate">날짜</label>
                  <input
                    id="editRecordDate"
                    type="date"
                    value={editingRecord.date}
                    onChange={(event) => setEditingRecord({ ...editingRecord, date: event.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="editRecordAmount">금액</label>
                  <input
                    id="editRecordAmount"
                    type="number"
                    min="1"
                    step="1"
                    value={editingRecord.amount}
                    onChange={(event) => setEditingRecord({ ...editingRecord, amount: event.target.value })}
                    required
                  />
                </div>
                <div className="field full">
                  <label htmlFor="editRecordTitle">내용</label>
                  <input
                    id="editRecordTitle"
                    type="text"
                    lang="ko"
                    maxLength={40}
                    value={editingRecord.title}
                    onChange={(event) => setEditingRecord({ ...editingRecord, title: event.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="editRecordCategory">분류</label>
                  <select
                    id="editRecordCategory"
                    value={editingRecord.category}
                    onChange={(event) => setEditingRecord({ ...editingRecord, category: event.target.value })}
                    required
                  >
                    {(editingRecord.type === "income" ? categories.income : categories.expense).map((category) => (
                      <option value={category} key={category}>{category}</option>
                    ))}
                  </select>
                </div>

                {editingRecord.type === "expense" && editingRecord.category === "식비" && (
                  <div className="field">
                    <label htmlFor="editRecordSubcategory">식비 상세</label>
                    <select
                      id="editRecordSubcategory"
                      value={editingRecord.subcategory}
                      onChange={(event) => setEditingRecord({ ...editingRecord, subcategory: event.target.value })}
                    >
                      <option value="외식비">외식 비용</option>
                      <option value="재료구매비">재료 구매 비용</option>
                    </select>
                  </div>
                )}

                {editingRecord.type === "expense" && (
                  <div className="field">
                    <label htmlFor="editPaymentMethod">결제 수단</label>
                    <select
                      id="editPaymentMethod"
                      value={editingRecord.paymentMethod || "cash"}
                      onChange={(event) => setEditingRecord({ ...editingRecord, paymentMethod: event.target.value as PaymentMethod })}
                    >
                      {editingRecord.paymentMethod === "creditCard" && (
                        <option value="creditCard">신용카드(기존)</option>
                      )}
                      {paymentMethodOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {editingRecord.type === "income" && (
                  <div className="field">
                    <label htmlFor="editIncomeOwner">수입 주체</label>
                    <select
                      id="editIncomeOwner"
                      value={editingRecord.owner || "me"}
                      onChange={(event) => setEditingRecord({ ...editingRecord, owner: event.target.value as IncomeOwner })}
                    >
                      <option value="me">나</option>
                      <option value="spouse">배우자</option>
                      <option value="company">회사</option>
                      <option value="other">기타</option>
                    </select>
                  </div>
                )}

                {editingRecord.type === "expense" && editingRecord.costType === "fixed" && (
                  <div className="repeat-fields">
                    <div className="field">
                      <label htmlFor="editRepeatStart">반복 시작 월</label>
                      <input
                        id="editRepeatStart"
                        type="month"
                        value={editingRecord.repeatStart}
                        onChange={(event) =>
                          setEditingRecord({
                            ...editingRecord,
                            repeatStart: event.target.value,
                            repeatEnd:
                              editingRecord.repeatEnd && editingRecord.repeatEnd < event.target.value
                                ? event.target.value
                                : editingRecord.repeatEnd,
                          })
                        }
                        required
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="editRepeatEnd">반복 종료 월</label>
                      <input
                        id="editRepeatEnd"
                        type="month"
                        min={editingRecord.repeatStart}
                        value={editingRecord.repeatEnd}
                        disabled={editingRecord.repeatForever}
                        required={!editingRecord.repeatForever}
                        onChange={(event) => setEditingRecord({ ...editingRecord, repeatEnd: event.target.value })}
                      />
                    </div>
                    <label className="repeat-forever">
                      <input
                        type="checkbox"
                        checked={editingRecord.repeatForever}
                        onChange={(event) => setEditingRecord({ ...editingRecord, repeatForever: event.target.checked })}
                      />
                      종료 월 없이 계속 반복
                    </label>
                    <p>수정 내용은 이 반복 항목 전체에 적용됩니다.</p>
                  </div>
                )}

                {["출장비 지출", "회사 출장비 지급"].includes(editingRecord.category) && (
                  <div className="form-note">
                    출장 지출과 회사 지급액은 출장비 정산 영역에서 자동으로 비교됩니다.
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={() => setEditingRecord(null)}>취소</button>
                <button type="submit" className="primary-btn">수정 내용 저장</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {rateProductId && (() => {
        const product = financialProducts.find((item) => item.id === rateProductId);
        if (!product) return null;
        const startDate = product.startDate || formatLocalDate(new Date(product.createdAt));
        const maturityDate = addMonthsToDate(startDate, product.months);
        const history = [...(product.rateChanges || [])].sort((a, b) => a.date.localeCompare(b.date));
        return (
          <div className="modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setRateProductId("")}>
            <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="rateDialogTitle">
              <form className="modal" onSubmit={saveRateChange}>
                <div className="modal-head">
                  <div>
                    <h2 id="rateDialogTitle">금리 변경 이력</h2>
                    <p className="panel-subtitle">{product.bankName} · {product.productName} (최초 연 {product.rate}%)</p>
                  </div>
                  <button type="button" className="close-btn" onClick={() => setRateProductId("")} aria-label="닫기">×</button>
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="rateChangeDate">금리 변동일</label>
                    <input
                      id="rateChangeDate"
                      type="date"
                      min={addDaysToDate(startDate, 1)}
                      max={addDaysToDate(maturityDate, -1)}
                      value={rateDate}
                      onChange={(event) => setRateDate(event.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="changedRate">변경된 연 금리</label>
                    <input
                      id="changedRate"
                      type="number"
                      min="0"
                      max="30"
                      step="0.01"
                      placeholder="4.10"
                      value={changedRate}
                      onChange={(event) => setChangedRate(event.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="rate-history">
                  {history.length ? (
                    <>
                      <strong>등록된 변경 이력</strong>
                      {history.map((change) => (
                        <div className="rate-history-row" key={change.date}>
                          <span>{change.date}</span>
                          <strong>연 {change.rate}%</strong>
                          <button type="button" className="icon-btn" onClick={() => removeRateChange(change.date)}>삭제</button>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="panel-subtitle">아직 등록된 금리 변경이 없습니다.</p>
                  )}
                </div>
                <div className="modal-actions">
                  <button type="button" className="secondary-btn" onClick={() => setRateProductId("")}>닫기</button>
                  <button type="submit" className="primary-btn">변경 금리 적용</button>
                </div>
              </form>
            </section>
          </div>
        );
      })()}

      {repaymentLoanId && (() => {
        const loan = loans.find((item) => item.id === repaymentLoanId);
        if (!loan) return null;
        const balanceInfo = loanBalance(loan);
        const history = [...(loan.payments || [])].sort((a, b) => b.date.localeCompare(a.date));
        return (
          <div className="modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setRepaymentLoanId("")}>
            <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="repaymentTitle">
              <form className="modal" onSubmit={saveRepayment}>
                <div className="modal-head">
                  <div>
                    <h2 id="repaymentTitle">대출 상환 기록</h2>
                    <p className="panel-subtitle">{loan.bank} · {loan.name} · 남은 원금 {money(balanceInfo.remaining)}</p>
                  </div>
                  <button type="button" className="close-btn" onClick={() => setRepaymentLoanId("")} aria-label="닫기">×</button>
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="repaymentDate">상환일</label>
                    <input id="repaymentDate" type="date" value={repaymentDate} onChange={(event) => setRepaymentDate(event.target.value)} required />
                  </div>
                  <div className="field">
                    <label htmlFor="repaidPrincipal">상환 원금</label>
                    <input
                      id="repaidPrincipal"
                      type="number"
                      min="0"
                      max={balanceInfo.remaining}
                      step="1"
                      placeholder="0"
                      value={repaidPrincipal}
                      onChange={(event) => setRepaidPrincipal(event.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="repaidInterest">납부 이자</label>
                    <input
                      id="repaidInterest"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={repaidInterest}
                      onChange={(event) => setRepaidInterest(event.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="repayment-history">
                  {history.length ? (
                    <>
                      <strong>상환 내역</strong>
                      {history.map((payment) => (
                        <div className="repayment-row" key={payment.id}>
                          <span>{payment.date} · 원금 {money(payment.principal)} · 이자 {money(payment.interest)}</span>
                          <strong>{money(payment.principal + payment.interest)}</strong>
                          <button type="button" className="icon-btn" onClick={() => deleteRepayment(payment.id)}>삭제</button>
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="panel-subtitle">아직 등록된 상환 내역이 없습니다.</p>
                  )}
                </div>
                <div className="modal-actions">
                  <button type="button" className="secondary-btn" onClick={() => setRepaymentLoanId("")}>닫기</button>
                  <button type="submit" className="primary-btn">상환 기록 추가</button>
                </div>
              </form>
            </section>
          </div>
        );
      })()}

      {resetOpen && (
        <div className="modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setResetOpen(false)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="resetTitle">
            <form className="modal" onSubmit={resetAllData}>
              <div className="modal-head">
                <div>
                  <h2 id="resetTitle">모든 데이터 초기화</h2>
                  <p className="panel-subtitle">삭제한 데이터는 복구할 수 없습니다.</p>
                </div>
                <button type="button" className="close-btn" onClick={() => setResetOpen(false)} aria-label="닫기">×</button>
              </div>
              <div className="reset-warning">
                수입·지출 내역, 반복 항목, 대출과 상환 기록, 적금·예금 상품과 금리 변경 이력이 모두 삭제됩니다. 사이트의 화면과 기능은 그대로 유지됩니다.
              </div>
              <div className="field">
                <label htmlFor="resetConfirmText">계속하려면 ‘초기화’를 입력하세요</label>
                <input
                  id="resetConfirmText"
                  type="text"
                  lang="ko"
                  autoComplete="off"
                  placeholder="초기화"
                  value={resetConfirmText}
                  onChange={(event) => setResetConfirmText(event.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-btn" onClick={() => setResetOpen(false)}>취소</button>
                <button type="submit" className="danger-btn" disabled={resetConfirmText.trim() !== "초기화"}>모두 삭제하기</button>
              </div>
            </form>
          </section>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </>
  );
}
