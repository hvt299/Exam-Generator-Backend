import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocxParserService } from './docx-parser.service';

@Controller('api/v1/exams')
export class DocxParserController {
    constructor(private readonly docxParserService: DocxParserService) { }

    @Post('upload-raw')
    @UseInterceptors(FileInterceptor('file'))
    uploadDocx(@UploadedFile() file: Express.Multer.File) {
        if (!file) {
            throw new BadRequestException('Vui lòng upload file .docx');
        }

        if (!file.originalname.endsWith('.docx')) {
            throw new BadRequestException('Chỉ chấp nhận định dạng .docx');
        }

        const rawXml = this.docxParserService.extractDocumentXml(file.buffer);
        const domResult = this.docxParserService.parseXmlToDom(rawXml);
        const classifiedLines = this.docxParserService.classifyParagraphs(domResult.paragraphs);
        const baseQuestions = this.docxParserService.buildQuestionBlocks(classifiedLines);

        const variant1 = this.docxParserService.generateExamVariant(baseQuestions);
        const variant2 = this.docxParserService.generateExamVariant(baseQuestions);

        const formatVariant = (variant: any[]) => variant.map(q => ({
            question: q.questionText.substring(0, 40) + '...',
            answers: q.answers.map(a => `[${a.char}] ${a.text}`)
        })).slice(0, 3);

        return {
            message: 'Shuffler Engine hoạt động hoàn hảo!',
            original_Top3: formatVariant(baseQuestions),
            variant1_Top3: formatVariant(variant1),
            variant2_Top3: formatVariant(variant2),
        };
    }
}