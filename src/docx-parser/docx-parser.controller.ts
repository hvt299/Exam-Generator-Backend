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

        return {
            message: 'Trích xuất XML thành công!',
            fileName: file.originalname,
            xmlLength: rawXml.length,
        };
    }
}