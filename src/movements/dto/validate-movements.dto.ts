import { Type } from 'class-transformer';
import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { MovementDto } from './movement.dto';
import { BalanceDto } from './balance.dto';

export class ValidateMovementsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MovementDto)
  movements: MovementDto[];

  @IsArray()
  @ArrayMinSize(1, { message: 'Au moins un point de contrôle est requis' })
  @ValidateNested({ each: true })
  @Type(() => BalanceDto)
  balances: BalanceDto[];
}
