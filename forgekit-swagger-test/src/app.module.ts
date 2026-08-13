import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    CommonModule,
    InfrastructureModule,
    AuthModule,
  ],
})
export class AppModule {}