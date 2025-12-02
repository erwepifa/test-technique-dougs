import { Injectable } from '@nestjs/common';
import { MovementDto, BalanceDto } from './dto';
import {
  ValidationResult,
  ValidationReason,
  ValidationReasonType,
  BalanceMismatchReason,
  DuplicateSuspectedReason,
  MissingMovementsReason,
} from './interfaces';

@Injectable()
export class MovementsService {
  validateMovements(
    movements: MovementDto[],
    balances: BalanceDto[],
  ): ValidationResult {
    const reasons: ValidationReason[] = [];

    const sortedBalances = this.sortBalancesByDate(balances);
    const sortedMovements = this.sortMovementsByDate(movements);

    for (let i = 0; i < sortedBalances.length; i++) {
      const currentCheckpoint = sortedBalances[i];
      const previousCheckpoint = sortedBalances[i - 1];

      const periodStart = previousCheckpoint?.date ?? null;
      const periodEnd = currentCheckpoint.date;

      const periodMovements = this.getMovementsInPeriod(
        sortedMovements,
        periodStart,
        periodEnd,
      );

      const previousBalance = previousCheckpoint?.balance ?? 0;
      const movementsSum = this.calculateMovementsSum(periodMovements);
      const calculatedBalance = this.roundToTwoDecimals(
        previousBalance + movementsSum,
      );

      const expectedBalance = currentCheckpoint.balance;

      if (!this.areBalancesEqual(calculatedBalance, expectedBalance)) {
        const difference = this.roundToTwoDecimals(
          calculatedBalance - expectedBalance,
        );

        reasons.push(
          this.createBalanceMismatchReason(
            periodEnd,
            expectedBalance,
            calculatedBalance,
            difference,
          ),
        );

        const analysisReasons = this.analyzeMismatch(
          periodMovements,
          difference,
          periodStart,
          periodEnd,
        );
        reasons.push(...analysisReasons);
      }
    }

    return {
      isValid: reasons.length === 0,
      reasons,
    };
  }

  private sortBalancesByDate(balances: BalanceDto[]): BalanceDto[] {
    return [...balances].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }

  private sortMovementsByDate(movements: MovementDto[]): MovementDto[] {
    return [...movements].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }

  private getMovementsInPeriod(
    movements: MovementDto[],
    periodStart: string | null,
    periodEnd: string,
  ): MovementDto[] {
    return movements.filter((movement) => {
      const movementDate = new Date(movement.date).getTime();
      const endDate = new Date(periodEnd).getTime();

      if (periodStart === null) {
        return movementDate <= endDate;
      }

      const startDate = new Date(periodStart).getTime();
      return movementDate > startDate && movementDate <= endDate;
    });
  }

  private calculateMovementsSum(movements: MovementDto[]): number {
    return movements.reduce((sum, movement) => sum + movement.amount, 0);
  }

  private roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private areBalancesEqual(balance1: number, balance2: number): boolean {
    return Math.abs(balance1 - balance2) < 0.001;
  }

  private createBalanceMismatchReason(
    checkpointDate: string,
    expectedBalance: number,
    calculatedBalance: number,
    difference: number,
  ): BalanceMismatchReason {
    return {
      type: ValidationReasonType.BALANCE_MISMATCH,
      message: `Écart de solde détecté au ${this.formatDate(checkpointDate)} : attendu ${expectedBalance}€, calculé ${calculatedBalance}€ (différence: ${difference > 0 ? '+' : ''}${difference}€)`,
      checkpointDate,
      expectedBalance,
      calculatedBalance,
      difference,
    };
  }

  private analyzeMismatch(
    periodMovements: MovementDto[],
    difference: number,
    periodStart: string | null,
    periodEnd: string,
  ): ValidationReason[] {
    const reasons: ValidationReason[] = [];

    if (difference > 0) {
      const duplicates = this.findPotentialDuplicates(
        periodMovements,
        difference,
      );
      if (duplicates.length > 0) {
        reasons.push(
          this.createDuplicateSuspectedReason(periodEnd, duplicates),
        );
      }
    }

    if (difference < 0) {
      reasons.push(
        this.createMissingMovementsReason(
          periodEnd,
          Math.abs(difference),
          periodStart,
        ),
      );
    }

    return reasons;
  }

