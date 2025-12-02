import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import {
  ValidationFailureResponse,
  ValidationReason,
  ValidationReasonType,
} from './../src/movements/interfaces';

describe('MovementsController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /movements/validation', () => {
    it('devrait retourner 200 avec "Accepted" pour des données valides', () => {
      return request(app.getHttpServer() as App)
        .post('/movements/validation')
        .send({
          movements: [
            { id: 1, date: '2024-01-15', label: 'Dépôt', amount: 1000 },
            { id: 2, date: '2024-01-20', label: 'Retrait', amount: -300 },
          ],
          balances: [{ date: '2024-01-31', balance: 700 }],
        })
        .expect(200)
        .expect({ message: 'Accepted' });
    });

    it('devrait retourner 422 avec les raisons pour des données invalides', () => {
      return request(app.getHttpServer() as App)
        .post('/movements/validation')
        .send({
          movements: [
            { id: 1, date: '2024-01-15', label: 'Dépôt', amount: 1000 },
          ],
          balances: [{ date: '2024-01-31', balance: 500 }], // Écart de 500€
        })
        .expect(422)
        .expect((res: { body: ValidationFailureResponse }) => {
          expect(res.body.message).toBe('Validation failed');
          expect(res.body.reasons).toBeDefined();
          expect(Array.isArray(res.body.reasons)).toBe(true);
          expect(res.body.reasons.length).toBeGreaterThan(0);
        });
    });

    it('devrait retourner 400 pour des données mal formatées', () => {
      return request(app.getHttpServer() as App)
        .post('/movements/validation')
        .send({
          movements: 'invalid',
          balances: [],
        })
        .expect(400);
    });

    it('devrait retourner 400 si balances est vide', () => {
      return request(app.getHttpServer() as App)
        .post('/movements/validation')
        .send({
          movements: [],
          balances: [],
        })
        .expect(400);
    });

    it('devrait détecter les doublons potentiels', () => {
      return request(app.getHttpServer() as App)
        .post('/movements/validation')
        .send({
          movements: [
            {
              id: 1,
              date: '2024-01-15',
              label: 'Virement client',
              amount: 500,
            },
            {
              id: 2,
              date: '2024-01-15',
              label: 'Virement client',
              amount: 500,
            },
          ],
          balances: [{ date: '2024-01-31', balance: 500 }],
        })
        .expect(422)
        .expect((res: { body: ValidationFailureResponse }) => {
          const duplicateReason = res.body.reasons.find(
            (r: ValidationReason) =>
              r.type === ValidationReasonType.DUPLICATE_SUSPECTED,
          );
          expect(duplicateReason).toBeDefined();
          if (
            duplicateReason &&
            duplicateReason.type === ValidationReasonType.DUPLICATE_SUSPECTED
          ) {
            expect(duplicateReason.movements).toHaveLength(2);
          }
        });
    });

    it('devrait indiquer les mouvements manquants', () => {
      return request(app.getHttpServer() as App)
        .post('/movements/validation')
        .send({
          movements: [
            { id: 1, date: '2024-01-15', label: 'Dépôt initial', amount: 100 },
          ],
          balances: [{ date: '2024-01-31', balance: 350 }],
        })
        .expect(422)
        .expect((res: { body: ValidationFailureResponse }) => {
          const missingReason = res.body.reasons.find(
            (r: ValidationReason) =>
              r.type === ValidationReasonType.MISSING_MOVEMENTS,
          );
          expect(missingReason).toBeDefined();
          if (
            missingReason &&
            missingReason.type === ValidationReasonType.MISSING_MOVEMENTS
          ) {
            expect(missingReason.missingAmount).toBe(250);
          }
        });
    });

    it('devrait valider plusieurs périodes correctement', () => {
      return request(app.getHttpServer() as App)
        .post('/movements/validation')
        .send({
          movements: [
            { id: 1, date: '2024-01-10', label: 'Salaire', amount: 2500 },
            { id: 2, date: '2024-01-25', label: 'Loyer', amount: -800 },
            { id: 3, date: '2024-02-10', label: 'Salaire', amount: 2500 },
            { id: 4, date: '2024-02-20', label: 'Courses', amount: -400 },
          ],
          balances: [
            { date: '2024-01-31', balance: 1700 },
            { date: '2024-02-29', balance: 3800 },
          ],
        })
        .expect(200)
        .expect({ message: 'Accepted' });
    });
  });
});
