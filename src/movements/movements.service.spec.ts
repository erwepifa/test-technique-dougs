import { Test, TestingModule } from '@nestjs/testing';
import { MovementsService } from './movements.service';
import {
  ValidationReasonType,
  BalanceMismatchReason,
  MissingMovementsReason,
  DuplicateSuspectedReason,
} from './interfaces';
import { MovementDto } from './dto';

describe('MovementsService', () => {
  let service: MovementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MovementsService],
    }).compile();

    service = module.get<MovementsService>(MovementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateMovements', () => {
    describe('Cas valides', () => {
      it('devrait valider des mouvements correspondant au solde', () => {
        const movements = [
          { id: 1, date: '2024-01-15', label: 'Virement entrant', amount: 100 },
          { id: 2, date: '2024-01-20', label: 'Achat CB', amount: -30 },
        ];
        const balances = [{ date: '2024-01-31', balance: 70 }];

        const result = service.validateMovements(movements, balances);

        expect(result.isValid).toBe(true);
        expect(result.reasons).toHaveLength(0);
      });

      it('devrait valider avec plusieurs points de contrôle', () => {
        const movements = [
          { id: 1, date: '2024-01-10', label: 'Dépôt initial', amount: 1000 },
          { id: 2, date: '2024-01-20', label: 'Salaire', amount: 2500 },
          { id: 3, date: '2024-02-05', label: 'Loyer', amount: -800 },
          { id: 4, date: '2024-02-15', label: 'Courses', amount: -150 },
        ];
        const balances = [
          { date: '2024-01-31', balance: 3500 },
          { date: '2024-02-28', balance: 2550 },
        ];

        const result = service.validateMovements(movements, balances);

        expect(result.isValid).toBe(true);
        expect(result.reasons).toHaveLength(0);
      });

      it('devrait valider une liste vide de mouvements avec solde zéro', () => {
        const movements: MovementDto[] = [];
        const balances = [{ date: '2024-01-31', balance: 0 }];

        const result = service.validateMovements(movements, balances);

        expect(result.isValid).toBe(true);
      });

      it('devrait gérer les montants décimaux correctement', () => {
        const movements = [
          { id: 1, date: '2024-01-15', label: 'Paiement', amount: 10.99 },
          { id: 2, date: '2024-01-16', label: 'Remise', amount: -0.99 },
        ];
        const balances = [{ date: '2024-01-31', balance: 10.0 }];

        const result = service.validateMovements(movements, balances);

        expect(result.isValid).toBe(true);
      });
    });

    describe('Détection des écarts de solde', () => {
      it('devrait détecter un écart positif (trop de mouvements)', () => {
        const movements = [
          { id: 1, date: '2024-01-15', label: 'Virement', amount: 100 },
          { id: 2, date: '2024-01-16', label: 'Virement', amount: 100 }, // Doublon ?
        ];
        const balances = [{ date: '2024-01-31', balance: 100 }];

        const result = service.validateMovements(movements, balances);

        expect(result.isValid).toBe(false);
        expect(result.reasons.length).toBeGreaterThan(0);

        const balanceMismatch = result.reasons.find(
          (r): r is BalanceMismatchReason =>
            r.type === ValidationReasonType.BALANCE_MISMATCH,
        );
        expect(balanceMismatch).toBeDefined();
        expect(balanceMismatch?.difference).toBe(100);
      });

      it('devrait détecter un écart négatif (mouvements manquants)', () => {
        const movements = [
          { id: 1, date: '2024-01-15', label: 'Dépôt', amount: 100 },
        ];
        const balances = [{ date: '2024-01-31', balance: 250 }];

        const result = service.validateMovements(movements, balances);

        expect(result.isValid).toBe(false);

        const missingReason = result.reasons.find(
          (r): r is MissingMovementsReason =>
            r.type === ValidationReasonType.MISSING_MOVEMENTS,
        );
        expect(missingReason).toBeDefined();
        expect(missingReason?.missingAmount).toBe(150);
      });
    });

    describe('Détection des doublons', () => {
      it("devrait suggérer des doublons quand deux mouvements identiques correspondent à l'écart", () => {
        const movements = [
          { id: 1, date: '2024-01-15', label: 'Virement client', amount: 500 },
          { id: 2, date: '2024-01-15', label: 'Virement client', amount: 500 },
        ];
        const balances = [{ date: '2024-01-31', balance: 500 }];

        const result = service.validateMovements(movements, balances);

        expect(result.isValid).toBe(false);

        const duplicateReason = result.reasons.find(
          (r): r is DuplicateSuspectedReason =>
            r.type === ValidationReasonType.DUPLICATE_SUSPECTED,
        );
        expect(duplicateReason).toBeDefined();
        expect(duplicateReason?.movements).toHaveLength(2);
      });

      it('devrait détecter des doublons avec des dates proches', () => {
        const movements = [
          {
            id: 1,
            date: '2024-01-15',
            label: 'Paiement fournisseur',
            amount: 200,
          },
          {
            id: 2,
            date: '2024-01-17',
            label: 'Paiement fournisseur',
            amount: 200,
          },
        ];
        const balances = [{ date: '2024-01-31', balance: 200 }];

        const result = service.validateMovements(movements, balances);

        expect(result.isValid).toBe(false);

        const duplicateReason = result.reasons.find(
          (r) => r.type === ValidationReasonType.DUPLICATE_SUSPECTED,
        );
        expect(duplicateReason).toBeDefined();
      });
    });

    describe('Gestion des périodes multiples', () => {
      it('devrait valider chaque période indépendamment', () => {
        const movements = [
          { id: 1, date: '2024-01-15', label: 'Dépôt', amount: 1000 },
          { id: 2, date: '2024-02-15', label: 'Retrait', amount: -200 },
          { id: 3, date: '2024-03-15', label: 'Achat', amount: -100 },
        ];
        const balances = [
          { date: '2024-01-31', balance: 1000 },
          { date: '2024-02-29', balance: 800 },
          { date: '2024-03-31', balance: 600 }, // Manque 100€
        ];

        const result = service.validateMovements(movements, balances);

        expect(result.isValid).toBe(false);

        // L'écart ne devrait être détecté que pour la dernière période
        const balanceMismatch = result.reasons.find(
          (r): r is BalanceMismatchReason =>
            r.type === ValidationReasonType.BALANCE_MISMATCH,
        );
        expect(balanceMismatch).toBeDefined();
        expect(balanceMismatch?.checkpointDate).toBe('2024-03-31');
      });

      it("devrait traiter les balances dans l'ordre chronologique", () => {
        const movements = [
          { id: 1, date: '2024-01-15', label: 'Dépôt', amount: 500 },
          { id: 2, date: '2024-02-15', label: 'Dépôt', amount: 500 },
        ];
        // Balances dans le désordre
        const balances = [
          { date: '2024-02-28', balance: 1000 },
          { date: '2024-01-31', balance: 500 },
        ];

        const result = service.validateMovements(movements, balances);

        expect(result.isValid).toBe(true);
      });
    });

    describe('Cas limites', () => {
      it('devrait gérer un seul mouvement', () => {
        const movements = [
          { id: 1, date: '2024-01-15', label: 'Unique', amount: 42 },
        ];
        const balances = [{ date: '2024-01-31', balance: 42 }];

        const result = service.validateMovements(movements, balances);

        expect(result.isValid).toBe(true);
      });

      it('devrait gérer des mouvements exactement à la date du checkpoint', () => {
        const movements = [
          { id: 1, date: '2024-01-31', label: 'Dernier jour', amount: 100 },
        ];
        const balances = [{ date: '2024-01-31', balance: 100 }];

        const result = service.validateMovements(movements, balances);

        expect(result.isValid).toBe(true);
      });

      it('devrait gérer des montants négatifs', () => {
        const movements = [
          { id: 1, date: '2024-01-10', label: 'Dépôt', amount: 1000 },
          { id: 2, date: '2024-01-15', label: 'Retrait ATM', amount: -200 },
          {
            id: 3,
            date: '2024-01-20',
            label: 'Virement sortant',
            amount: -300,
          },
        ];
        const balances = [{ date: '2024-01-31', balance: 500 }];

        const result = service.validateMovements(movements, balances);

        expect(result.isValid).toBe(true);
      });
    });
  });
});
