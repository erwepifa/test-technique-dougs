import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { MovementsController } from './movements.controller';
import { MovementsService } from './movements.service';
import { ValidationFailureResponse } from './interfaces';

describe('MovementsController', () => {
  let controller: MovementsController;
  let service: MovementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MovementsController],
      providers: [MovementsService],
    }).compile();

    controller = module.get<MovementsController>(MovementsController);
    service = module.get<MovementsService>(MovementsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('validateMovements', () => {
    it('devrait retourner "Accepted" quand la validation réussit', () => {
      const dto = {
        movements: [{ id: 1, date: '2024-01-15', label: 'Test', amount: 100 }],
        balances: [{ date: '2024-01-31', balance: 100 }],
      };

      const result = controller.validateMovements(dto);

      expect(result).toEqual({ message: 'Accepted' });
    });

    it('devrait lancer une HttpException quand la validation échoue', () => {
      const dto = {
        movements: [{ id: 1, date: '2024-01-15', label: 'Test', amount: 100 }],
        balances: [{ date: '2024-01-31', balance: 200 }], // Écart volontaire
      };

      expect(() => controller.validateMovements(dto)).toThrow(HttpException);
    });

    it("devrait inclure les raisons dans la réponse d'erreur", () => {
      const dto = {
        movements: [{ id: 1, date: '2024-01-15', label: 'Test', amount: 100 }],
        balances: [{ date: '2024-01-31', balance: 200 }],
      };

      try {
        controller.validateMovements(dto);
        fail('Expected HttpException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (
          error as HttpException
        ).getResponse() as ValidationFailureResponse;
        expect(response).toHaveProperty('message', 'Validation failed');
        expect(response).toHaveProperty('reasons');
        expect(Array.isArray(response.reasons)).toBe(true);
      }
    });

    it('devrait utiliser le service pour la validation', () => {
      const spy = jest.spyOn(service, 'validateMovements');
      const dto = {
        movements: [{ id: 1, date: '2024-01-15', label: 'Test', amount: 100 }],
        balances: [{ date: '2024-01-31', balance: 100 }],
      };

      controller.validateMovements(dto);

      expect(spy).toHaveBeenCalledWith(dto.movements, dto.balances);
    });

    it("devrait retourner le code HTTP 422 en cas d'échec", () => {
      const dto = {
        movements: [],
        balances: [{ date: '2024-01-31', balance: 100 }], // Impossible sans mouvements
      };

      try {
        controller.validateMovements(dto);
        fail('Expected HttpException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    });
  });
});
