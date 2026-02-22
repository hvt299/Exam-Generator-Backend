import { Test, TestingModule } from '@nestjs/testing';
import { DocxParserService } from './docx-parser.service';

describe('DocxParserService', () => {
  let service: DocxParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocxParserService],
    }).compile();

    service = module.get<DocxParserService>(DocxParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
