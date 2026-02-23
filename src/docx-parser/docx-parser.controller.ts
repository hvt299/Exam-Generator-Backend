import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException, Res, Header, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocxParserService } from './docx-parser.service';
import type { Response } from 'express';
import type { Express } from 'express';
import archiver from 'archiver';

@Controller('api/v1/exams')
export class DocxParserController {
    constructor(private readonly docxParserService: DocxParserService) { }

    @Post('mix-multi')
    @UseInterceptors(FileInterceptor('file'))
    async uploadAndMixMultiDocx(
        @UploadedFile() file: Express.Multer.File,
        @Body('numExams') numExams: string = '4',
        @Body('startCode') startCode: string = '101',
        @Body('startQuestion') startQuestion: string = '1',
        @Res() res: Response
    ) {
        if (!file || !file.originalname.endsWith('.docx')) {
            throw new BadRequestException('Vui lòng upload file .docx');
        }

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="Bo_De_Thi.zip"');

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);

        const nExams = parseInt(numExams, 10);
        const sCode = parseInt(startCode, 10);
        const sQuestion = parseInt(startQuestion, 10);

        await this.docxParserService.generateMultipleExamsZip(file.buffer, nExams, sCode, sQuestion, archive);

        await archive.finalize();
    }
}