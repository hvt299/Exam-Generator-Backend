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

  describe('splitAnswerParts', () => {
    it('should not falsely split answers ending in A. or C. like 3-PGA. or OAA.', () => {
      expect(service.splitAnswerParts('C. 3-PGA.', false)).toEqual(['C. 3-PGA.']);
      expect(service.splitAnswerParts('D. OAA.', false)).toEqual(['D. OAA.']);
      expect(service.splitAnswerParts('C. Cây vùng lạnh có thể quang hợp ở nhiệt độ thấp hơn 0oC.', false))
        .toEqual(['C. Cây vùng lạnh có thể quang hợp ở nhiệt độ thấp hơn 0oC.']);
    });

    it('should correctly split multiple answers on the same line', () => {
      expect(service.splitAnswerParts('A. RuBP.\tB. G3P.', false)).toEqual(['A. RuBP.', 'B. G3P.']);
      expect(service.splitAnswerParts('C. 3-PGA.\tD. OAA.', false)).toEqual(['C. 3-PGA.', 'D. OAA.']);
      expect(service.splitAnswerParts('A. RuBP.   B. G3P.   C. 3-PGA.   D. OAA.', false))
        .toEqual(['A. RuBP.', 'B. G3P.', 'C. 3-PGA.', 'D. OAA.']);
      // Câu 20: Dãy số có tab hoặc không có khoảng trắng do XML
      expect(service.splitAnswerParts('\tA. 1.\tB. 2.\tC. 3. \tD. 4. ', false))
        .toEqual(['A. 1.', 'B. 2.', 'C. 3.', 'D. 4.']);
      expect(service.splitAnswerParts('A. 1.B. 2.C. 3.D. 4.', false))
        .toEqual(['A. 1.', 'B. 2.', 'C. 3.', 'D. 4.']);
      expect(service.splitAnswerParts('\tA. 1.\tB. 2.C. 3. \tD. 4. ', false))
        .toEqual(['A. 1.', 'B. 2.', 'C. 3.', 'D. 4.']);
    });

    it('should correctly split True/False answers on the same line', () => {
      expect(service.splitAnswerParts('a) Đúng\tb) Sai\tc) Đúng\td) Sai', true))
        .toEqual(['a) Đúng', 'b) Sai', 'c) Đúng', 'd) Sai']);
    });
  });
});
