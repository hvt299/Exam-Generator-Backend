import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DocxParserModule } from './docx-parser/docx-parser.module';

@Module({
  imports: [DocxParserModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
