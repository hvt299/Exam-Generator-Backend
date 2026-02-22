import { Injectable, BadRequestException } from '@nestjs/common';
import AdmZip from 'adm-zip';

@Injectable()
export class DocxParserService {

    extractDocumentXml(fileBuffer: Buffer): string {
        try {
            const zip = new AdmZip(fileBuffer);
            const zipEntries = zip.getEntries();
            const docXmlEntry = zipEntries.find(entry => entry.entryName === 'word/document.xml');

            if (!docXmlEntry) {
                throw new BadRequestException('File DOCX không hợp lệ: Không tìm thấy word/document.xml');
            }

            const xmlString = docXmlEntry.getData().toString('utf8');
            return xmlString;

        } catch (error) {
            throw new BadRequestException(`Lỗi khi đọc file DOCX: ${error.message}`);
        }
    }
}