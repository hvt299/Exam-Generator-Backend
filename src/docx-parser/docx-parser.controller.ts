import 'multer';
import { Controller, Post, UseInterceptors, UploadedFiles, BadRequestException, Res, Body } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DocxParserService, FormatConfig } from './docx-parser.service';
import type { Response } from 'express';
import type { Express } from 'express';
import archiver from 'archiver';

function parseSelectedParts(raw: any): number[] | undefined {
    if (!raw) return undefined;
    if (Array.isArray(raw)) return raw.map(x => Number(x)).filter(n => !isNaN(n));
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.map(x => Number(x)).filter(n => !isNaN(n));
        } catch {
            return raw.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
        }
    }
    return undefined;
}

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
        @Body('numberingMode') numberingMode?: 'continuous' | 'per_part',
        @Body('p1StartQuestion') p1StartQuestion?: string,
        @Body('p2StartQuestion') p2StartQuestion?: string,
        @Body('p3StartQuestion') p3StartQuestion?: string,
        @Body('p4StartQuestion') p4StartQuestion?: string,
        @Body('selectedParts') selectedParts?: string | string[],
        @Body('useHeader') useHeader: string = 'true',
        @Body('useFooter') useFooter: string = 'true',
        @Body('department') department: string = 'SỞ GD&ĐT...',
        @Body('school') school: string = 'TRƯỜNG THPT...',
        @Body('examName') examName: string = 'KIỂM TRA CUỐI KÌ I',
        @Body('schoolYear') schoolYear: string = 'NĂM HỌC 2025 - 2026',
        @Body('subject') subject: string = 'Toán',
        @Body('duration') duration: string = '90 phút',
        @Body('questionPrefixFormat') questionPrefixFormat?: 'dot' | 'colon' | 'keep',
        @Body('p1QuestionFormat') p1QuestionFormat?: 'dot' | 'colon' | 'keep',
        @Body('p2QuestionFormat') p2QuestionFormat?: 'dot' | 'colon' | 'keep',
        @Body('p3QuestionFormat') p3QuestionFormat?: 'dot' | 'colon' | 'keep',
        @Body('p4QuestionFormat') p4QuestionFormat?: 'dot' | 'colon' | 'keep',
        @Body('answerLabelFormat') answerLabelFormat?: 'bold_all' | 'bold_char' | 'regular',
        @Body('zipFileName') zipFileName: string = 'Bo_De_Thi.zip',
        @Body('examFilePrefix') examFilePrefix: string = 'Ma_de_',
        @Body('excelFileName') excelFileName: string = 'Dap_an_excel.xlsx',
        @Res() res?: Response
    ) {
        if (!files || files.length === 0) {
            throw new BadRequestException('Vui lòng upload ít nhất 1 file đề gốc (.docx)');
        }
        for (const file of files) {
            if (!file.originalname.endsWith('.docx')) throw new BadRequestException(`File ${file.originalname} không đúng định dạng .docx`);
        }

        const rawZipName = zipFileName || 'Bo_De_Thi.zip';
        const finalZipName = rawZipName.endsWith('.zip') ? rawZipName : `${rawZipName}.zip`;

        if (res) {
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalZipName)}"`);
        }

        const archive = archiver('zip', { zlib: { level: 9 } });
        if (res) {
            archive.pipe(res);
        }

        const nExams = parseInt(numExams, 10);
        const sCode = parseInt(startCode, 10);
        const sQuestion = parseInt(startQuestion, 10);

        const headerInfo = {
            useHeader: useHeader === 'true',
            useFooter: useFooter === 'true',
            department, school, examName, schoolYear, subject, duration
        };

        const formatConfig: FormatConfig = {
            numberingMode: numberingMode || 'continuous',
            startQuestion: sQuestion,
            p1StartQuestion: p1StartQuestion ? parseInt(p1StartQuestion, 10) : 1,
            p2StartQuestion: p2StartQuestion ? parseInt(p2StartQuestion, 10) : 1,
            p3StartQuestion: p3StartQuestion ? parseInt(p3StartQuestion, 10) : 1,
            p4StartQuestion: p4StartQuestion ? parseInt(p4StartQuestion, 10) : 1,
            selectedParts: parseSelectedParts(selectedParts),
            questionPrefixFormat: questionPrefixFormat || 'dot',
            p1QuestionFormat,
            p2QuestionFormat,
            p3QuestionFormat,
            p4QuestionFormat,
            answerLabelFormat: answerLabelFormat || 'bold_all',
            zipFileName: finalZipName,
            examFilePrefix: examFilePrefix || 'Ma_de_',
            excelFileName: excelFileName || 'Dap_an_excel.xlsx'
        };

        const fileBuffers = files.map(f => f.buffer);
        await this.docxParserService.generateMultipleExamsZip(fileBuffers, nExams, sCode, sQuestion, headerInfo, archive, formatConfig);

        await archive.finalize();
    }

    @Post('preview')
    @UseInterceptors(FilesInterceptor('files'))
    async previewExamData(
        @UploadedFiles() files: Array<Express.Multer.File>,
        @Body('numExams') numExams: string = '4',
        @Body('startCode') startCode: string = '101',
        @Body('startQuestion') startQuestion: string = '1',
        @Body('numberingMode') numberingMode?: 'continuous' | 'per_part',
        @Body('p1StartQuestion') p1StartQuestion?: string,
        @Body('p2StartQuestion') p2StartQuestion?: string,
        @Body('p3StartQuestion') p3StartQuestion?: string,
        @Body('p4StartQuestion') p4StartQuestion?: string,
        @Body('selectedParts') selectedParts?: string | string[],
        @Body('questionPrefixFormat') questionPrefixFormat?: 'dot' | 'colon' | 'keep',
        @Body('p1QuestionFormat') p1QuestionFormat?: 'dot' | 'colon' | 'keep',
        @Body('p2QuestionFormat') p2QuestionFormat?: 'dot' | 'colon' | 'keep',
        @Body('p3QuestionFormat') p3QuestionFormat?: 'dot' | 'colon' | 'keep',
        @Body('p4QuestionFormat') p4QuestionFormat?: 'dot' | 'colon' | 'keep',
        @Body('answerLabelFormat') answerLabelFormat?: 'bold_all' | 'bold_char' | 'regular',
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

        const formatConfig: FormatConfig = {
            numberingMode: numberingMode || 'continuous',
            startQuestion: sQuestion,
            p1StartQuestion: p1StartQuestion ? parseInt(p1StartQuestion, 10) : 1,
            p2StartQuestion: p2StartQuestion ? parseInt(p2StartQuestion, 10) : 1,
            p3StartQuestion: p3StartQuestion ? parseInt(p3StartQuestion, 10) : 1,
            p4StartQuestion: p4StartQuestion ? parseInt(p4StartQuestion, 10) : 1,
            selectedParts: parseSelectedParts(selectedParts),
            questionPrefixFormat: questionPrefixFormat || 'dot',
            p1QuestionFormat,
            p2QuestionFormat,
            p3QuestionFormat,
            p4QuestionFormat,
            answerLabelFormat: answerLabelFormat || 'bold_all',
        };

        const fileBuffers = files.map(f => f.buffer);
        return await this.docxParserService.previewExams(fileBuffers, nExams, sCode, sQuestion, formatConfig);
    }
}
