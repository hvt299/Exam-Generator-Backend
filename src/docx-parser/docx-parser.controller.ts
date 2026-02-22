import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException, Res, Header } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocxParserService } from './docx-parser.service';
import express from 'express';

@Controller('api/v1/exams')
export class DocxParserController {
    constructor(private readonly docxParserService: DocxParserService) { }

    @Post('mix')
    @UseInterceptors(FileInterceptor('file'))
    @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    @Header('Content-Disposition', 'attachment; filename="De_Thi_Da_Tron.docx"')
    uploadAndMixDocx(@UploadedFile() file: Express.Multer.File, @Res() res: express.Response) {
        if (!file) {
            throw new BadRequestException('Vui lòng upload file .docx');
        }

        if (!file.originalname.endsWith('.docx')) {
            throw new BadRequestException('Chỉ chấp nhận định dạng .docx');
        }

        const rawXml = this.docxParserService.extractDocumentXml(file.buffer);
        const domResult = this.docxParserService.parseXmlToDom(rawXml);
        const classifiedLines = this.docxParserService.classifyParagraphs(domResult.paragraphs);
        const baseQuestions = this.docxParserService.buildQuestionBlocks(classifiedLines, domResult.docDom);
        const mixedVariant = this.docxParserService.generateExamVariant(baseQuestions);
        const finalBuffer = this.docxParserService.buildFinalDocx(file.buffer, domResult.docDom, classifiedLines, mixedVariant);

        res.send(finalBuffer);
    }
}