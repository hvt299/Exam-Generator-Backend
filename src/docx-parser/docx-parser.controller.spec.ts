import { Test, TestingModule } from '@nestjs/testing';
import { DocxParserController } from './docx-parser.controller';

import { DocxParserService } from './docx-parser.service';

describe('DocxParserController', () => {
  let controller: DocxParserController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocxParserController],
      providers: [DocxParserService],
    }).compile();

    controller = module.get<DocxParserController>(DocxParserController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
