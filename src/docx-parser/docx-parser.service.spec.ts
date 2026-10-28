import { Test, TestingModule } from '@nestjs/testing';
import { DocxParserService, Question } from './docx-parser.service';

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

  describe('generateExamVariant - Preserve Section Order (Part 1 -> Part 2 -> Part 3 -> Part 4)', () => {
    it('should strictly preserve part sequence I -> II -> III -> IV without mixing across parts', () => {
      const mockQuestions: Question[] = [
        // Part 2 questions (Đúng Sai)
        {
          questionText: 'Câu 1. Đúng sai 1',
          questionNodes: [],
          answers: [
            { char: 'a', text: 'a) Đúng', isPinned: false, originalNode: null, originalIndex: 0, isCorrect: true },
            { char: 'b', text: 'b) Sai', isPinned: false, originalNode: null, originalIndex: 1, isCorrect: false },
            { char: 'c', text: 'c) Đúng', isPinned: false, originalNode: null, originalIndex: 2, isCorrect: true },
            { char: 'd', text: 'd) Sai', isPinned: false, originalNode: null, originalIndex: 3, isCorrect: false },
          ],
          group: '<g3#2>',
          part: 2,
        },
        // Part 1 questions (Trắc nghiệm)
        {
          questionText: 'Câu 2. Trắc nghiệm 1',
          questionNodes: [],
          answers: [
            { char: 'A', text: 'A. Phương án 1', isPinned: false, originalNode: null, originalIndex: 0, isCorrect: true },
            { char: 'B', text: 'B. Phương án 2', isPinned: false, originalNode: null, originalIndex: 1, isCorrect: false },
            { char: 'C', text: 'C. Phương án 3', isPinned: false, originalNode: null, originalIndex: 2, isCorrect: false },
            { char: 'D', text: 'D. Phương án 4', isPinned: false, originalNode: null, originalIndex: 3, isCorrect: false },
          ],
          group: '<g3#1>',
          part: 1,
        },
        // Part 4 question (Tự luận)
        {
          questionText: 'Câu 3. Tự luận',
          questionNodes: [],
          answers: [],
          group: '<g0#4>',
          part: 4,
        },
        // Part 3 question (Trả lời ngắn)
        {
          questionText: 'Câu 4. Điền số',
          questionNodes: [],
          answers: [
            { char: 'A', text: 'A. 12,5', isPinned: false, originalNode: null, originalIndex: 0, isCorrect: true },
          ],
          group: '<g1#3>',
          part: 3,
        },
      ];

      const variant = service.generateExamVariant(mockQuestions);

      // Verify that all Part 1 questions appear first, then Part 2, then Part 3, then Part 4
      expect(variant.length).toBe(4);
      expect(variant[0].part).toBe(1);
      expect(variant[1].part).toBe(2);
      expect(variant[2].part).toBe(3);
      expect(variant[3].part).toBe(4);
    });

    it('should keep passage questions grouped without merging different passages with the same tag', () => {
      const passage1Qs: Question[] = [
        {
          questionText: 'Câu 1. Bài đọc 1 - Câu 1',
          questionNodes: [],
          answers: [
            { char: 'A', text: 'A. 1', isPinned: false, originalNode: null, originalIndex: 0, isCorrect: true },
            { char: 'B', text: 'B. 2', isPinned: false, originalNode: null, originalIndex: 1, isCorrect: false },
            { char: 'C', text: 'C. 3', isPinned: false, originalNode: null, originalIndex: 2, isCorrect: false },
            { char: 'D', text: 'D. 4', isPinned: false, originalNode: null, originalIndex: 3, isCorrect: false },
          ],
          group: '<g2#1>',
          part: 1,
        },
        {
          questionText: 'Câu 2. Bài đọc 1 - Câu 2',
          questionNodes: [],
          answers: [
            { char: 'A', text: 'A. 1', isPinned: false, originalNode: null, originalIndex: 0, isCorrect: true },
            { char: 'B', text: 'B. 2', isPinned: false, originalNode: null, originalIndex: 1, isCorrect: false },
            { char: 'C', text: 'C. 3', isPinned: false, originalNode: null, originalIndex: 2, isCorrect: false },
            { char: 'D', text: 'D. 4', isPinned: false, originalNode: null, originalIndex: 3, isCorrect: false },
          ],
          group: '<g2#1>',
          part: 1,
        },
      ];

      const singleQ: Question = {
        questionText: 'Câu 3. Câu đơn',
        questionNodes: [],
        answers: [
          { char: 'A', text: 'A. 1', isPinned: false, originalNode: null, originalIndex: 0, isCorrect: true },
          { char: 'B', text: 'B. 2', isPinned: false, originalNode: null, originalIndex: 1, isCorrect: false },
          { char: 'C', text: 'C. 3', isPinned: false, originalNode: null, originalIndex: 2, isCorrect: false },
          { char: 'D', text: 'D. 4', isPinned: false, originalNode: null, originalIndex: 3, isCorrect: false },
        ],
        group: '<g3#1>',
        part: 1,
      };

      const passage2Qs: Question[] = [
        {
          questionText: 'Câu 4. Bài đọc 2 - Câu 1',
          questionNodes: [],
          answers: [
            { char: 'A', text: 'A. 1', isPinned: false, originalNode: null, originalIndex: 0, isCorrect: true },
            { char: 'B', text: 'B. 2', isPinned: false, originalNode: null, originalIndex: 1, isCorrect: false },
            { char: 'C', text: 'C. 3', isPinned: false, originalNode: null, originalIndex: 2, isCorrect: false },
            { char: 'D', text: 'D. 4', isPinned: false, originalNode: null, originalIndex: 3, isCorrect: false },
          ],
          group: '<g2#1>',
          part: 1,
        },
      ];

      const variant = service.generateExamVariant([...passage1Qs, singleQ, ...passage2Qs]);

      // With g2 (only shuffle answers, keep question order), passage 1 questions must stay before singleQ, and singleQ before passage 2
      expect(variant[0].questionText).toContain('Bài đọc 1 - Câu 1');
      expect(variant[1].questionText).toContain('Bài đọc 1 - Câu 2');
      expect(variant[2].questionText).toContain('Câu đơn');
      expect(variant[3].questionText).toContain('Bài đọc 2 - Câu 1');
    });
  });

  describe('Section Headers and Part IV Recognition', () => {
    it('should correctly classify Section Headers, Questions with points, Essay sub-items, and End of exam', () => {
      const mockParagraphs = [
        { textContent: 'PHẦN IV. TỰ LUẬN (3,0 điểm)', getElementsByTagName: () => [{ textContent: 'PHẦN IV. TỰ LUẬN (3,0 điểm)' }] },
        { textContent: 'Câu 1 (2,0 điểm): Cho hàm số y = f(x)', getElementsByTagName: () => [{ textContent: 'Câu 1 (2,0 điểm): Cho hàm số y = f(x)' }] },
        { textContent: '1. Khảo sát sự biến thiên của hàm số.', getElementsByTagName: () => [{ textContent: '1. Khảo sát sự biến thiên của hàm số.' }] },
        { textContent: '2. Tìm giá trị lớn nhất của hàm số trên [0; 3].', getElementsByTagName: () => [{ textContent: '2. Tìm giá trị lớn nhất của hàm số trên [0; 3].' }] },
        { textContent: 'Bài 2 (1,0 điểm): Trong không gian Oxyz...', getElementsByTagName: () => [{ textContent: 'Bài 2 (1,0 điểm): Trong không gian Oxyz...' }] },
        { textContent: '1. Viết phương trình mặt phẳng (P).', getElementsByTagName: () => [{ textContent: '1. Viết phương trình mặt phẳng (P).' }] },
        { textContent: '2. Tính khoảng cách từ O đến (P).', getElementsByTagName: () => [{ textContent: '2. Tính khoảng cách từ O đến (P).' }] },
        { textContent: '------------------ HẾT ------------------', getElementsByTagName: () => [{ textContent: '------------------ HẾT ------------------' }] },
      ];
      (mockParagraphs as any).item = function(i: number) { return this[i]; };

      const classified = service.classifyParagraphs(mockParagraphs);

      expect(classified[0].type).toBe('SECTION_HEADER');
      expect(classified[1].type).toBe('QUESTION');
      expect(classified[2].type).toBe('ANSWER_ESSAY');
      expect(classified[3].type).toBe('ANSWER_ESSAY');
      expect(classified[4].type).toBe('QUESTION');
      expect(classified[5].type).toBe('ANSWER_ESSAY');
      expect(classified[6].type).toBe('ANSWER_ESSAY');
      expect(classified[7].type).toBe('END_OF_EXAM');

      const mockDocDom = { getElementsByTagName: () => [] };
      const { questions, errors } = service.buildQuestionBlocks(classified, mockDocDom);

      expect(errors).toHaveLength(0);
      expect(questions).toHaveLength(2); // Câu 1 and Bài 2 are separate questions, not stuck together
      expect(questions[0].part).toBe(4);
      expect(questions[1].part).toBe(4);
      expect(questions[0].questionText).toContain('Câu 1 (2,0 điểm)');
      expect(questions[0].questionText).toContain('1. Khảo sát');
      expect(questions[1].questionText).toContain('Bài 2 (1,0 điểm)');
      expect(questions[1].questionText).not.toContain('HẾT'); // HẾT was stripped!
    });

    it('should correctly process Part III questions and maintain strict Part I -> II -> III -> IV sequence', () => {
      const mockDoc = [
        { textContent: 'PHẦN I. TRẮC NGHIỆM', getElementsByTagName: () => [{ textContent: 'PHẦN I. TRẮC NGHIỆM' }] },
        { textContent: 'Câu 1. Thủ đô là gì?', getElementsByTagName: () => [{ textContent: 'Câu 1. Thủ đô là gì?' }] },
        { textContent: 'A. Hà Nội\tB. Huế\tC. Đà Nẵng\tD. Cần Thơ', getElementsByTagName: () => [{ textContent: 'A. Hà Nội\tB. Huế\tC. Đà Nẵng\tD. Cần Thơ' }] },
        { textContent: 'PHẦN II. ĐÚNG SAI', getElementsByTagName: () => [{ textContent: 'PHẦN II. ĐÚNG SAI' }] },
        { textContent: 'Câu 2. Xét tính đúng sai:', getElementsByTagName: () => [{ textContent: 'Câu 2. Xét tính đúng sai:' }] },
        { textContent: 'a) Đúng\tb) Sai\tc) Đúng\td) Sai', getElementsByTagName: () => [{ textContent: 'a) Đúng\tb) Sai\tc) Đúng\td) Sai' }] },
        { textContent: 'PHẦN III. TRẢ LỜI NGẮN', getElementsByTagName: () => [{ textContent: 'PHẦN III. TRẢ LỜI NGẮN' }] },
        { textContent: 'Câu 3. Có bao nhiêu nghiệm nguyên?', getElementsByTagName: () => [{ textContent: 'Câu 3. Có bao nhiêu nghiệm nguyên?' }] },
        { textContent: 'A. 12', getElementsByTagName: () => [{ textContent: 'A. 12' }] },
        { textContent: 'Câu 4. Tìm giá trị cực đại:', getElementsByTagName: () => [{ textContent: 'Câu 4. Tìm giá trị cực đại:' }] },
        { textContent: 'Đáp án: 3,5', getElementsByTagName: () => [{ textContent: 'Đáp án: 3,5' }] },
        { textContent: 'PHẦN IV. TỰ LUẬN', getElementsByTagName: () => [{ textContent: 'PHẦN IV. TỰ LUẬN' }] },
        { textContent: 'Câu 5 (2 điểm): Giải phương trình sau:', getElementsByTagName: () => [{ textContent: 'Câu 5 (2 điểm): Giải phương trình sau:' }] },
        { textContent: '1. Biến đổi về dạng chuẩn.', getElementsByTagName: () => [{ textContent: '1. Biến đổi về dạng chuẩn.' }] },
        { textContent: '2. Kết luận tập nghiệm.', getElementsByTagName: () => [{ textContent: '2. Kết luận tập nghiệm.' }] },
        { textContent: 'HẾT', getElementsByTagName: () => [{ textContent: 'HẾT' }] },
      ];
      (mockDoc as any).item = function(i: number) { return this[i]; };

      const classified = service.classifyParagraphs(mockDoc);
      const mockDocDom = { getElementsByTagName: () => [] };
      const { questions, errors } = service.buildQuestionBlocks(classified, mockDocDom);

      // NO_CORRECT_ANSWER and NO_TF_MARKED are expected because mock text has no color/underline
      expect(errors.some(e => e.type === 'NO_CORRECT_ANSWER')).toBe(true);
      expect(errors.some(e => e.type === 'NO_TF_MARKED')).toBe(true);
      expect(questions).toHaveLength(5);
      expect(questions[0].part).toBe(1);
      expect(questions[1].part).toBe(2);
      expect(questions[2].part).toBe(3);
      expect(questions[3].part).toBe(3);
      expect(questions[4].part).toBe(4);

      // Verify sequence in generateExamVariant
      const variant = service.generateExamVariant(questions);
      expect(variant.map(q => q.part)).toEqual([1, 2, 3, 3, 4]);
    });
  });

  describe('Requirements 1 to 5: Custom numbering, Part selection, Table in questions, Section headers', () => {
    it('Req 1: should attach section headers to the first question of each part after shuffling', () => {
      const mockHeaders = new Map<number, any[]>();
      mockHeaders.set(1, [{ textContent: 'PHẦN I' }]);
      mockHeaders.set(2, [{ textContent: 'PHẦN II' }]);

      const mockQuestions: Question[] = [
        { questionText: 'Câu 1. Q1', questionNodes: [], answers: [], group: '<g3#1>', part: 1 },
        { questionText: 'Câu 2. Q2', questionNodes: [], answers: [], group: '<g3#1>', part: 1 },
        { questionText: 'Câu 3. Q3', questionNodes: [], answers: [], group: '<g3#2>', part: 2 },
      ];

      const variant = service.generateExamVariant(mockQuestions, undefined, mockHeaders);
      expect(variant[0].sectionHeaderNodes).toBeDefined();
      expect(variant[0].sectionHeaderNodes![0].textContent).toBe('PHẦN I');
      expect(variant[1].sectionHeaderNodes).toBeUndefined(); // Second question in Part 1 has no section header
      expect(variant[2].sectionHeaderNodes).toBeDefined();
      expect(variant[2].sectionHeaderNodes![0].textContent).toBe('PHẦN II');
    });

    it('Req 3 & 4: should support per-part starting question numbers and filter by selectedParts', () => {
      const mockQuestions: Question[] = [
        { questionText: 'Câu 1. P1 Q1', questionNodes: [], answers: [], group: '<g0#1>', part: 1 },
        { questionText: 'Câu 2. P1 Q2', questionNodes: [], answers: [], group: '<g0#1>', part: 1 },
        { questionText: 'Câu 3. P2 Q1', questionNodes: [], answers: [], group: '<g0#2>', part: 2 },
        { questionText: 'Câu 4. P3 Q1', questionNodes: [], answers: [], group: '<g0#3>', part: 3 },
        { questionText: 'Câu 5. P4 Q1', questionNodes: [], answers: [], group: '<g0#4>', part: 4 },
      ];

      // Per-part numbering: P1 from 1, P2 from 1, P3 from 21, P4 from 31
      const perPartVariant = service.generateExamVariant(mockQuestions, {
        numberingMode: 'per_part',
        p1StartQuestion: 1,
        p2StartQuestion: 1,
        p3StartQuestion: 21,
        p4StartQuestion: 31,
      });

      expect(perPartVariant[0].assignedNumber).toBe(1); // Part 1, Question 1
      expect(perPartVariant[1].assignedNumber).toBe(2); // Part 1, Question 2
      expect(perPartVariant[2].assignedNumber).toBe(1); // Part 2, Question 1
      expect(perPartVariant[3].assignedNumber).toBe(21); // Part 3, Question 1
      expect(perPartVariant[4].assignedNumber).toBe(31); // Part 4, Question 1

      // Selected parts filter: only Parts 1 and 2
      const filteredVariant = service.generateExamVariant(mockQuestions, {
        selectedParts: [1, 2],
      });
      expect(filteredVariant).toHaveLength(3);
      expect(filteredVariant.every(q => q.part === 1 || q.part === 2)).toBe(true);
    });

    it('Req 5: should preserve content table <w:tbl> inside question nodes without raising error', () => {
      const mockTableNode = {
        nodeName: 'w:tbl',
        textContent: 'Bảng số liệu 1 | Giá trị A | Giá trị B',
        getElementsByTagName: () => [],
      };
      const mockDoc = [
        { textContent: 'Câu 1. Cho bảng sau:', getElementsByTagName: () => [{ textContent: 'Câu 1. Cho bảng sau:' }] },
        mockTableNode,
        { textContent: 'A. 1\tB. 2\tC. 3\tD. 4', getElementsByTagName: () => [{ textContent: 'A. 1\tB. 2\tC. 3\tD. 4' }] },
      ];
      (mockDoc as any).item = function(i: number) { return this[i]; };

      const classified = service.classifyParagraphs(mockDoc);
      expect(classified[1].type).toBe('TABLE');

      const mockDocDom = { getElementsByTagName: () => [mockTableNode] };
      const { questions, errors } = service.buildQuestionBlocks(classified, mockDocDom);

      // Should not flag TABLE_DETECTED because table has no A. B. C. D. answers
      expect(errors.some(e => e.type === 'TABLE_DETECTED')).toBe(false);
      expect(questions).toHaveLength(1);
      expect(questions[0].questionNodes).toContain(mockTableNode);
    });
  });
});
