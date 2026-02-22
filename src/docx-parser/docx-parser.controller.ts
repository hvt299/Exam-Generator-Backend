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

        const report = classifiedLines.slice(0, 20).map(line => ({
            type: line.type,
            text: line.text.trim()
        }));

        return {
            message: 'Phân loại Regex thành công!',
            totalValidLines: classifiedLines.length,
            sampleClassification: report
        };
    }
}