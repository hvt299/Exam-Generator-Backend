import { Injectable, BadRequestException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';

export enum LineType {
    TAG = 'TAG',
    QUESTION = 'QUESTION',
    ANSWER_MCQ = 'ANSWER_MCQ',
    ANSWER_TF = 'ANSWER_TF',
    TEXT = 'TEXT',
}

const REGEX_RULES = {
    TAG: /^\s*<g[0-3](#[1-3])?>\s*/i,
    QUESTION: /^\s*(câu|question)\s*\d+\s*[:\.]/i,
    ANSWER_MCQ: /^\s*#?[A-D]\./i,
    ANSWER_TF: /^\s*#?[a-d]\)/i,
};

export interface ClassifiedLine {
    type: LineType;
    text: string;
    node: any;
}

export interface Answer {
    char: string;
    text: string;
    isPinned: boolean;
    originalNode: any;
}

export interface Question {
    questionText: string;
    questionNodes: any[];
    answers: Answer[];
    group: string;
}

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

    classifyParagraphs(paragraphs: any): ClassifiedLine[] {
        const classifiedLines: ClassifiedLine[] = [];

        for (let i = 0; i < paragraphs.length; i++) {
            const pNode = paragraphs.item(i);
            const text = this.extractTextFromParagraph(pNode);
            const trimmedText = text.trim();

            if (trimmedText.length === 0) continue;

            let type = LineType.TEXT;

            if (REGEX_RULES.TAG.test(text)) {
                type = LineType.TAG;
            } else if (REGEX_RULES.QUESTION.test(text)) {
                type = LineType.QUESTION;
            } else if (REGEX_RULES.ANSWER_MCQ.test(text)) {
                type = LineType.ANSWER_MCQ;
            } else if (REGEX_RULES.ANSWER_TF.test(text)) {
                type = LineType.ANSWER_TF;
            }

            classifiedLines.push({
                type,
                text: text,
                node: pNode,
            });
        }

        return classifiedLines;
    }

    buildQuestionBlocks(classifiedLines: ClassifiedLine[]): Question[] {
        const questions: Question[] = [];
        let currentGroup = '<g3#1>';
        let currentQuestion: Question | null = null;

        for (let i = 0; i < classifiedLines.length; i++) {
            const line = classifiedLines[i];

            if (line.type === LineType.TAG) {
                currentGroup = line.text.trim();
            }
            else if (line.type === LineType.QUESTION) {
                if (currentQuestion) {
                    this.validateQuestion(currentQuestion);
                    questions.push(currentQuestion);
                }
                
                currentQuestion = {
                    questionText: line.text.trim(),
                    questionNodes: [line.node],
                    answers: [],
                    group: currentGroup
                };
            }
            else if (line.type === LineType.ANSWER_MCQ) {
                if (!currentQuestion) {
                    throw new BadRequestException(`Lỗi nghiêm trọng: Tìm thấy đáp án nhưng không thuộc câu hỏi nào.\nNội dung: "${line.text.trim()}"`);
                }

                const answerParts = line.text.split(/(?=\s*#?[A-D]\.)/g).filter(p => p.trim().length > 0);

                for (const part of answerParts) {
                    const trimmed = part.trim();
                    const isPinned = trimmed.startsWith('#');
                    
                    const charMatch = trimmed.match(/#?([A-D])\./);
                    const char = charMatch ? charMatch[1] : '';

                    currentQuestion.answers.push({
                        char,
                        text: trimmed,
                        isPinned,
                        originalNode: line.node
                    });
                }
            }
            else if (line.type === LineType.TEXT) {
                if (currentQuestion && currentQuestion.answers.length === 0) {
                    currentQuestion.questionText += '\n' + line.text.trim();
                    currentQuestion.questionNodes.push(line.node);
                } else if (currentQuestion && currentQuestion.answers.length > 0) {
                }
            }
        }

        if (currentQuestion) {
            this.validateQuestion(currentQuestion);
            questions.push(currentQuestion);
        }

        return questions;
    }

    private validateQuestion(q: Question) {
        if (q.answers.length === 0) {
            return;
        }

        const chars = q.answers.map(a => a.char);
        const uniqueChars = new Set(chars);

        if (chars.length !== uniqueChars.size) {
            throw new BadRequestException(`Lỗi tại "${q.questionText}".\nCó đáp án bị trùng lặp ký tự (ví dụ gõ 2 lần chữ A.).`);
        }

        if (q.answers.length !== 4) {
            throw new BadRequestException(`Lỗi tại "${q.questionText}".\nTìm thấy ${q.answers.length} đáp án thay vì 4. Vui lòng kiểm tra lại định dạng A., B., C., D.`);
        }
    }
}