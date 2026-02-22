import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException, Res, Header, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocxParserService } from './docx-parser.service';
import type { Response } from 'express';
import type { Express } from 'express';
import archiver from 'archiver';

@Controller('api/v1/exams')
export class DocxParserController {
    constructor(private readonly docxParserService: DocxParserService) { }

    @Post('mix')
    @UseInterceptors(FileInterceptor('file'))
    @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    @Header('Content-Disposition', 'attachment; filename="De_Thi_Da_Tron.docx"')
    uploadAndMixDocx(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
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

    @Post('mix-multi')
    @UseInterceptors(FileInterceptor('file'))
    async uploadAndMixMultiDocx(
        @UploadedFile() file: Express.Multer.File,
        @Body('numExams') numExams: string = '4',
        @Body('startCode') startCode: string = '101',
        @Res() res: Response
    ) {
        if (!file || !file.originalname.endsWith('.docx')) {
            throw new BadRequestException('Vui lòng upload file .docx');
        }

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="Bo_De_Thi_Va_Dap_An.zip"');

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);

        const nExams = parseInt(numExams, 10);
        const sCode = parseInt(startCode, 10);

        await this.docxParserService.generateMultipleExamsZip(file.buffer, nExams, sCode, archive);

        await archive.finalize();
    }
}