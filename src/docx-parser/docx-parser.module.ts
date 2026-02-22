import { Module } from '@nestjs/common';
import { DocxParserService } from './docx-parser.service';
import { DocxParserController } from './docx-parser.controller';

@Module({
  providers: [DocxParserService],
  controllers: [DocxParserController]
})
export class DocxParserModule {}
