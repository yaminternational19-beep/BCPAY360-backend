export function calculateSalary({
  baseSalary,
  incentive = 0,
  bonus = 0,
  tax = 0,
  otherDeductions = 0,
  pfApplicable = 0
}) {
  if (!baseSalary || baseSalary <= 0) {
    throw new Error("Invalid baseSalary");
  }

  const earnedBasic = Number(baseSalary);

  // PF calculated on basic salary, capped at 15,000
  const pfWage = Math.min(earnedBasic, 15000);
  const pfAmount = pfApplicable ? pfWage * 0.12 : 0;

  const grossSalary =
    earnedBasic +
    incentive +
    bonus;

  const netSalary =
    grossSalary -
    tax -
    otherDeductions -
    pfAmount;

  return {
    earnedBasic: round(earnedBasic),
    incentive: round(incentive),
    bonus: round(bonus),
    tax: round(tax),
    otherDeductions: round(otherDeductions),
    pfApplicable,
    pfAmount: round(pfAmount),
    grossSalary: round(grossSalary),
    netSalary: round(netSalary)
  };
}

function round(n) {
  return Number(Number(n || 0).toFixed(2));
}
