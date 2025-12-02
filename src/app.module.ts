import { Module } from '@nestjs/common';
import { MovementsModule } from './movements';

@Module({
  imports: [MovementsModule],
})
export class AppModule {}
