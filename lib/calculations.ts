import type {
  FinancialProduct,
  InterestType,
  Loan,
  LoanCalculation,
  MaturityResult,
  ProductType,
  RateChange,
  RepaymentMethod,
} from "@/lib/types";

export const money = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
export const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addMonthsToDate(value: string, months: number) {
  const source = parseLocalDate(value);
  const target = new Date(source.getFullYear(), source.getMonth() + months, 1);
  target.setDate(
    Math.min(
      source.getDate(),
      new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate(),
    ),
  );
  return formatLocalDate(target);
}

export function daysBetween(start: string, end: string) {
  return Math.max(0, Math.round((parseLocalDate(end).getTime() - parseLocalDate(start).getTime()) / 86400000));
}

export function addDaysToDate(value: string, days: number) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

export function growthFactorBetween(
  contributionDate: string,
  endDate: string,
  baseRate: number,
  interestType: InterestType,
  startDate: string,
  rateChanges: RateChange[] = [],
) {
  if (contributionDate >= endDate) return 1;
  const timeline = [
    { date: startDate, rate: baseRate },
    ...rateChanges
      .filter((change) => change.date > startDate && change.date < endDate)
      .sort((a, b) => a.date.localeCompare(b.date)),
  ];
  const boundaries = [
    contributionDate,
    ...timeline.map((item) => item.date).filter((date) => date > contributionDate),
    endDate,
  ]
    .filter((date, index, array) => array.indexOf(date) === index)
    .sort();

  let growth = 1;
  let simpleYield = 0;
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const segmentStart = boundaries[i];
    const segmentEnd = boundaries[i + 1];
    const activeRate = [...timeline].reverse().find((item) => item.date <= segmentStart)?.rate ?? baseRate;
    const days = daysBetween(segmentStart, segmentEnd);
    if (interestType === "compound") growth *= Math.pow(1 + activeRate / 1200, days / (365 / 12));
    else if (interestType === "annualCompound") growth *= Math.pow(1 + activeRate / 100, days / 365);
    else simpleYield += (activeRate / 100) * (days / 365);
  }
  return interestType === "simple" ? 1 + simpleYield : growth;
}

export function calculateMaturity(
  type: ProductType,
  amount: number,
  months: number,
  rate: number,
  interestType: InterestType = "simple",
  startDate = "",
  rateChanges: RateChange[] = [],
): MaturityResult {
  const principal = type === "installment" ? amount * months : amount;
  if (startDate) {
    const maturityDate = addMonthsToDate(startDate, months);
    let grossMaturity = 0;
    if (type === "installment") {
      for (let payment = 0; payment < months; payment += 1) {
        grossMaturity +=
          amount *
          growthFactorBetween(
            addMonthsToDate(startDate, payment),
            maturityDate,
            rate,
            interestType,
            startDate,
            rateChanges,
          );
      }
    } else {
      grossMaturity = amount * growthFactorBetween(startDate, maturityDate, rate, interestType, startDate, rateChanges);
    }
    const grossInterest = grossMaturity - principal;
    const tax = grossInterest * 0.154;
    return { principal, grossInterest, tax, maturity: principal + grossInterest - tax, maturityDate };
  }

  const monthlyRate = rate / 100 / 12;
  const annualRate = rate / 100;
  let grossInterest = 0;
  if (interestType === "compound") {
    if (type === "installment") {
      let grossMaturity = 0;
      for (let remaining = 1; remaining <= months; remaining += 1) {
        grossMaturity += amount * Math.pow(1 + monthlyRate, remaining);
      }
      grossInterest = grossMaturity - principal;
    } else {
      grossInterest = amount * Math.pow(1 + monthlyRate, months) - amount;
    }
  } else if (interestType === "annualCompound") {
    const annualFactor = (remainingMonths: number) => {
      const fullYears = Math.floor(remainingMonths / 12);
      const extraMonths = remainingMonths % 12;
      return Math.pow(1 + annualRate, fullYears) * (1 + annualRate * extraMonths / 12);
    };
    if (type === "installment") {
      let grossMaturity = 0;
      for (let remaining = 1; remaining <= months; remaining += 1) {
        grossMaturity += amount * annualFactor(remaining);
      }
      grossInterest = grossMaturity - principal;
    } else {
      grossInterest = amount * annualFactor(months) - amount;
    }
  } else {
    grossInterest =
      type === "installment"
        ? amount * monthlyRate * ((months * (months + 1)) / 2)
        : amount * (rate / 100) * (months / 12);
  }
  const tax = grossInterest * 0.154;
  return { principal, grossInterest, tax, maturity: principal + grossInterest - tax, maturityDate: "" };
}

export function calculateInstallmentProgress(product: FinancialProduct, startDate: string) {
  const today = formatLocalDate(new Date());
  const maturityDate = addMonthsToDate(startDate, product.months);
  if (today < startDate) return { principal: 0, grossInterest: 0, paymentCount: 0, asOfDate: today };
  const asOfDate = today > maturityDate ? maturityDate : today;
  const interestType = product.interestType || "simple";
  let paymentCount = 0;
  let currentGrossValue = 0;
  for (let payment = 0; payment < product.months; payment += 1) {
    const paymentDate = addMonthsToDate(startDate, payment);
    if (paymentDate > asOfDate) break;
    paymentCount += 1;
    currentGrossValue +=
      product.amount *
      growthFactorBetween(paymentDate, asOfDate, product.rate, interestType, startDate, product.rateChanges || []);
  }
  const principal = product.amount * paymentCount;
  return { principal, grossInterest: currentGrossValue - principal, paymentCount, asOfDate };
}

export function interestTypeName(interestType: InterestType) {
  if (interestType === "compound") return "월복리";
  if (interestType === "annualCompound") return "연복리";
  return "단리";
}

export function calculateLoan(
  amount: number,
  annualRate: number,
  months: number,
  method: RepaymentMethod,
): LoanCalculation {
  const monthlyRate = annualRate / 100 / 12;
  if (!amount || !months) return { monthlyPayment: 0, totalInterest: 0, note: "금리와 기간에 따른 단순 예상치입니다." };
  if (method === "equalPrincipal") {
    const principalPayment = amount / months;
    const firstPayment = principalPayment + amount * monthlyRate;
    const totalInterest = (amount * monthlyRate * (months + 1)) / 2;
    return { monthlyPayment: firstPayment, totalInterest, note: "첫 달 예상액이며 이후 원금 잔액 감소에 따라 매월 줄어듭니다." };
  }
  if (method === "bullet") {
    return {
      monthlyPayment: amount * monthlyRate,
      totalInterest: amount * monthlyRate * months,
      note: `매월 이자 예상액이며 만기에 원금 ${money(amount)}을 함께 상환합니다.`,
    };
  }
  const monthlyPayment =
    monthlyRate === 0
      ? amount / months
      : (amount * monthlyRate * Math.pow(1 + monthlyRate, months)) /
        (Math.pow(1 + monthlyRate, months) - 1);
  return { monthlyPayment, totalInterest: monthlyPayment * months - amount, note: "매월 같은 금액을 상환하는 원리금균등 기준입니다." };
}

export function repaymentMethodName(method: RepaymentMethod) {
  return method === "equalPrincipal" ? "원금균등" : method === "bullet" ? "만기일시상환" : "원리금균등";
}

export function loanBalance(loan: Loan) {
  const repaid = (loan.payments || []).reduce((sum, payment) => sum + payment.principal, 0);
  return { repaid, remaining: Math.max(0, loan.amount - repaid) };
}
