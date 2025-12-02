import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { MovementsService } from './movements.service';
import { ValidateMovementsDto } from './dto';
import {
  ValidationSuccessResponse,
  ValidationFailureResponse,
} from './interfaces';

@Controller('movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Post('validation')
  @HttpCode(HttpStatus.OK)
  validateMovements(
    @Body() validateMovementsDto: ValidateMovementsDto,
  ): ValidationSuccessResponse | ValidationFailureResponse {
    const { movements, balances } = validateMovementsDto;

    const result = this.movementsService.validateMovements(movements, balances);

    if (result.isValid) {
      return { message: 'Accepted' };
    }

    throw new HttpException(
      {
        message: 'Validation failed',
        reasons: result.reasons,
      } satisfies ValidationFailureResponse,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
