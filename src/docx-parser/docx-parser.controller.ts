import 'multer';
import { Controller, Post, UseInterceptors, UploadedFiles, BadRequestException, Res, Body } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DocxParserService } from './docx-parser.service';
import type { Response } from 'express';
import type { Express } from 'express';
import archiver from 'archiver';

@Controller('api/v1/exams')
export class DocxParserController {
    constructor(private readonly docxParserService: DocxParserService) { }

    @Post('mix-multi')
    @UseInterceptors(FilesInterceptor('files'))
    async uploadAndMixMultiDocx(
        @UploadedFiles() files: Array<Express.Multer.File>,
        @Body('numExams') numExams: string = '4',
        @Body('startCode') startCode: string = '101',
        @Body('startQuestion') startQuestion: string = '1',
        @Body('useHeader') useHeader: string = 'true',
        @Body('useFooter') useFooter: string = 'true',
        @Body('department') department: string = 'SỞ GD&ĐT...',
        @Body('school') school: string = 'TRƯỜNG THPT...',
        @Body('examName') examName: string = 'KIỂM TRA CUỐI KÌ I',
        @Body('schoolYear') schoolYear: string = 'NĂM HỌC 2025 - 2026',
        @Body('subject') subject: string = 'Toán',
        @Body('duration') duration: string = '90 phút',
        @Res() res: Response
    ) {
        if (!files || files.length === 0) {
            throw new BadRequestException('Vui lòng upload ít nhất 1 file đề gốc (.docx)');
        }
        for (const file of files) {
            if (!file.originalname.endsWith('.docx')) throw new BadRequestException(`File ${file.originalname} không đúng định dạng .docx`);
        }

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="Bo_De_Thi.zip"');

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);

        const nExams = parseInt(numExams, 10);
        const sCode = parseInt(startCode, 10);
        const sQuestion = parseInt(startQuestion, 10);

        const headerInfo = {
            useHeader: useHeader === 'true',
            useFooter: useFooter === 'true',
            department, school, examName, schoolYear, subject, duration
        };

        const fileBuffers = files.map(f => f.buffer);
        await this.docxParserService.generateMultipleExamsZip(fileBuffers, nExams, sCode, sQuestion, headerInfo, archive);

        await archive.finalize();
    }

    @Post('preview')
    @UseInterceptors(FilesInterceptor('files'))
    async previewExamData(
        @UploadedFiles() files: Array<Express.Multer.File>,
        @Body('numExams') numExams: string = '4',
        @Body('startCode') startCode: string = '101',
        @Body('startQuestion') startQuestion: string = '1',
    ) {
        if (!files || files.length === 0) {
            throw new BadRequestException('Vui lòng upload ít nhất 1 file đề gốc (.docx)');
        }
        for (const file of files) {
            if (!file.originalname.endsWith('.docx')) throw new BadRequestException(`File ${file.originalname} không đúng định dạng .docx`);
        }

        const nExams = parseInt(numExams, 10);
        const sCode = parseInt(startCode, 10);
        const sQuestion = parseInt(startQuestion, 10);

        const fileBuffers = files.map(f => f.buffer);
        return await this.docxParserService.previewExams(fileBuffers, nExams, sCode, sQuestion);
    }
}