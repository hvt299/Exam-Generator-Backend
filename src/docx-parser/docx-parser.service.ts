import { Injectable, BadRequestException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';

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

    parseXmlToDom(xmlString: string) {
        try {
            const parser = new DOMParser();
            const docDom = parser.parseFromString(xmlString, 'text/xml');
            const paragraphs = docDom.getElementsByTagName('w:p');

            return {
                docDom,
                paragraphs,
                paragraphCount: paragraphs.length
            };
        } catch (error) {
            throw new BadRequestException(`Lỗi khi parse XML sang DOM: ${error.message}`);
        }
    }

    extractTextFromParagraph(pNode: any): string {
        let text = '';
        const textNodes = pNode.getElementsByTagName('w:t');

        for (let i = 0; i < textNodes.length; i++) {
            const tNode = textNodes.item(i);
            if (tNode && tNode.textContent) {
                text += tNode.textContent;
            }
        }

        return text;
    }

    getAllParagraphTexts(paragraphs: any): string[] {
        const texts: string[] = [];
        for (let i = 0; i < paragraphs.length; i++) {
            const pNode = paragraphs.item(i);
            const text = this.extractTextFromParagraph(pNode);

            if (text.trim().length > 0) {
                texts.push(text);
            }
        }
        return texts;
    }
}