  private findPotentialDuplicates(
    movements: MovementDto[],
    targetDifference: number,
  ): MovementDto[] {
    const potentialDuplicates: MovementDto[] = [];

    const movementsByAmount = new Map<number, MovementDto[]>();

    for (const movement of movements) {
      const amount = movement.amount;
      const existing = movementsByAmount.get(amount) ?? [];
      existing.push(movement);
      movementsByAmount.set(amount, existing);
    }

    for (const [amount, group] of movementsByAmount) {
      if (group.length > 1 && amount > 0) {
        if (this.areBalancesEqual(amount, targetDifference)) {
          potentialDuplicates.push(...group);
        } else if (group.length >= 2) {
          const wouldMatchDifference = group.some((_, index) => {
            const duplicateSum = amount * (group.length - index - 1);
            return this.areBalancesEqual(duplicateSum, targetDifference);
          });

          if (wouldMatchDifference) {
            potentialDuplicates.push(...group);
          }
        }
      }
    }

    const similarLabelDuplicates = this.findSimilarLabelDuplicates(movements);
    for (const duplicate of similarLabelDuplicates) {
      if (!potentialDuplicates.find((d) => d.id === duplicate.id)) {
        potentialDuplicates.push(duplicate);
      }
    }

    return potentialDuplicates;
  }

  private findSimilarLabelDuplicates(movements: MovementDto[]): MovementDto[] {
    const duplicates: MovementDto[] = [];

    for (let i = 0; i < movements.length; i++) {
      for (let j = i + 1; j < movements.length; j++) {
        const m1 = movements[i];
        const m2 = movements[j];

        if (
          m1.amount === m2.amount &&
          this.areLabelsSimilar(m1.label, m2.label)
        ) {
          const dateDiff = Math.abs(
            new Date(m1.date).getTime() - new Date(m2.date).getTime(),
          );
          const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

          if (dateDiff <= sevenDaysInMs) {
            if (!duplicates.find((d) => d.id === m1.id)) {
              duplicates.push(m1);
            }
            if (!duplicates.find((d) => d.id === m2.id)) {
              duplicates.push(m2);
            }
          }
        }
      }
    }

    return duplicates;
  }

  private areLabelsSimilar(label1: string, label2: string): boolean {
    const normalize = (str: string) =>
      str.toLowerCase().trim().replace(/\s+/g, ' ');
    return normalize(label1) === normalize(label2);
  }

  private createDuplicateSuspectedReason(
    checkpointDate: string,
    movements: MovementDto[],
  ): DuplicateSuspectedReason {
    return {
      type: ValidationReasonType.DUPLICATE_SUSPECTED,
      message: `${movements.length} mouvement(s) potentiellement en double détecté(s) sur la période se terminant le ${this.formatDate(checkpointDate)}`,
      checkpointDate,
      movements: movements.map((m) => ({
        id: m.id,
        date: m.date,
        label: m.label,
        amount: m.amount,
      })),
    };
  }

  private createMissingMovementsReason(
    checkpointDate: string,
    missingAmount: number,
    periodStart: string | null,
  ): MissingMovementsReason {
    const startDisplay = periodStart
      ? this.formatDate(periodStart)
      : 'le début';

    return {
      type: ValidationReasonType.MISSING_MOVEMENTS,
      message: `Il manque ${missingAmount}€ de mouvements entre ${startDisplay} et le ${this.formatDate(checkpointDate)}`,
      checkpointDate,
      missingAmount,
      periodStart: periodStart ?? 'N/A',
      periodEnd: checkpointDate,
    };
  }

  private formatDate(isoDate: string): string {
    return new Date(isoDate).toLocaleDateString('fr-FR');
  }
}
