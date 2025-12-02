export enum ValidationReasonType {
  BALANCE_MISMATCH = 'BALANCE_MISMATCH',
  DUPLICATE_SUSPECTED = 'DUPLICATE_SUSPECTED',
  MISSING_MOVEMENTS = 'MISSING_MOVEMENTS',
}

interface BaseValidationReason {
  type: ValidationReasonType;
  message: string;
}

export interface BalanceMismatchReason extends BaseValidationReason {
  type: ValidationReasonType.BALANCE_MISMATCH;
  checkpointDate: string;
  expectedBalance: number;
  calculatedBalance: number;
  difference: number;
}

export interface DuplicateSuspectedReason extends BaseValidationReason {
  type: ValidationReasonType.DUPLICATE_SUSPECTED;
  checkpointDate: string;
  movements: Array<{
    id: number;
    date: string;
    label: string;
    amount: number;
  }>;
}

export interface MissingMovementsReason extends BaseValidationReason {
  type: ValidationReasonType.MISSING_MOVEMENTS;
  checkpointDate: string;
  missingAmount: number;
  periodStart: string;
  periodEnd: string;
}

export type ValidationReason =
  | BalanceMismatchReason
  | DuplicateSuspectedReason
  | MissingMovementsReason;
