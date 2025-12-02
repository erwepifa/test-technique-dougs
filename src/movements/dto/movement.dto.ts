import { IsNumber, IsString, IsDateString } from 'class-validator';

export class MovementDto {
  @IsNumber()
  id: number;

  @IsDateString()
  date: string;

  @IsString()
  label: string;

  @IsNumber()
  amount: number;
}
