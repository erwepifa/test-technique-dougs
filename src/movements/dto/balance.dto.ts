import { IsNumber, IsDateString } from 'class-validator';

export class BalanceDto {
  @IsDateString()
  date: string;

  @IsNumber()
  balance: number;
}
