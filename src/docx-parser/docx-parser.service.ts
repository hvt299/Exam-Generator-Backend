import { Injectable, BadRequestException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import archiver from 'archiver';
import ExcelJS from 'exceljs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export enum LineType {
    TAG = 'TAG',
    SECTION_HEADER = 'SECTION_HEADER',
    QUESTION = 'QUESTION',
    ANSWER_MCQ = 'ANSWER_MCQ',
    ANSWER_TF = 'ANSWER_TF',
    ANSWER_ESSAY = 'ANSWER_ESSAY',
    TABLE = 'TABLE',
    END_OF_EXAM = 'END_OF_EXAM',
    TEXT = 'TEXT',
}

const REGEX_RULES = {
    TAG: /^\s*<g([0-3])(?:#([1-4]))?>\s*/i,
    SECTION_HEADER: /^\s*(phần|part)\s*(I{1,3}|IV|V|[1-4])\b/i,
    QUESTION: /^\s*(câu|question|bài)\s*\d+(\s*[:\.])?(\s*\([^)]+\))?\s*[:\.]/i,
    ANSWER_MCQ: /^\s*#?[A-D]\./,
    ANSWER_TF: /^\s*#?[a-d]\)/,
    ANSWER_ESSAY: /^\s*#?([1-9]\d*|[a-d])[\.\)]\s+/i,
    END_OF_EXAM: /^\s*(-+|—+)?\s*(hết|the\s*end)\s*(-+|—+)?\s*$/i,
    FOOTER_NOTE: /^\s*(\([^\)]*thí\s*sinh\s*không\s*được\s*sử\s*dụng[^\)]*\)|cán\s*bộ\s*coi\s*thi|thí\s*sinh\s*không\s*được\s*sử\s*dụng\s*tài\s*liệu|chữ\s*ký\s*của\s*giám\s*thị|chữ\s*ký\s*giám\s*thị|họ\s*và\s*tên\s*thí\s*sinh)/i,
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
    originalIndex: number;
    isCorrect: boolean;
}

export interface Question {
    questionText: string;
    questionNodes: any[];
    answers: Answer[];
    group: string;
    part: number; // 1: MCQ, 2: TF, 3: Short answer, 4: Essay
    assignedNumber?: number;
    headerNodes?: any[];
    sectionHeaderNodes?: any[];
}

export interface ErrorDetail {
    file: string;
    location: string;
    type: string;
    message: string;
    suggestion: string;
}

export interface HeaderInfo {
    useHeader: boolean;
    useFooter: boolean;
    department: string;
    school: string;
    examName: string;
    schoolYear: string;
    subject: string;
    duration: string;
}

export interface FormatConfig {
    numberingMode?: 'continuous' | 'per_part';
    startQuestion?: number;
    p1StartQuestion?: number;
    p2StartQuestion?: number;
    p3StartQuestion?: number;
    p4StartQuestion?: number;
    selectedParts?: number[];
    questionPrefixFormat?: 'dot' | 'colon' | 'keep';
    p1QuestionFormat?: 'dot' | 'colon' | 'keep';
    p2QuestionFormat?: 'dot' | 'colon' | 'keep';
    p3QuestionFormat?: 'dot' | 'colon' | 'keep';
    p4QuestionFormat?: 'dot' | 'colon' | 'keep';
    answerLabelFormat?: 'bold_all' | 'bold_char' | 'regular';
    zipFileName?: string;
    examFilePrefix?: string;
    excelFileName?: string;
}

export interface SequentialBlock {
    tag: string;
    gRule: number;
    part: number;
    questions: Question[];
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

            return docXmlEntry.getData().toString('utf8');
        } catch (error: any) {
            throw new BadRequestException(`Lỗi khi đọc file DOCX: ${error.message}`);
        }
    }

    parseXmlToDom(xmlString: string) {
        try {
            const parser = new DOMParser();
            const docDom = parser.parseFromString(xmlString, 'text/xml');
            const body = docDom.getElementsByTagName('w:body')[0];
            const validElements: Element[] = [];

            if (body) {
                for (let i = 0; i < body.childNodes.length; i++) {
                    const child = body.childNodes.item(i);
                    if (!child || child.nodeType !== 1) continue;
                    if (child.nodeName === 'w:p' || child.nodeName === 'w:tbl') {
                        validElements.push(child as Element);
                    } else if (child.nodeName === 'w:sdt') {
                        const innerP = (child as Element).getElementsByTagName('w:p');
                        for (let j = 0; j < innerP.length; j++) {
                            validElements.push(innerP.item(j)!);
                        }
                    }
                }
            } else {
                const allParagraphs = docDom.getElementsByTagName('w:p');
                for (let i = 0; i < allParagraphs.length; i++) {
                    const p = allParagraphs.item(i);
                    if (!p) continue;
                    let isNested = false;
                    let parent = p.parentNode;
                    while (parent) {
                        if (parent.nodeName === 'w:txbxContent' || parent.nodeName === 'v:textbox') {
                            isNested = true; break;
                        }
                        parent = parent.parentNode;
                    }
                    if (!isNested) validElements.push(p);
                }
            }

            (validElements as any).item = function (i: number) { return this[i]; };

            return {
                docDom,
                paragraphs: validElements,
                paragraphCount: validElements.length
            };
        } catch (error: any) {
            throw new BadRequestException(`Lỗi khi parse XML sang DOM: ${error.message}`);
        }
    }

    extractTextFromParagraph(pNode: any): string {
        let text = '';
        if (!pNode || !pNode.getElementsByTagName) return text;
        const textNodes = pNode.getElementsByTagName('w:t');

        for (let i = 0; i < textNodes.length; i++) {
            const tNode = textNodes.item ? textNodes.item(i) : textNodes[i];
            if (tNode && tNode.textContent) {
                text += tNode.textContent;
            }
        }
        return text;
    }

    getAllParagraphTexts(paragraphs: any): string[] {
        const texts: string[] = [];
        for (let i = 0; i < paragraphs.length; i++) {
            const pNode = paragraphs.item ? paragraphs.item(i) : paragraphs[i];
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
            const pNode = paragraphs.item ? paragraphs.item(i) : paragraphs[i];
            if (!pNode) continue;

            if (pNode.nodeName === 'w:tbl') {
                classifiedLines.push({
                    type: LineType.TABLE,
                    text: '[Bảng biểu]',
                    node: pNode,
                });
                continue;
            }

            const text = this.extractTextFromParagraph(pNode);
            const trimmedText = text.trim();

            let type = LineType.TEXT;

            if (trimmedText.length > 0) {
                if (REGEX_RULES.TAG.test(text)) {
                    type = LineType.TAG;
                } else if (REGEX_RULES.END_OF_EXAM.test(text) || REGEX_RULES.FOOTER_NOTE.test(text)) {
                    type = LineType.END_OF_EXAM;
                } else if (REGEX_RULES.SECTION_HEADER.test(text)) {
                    type = LineType.SECTION_HEADER;
                } else if (REGEX_RULES.QUESTION.test(text)) {
                    type = LineType.QUESTION;
                } else if (REGEX_RULES.ANSWER_MCQ.test(text)) {
                    type = LineType.ANSWER_MCQ;
                } else if (REGEX_RULES.ANSWER_TF.test(text)) {
                    type = LineType.ANSWER_TF;
                } else if (REGEX_RULES.ANSWER_ESSAY.test(text)) {
                    type = LineType.ANSWER_ESSAY;
                }
            }

            classifiedLines.push({
                type,
                text: text,
                node: pNode,
            });
        }

        return classifiedLines;
    }

    private detectDocumentErrors(docDom: any, classifiedLines: ClassifiedLine[], fileName: string): ErrorDetail[] {
        const errors: ErrorDetail[] = [];

        // Lỗi 1: Kiểm tra Table chứa đáp án
        const tables = docDom.getElementsByTagName('w:tbl');
        for (let t = 0; t < tables.length; t++) {
            const tbl = tables.item ? tables.item(t) : tables[t];
            const tblText = tbl.textContent || '';
            const hasAnswers = /(^|[\s\t])#?[A-D]\./.test(tblText) || /(^|[\s\t])#?[a-d]\)/.test(tblText);

            if (hasAnswers) {
                errors.push({
                    file: fileName,
                    location: 'Bảng (Table) chứa đáp án',
                    type: 'TABLE_DETECTED',
                    message: 'Phát hiện các đáp án được đặt bên trong Bảng (Table).',
                    suggestion: 'Hãy copy các đáp án ra ngoài Bảng như gõ văn bản bình thường. Hệ thống sẽ tự động canh chuẩn đẹp.'
                });
                break;
            }
        }

        // Lỗi 6: Kiểm tra Numbering tự động của MS Word
        const paragraphs = docDom.getElementsByTagName('w:p');
        for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs.item ? paragraphs.item(i) : paragraphs[i];
            const numPr = p.getElementsByTagName('w:numPr')[0];
            if (numPr) {
                const text = this.extractTextFromParagraph(p).trim();
                if (/(câu|question)\s*\d+/i.test(text) || /^[A-Da-d][\.\)]/.test(text)) {
                    errors.push({
                        file: fileName,
                        location: text.substring(0, 35) + '...',
                        type: 'NUMBERING_DETECTED',
                        message: 'Phát hiện câu hỏi hoặc đáp án đang sử dụng tính năng Numbering (đánh số tự động) của MS Word.',
                        suggestion: 'Hãy bôi đen toàn bộ đề thi, tắt tính năng Numbering trên Word (chọn None) và gõ tay lại chữ cái Câu 1., A., B., C., D.'
                    });
                    break;
                }
            }
        }

        // Lỗi 8: Kiểm tra Hình ảnh trôi nổi (Floating Image - wp:anchor)
        const anchors = docDom.getElementsByTagName('wp:anchor');
        if (anchors.length > 0) {
            errors.push({
                file: fileName,
                location: 'Hình ảnh trong tài liệu',
                type: 'FLOATING_IMAGE',
                message: `Phát hiện có ${anchors.length} hình ảnh ở chế độ trôi nổi (Floating / Behind / In front of text).`,
                suggestion: 'Chọn hình ảnh -> Format Picture -> Position -> Chọn "In Line with Text" để hình không bị nhảy lệch sau khi trộn.'
            });
        }

        // Kiểm tra Lỗi 2, 3, 4, 5 trên từng dòng
        for (let i = 0; i < classifiedLines.length; i++) {
            const line = classifiedLines[i];
            const trimmed = line.text.trim();
            if (!trimmed) continue;

            // Lỗi 2: Gõ sai / thiếu từ khóa câu hỏi (ví dụ "Câu 1" thiếu dấu . hoặc :)
            const invalidQuestionMatch = trimmed.match(/^\s*(câu|question|bài)\s*\d+\s+([^\.:\s\(\)])/i);
            if (invalidQuestionMatch && !REGEX_RULES.QUESTION.test(trimmed)) {
                errors.push({
                    file: fileName,
                    location: trimmed.substring(0, 35) + '...',
                    type: 'INVALID_QUESTION_KEYWORD',
                    message: 'Câu hỏi thiếu dấu chấm (.) hoặc hai chấm (:) liền sau số thứ tự câu.',
                    suggestion: 'Hãy gõ thêm dấu chấm (.) hoặc hai chấm (:) liền sau số câu (ví dụ: Câu 1. hoặc Câu 1:). Xóa cụm ký tự phân loại như (NB) nếu có.'
                });
            }

            // Lỗi 3: Gõ sai từ khóa đáp án (ví dụ "A Hà Nội" thiếu dấu chấm, hoặc "A . Hà Nội" có khoảng cách)
            if (/^\s*#?[A-D]\s+[^\.\)]/i.test(trimmed) && !REGEX_RULES.ANSWER_MCQ.test(trimmed) && !REGEX_RULES.ANSWER_TF.test(trimmed)) {
                errors.push({
                    file: fileName,
                    location: trimmed.substring(0, 35) + '...',
                    type: 'INVALID_ANSWER_KEYWORD',
                    message: 'Từ khóa đáp án bị thiếu dấu chấm (.) liền sau chữ cái.',
                    suggestion: 'Hãy gõ thêm dấu chấm (.) liền sau chữ cái đáp án (ví dụ: A. B. C. D. hoặc a) b) c) d)).'
                });
            }
            if (/^\s*#?[A-Da-d]\s+\./i.test(trimmed)) {
                errors.push({
                    file: fileName,
                    location: trimmed.substring(0, 35) + '...',
                    type: 'INVALID_ANSWER_KEYWORD',
                    message: 'Từ khóa đáp án có khoảng cách thừa giữa chữ cái và dấu chấm.',
                    suggestion: 'Hãy xóa khoảng cách thừa giữa chữ cái và dấu chấm (ví dụ: A. thay vì A .).'
                });
            }

            // Lỗi 4: Không xuống dòng giữa câu hỏi và đáp án A.
            if (line.type === LineType.QUESTION && /[\s\t]+#?[A-D]\./.test(trimmed)) {
                errors.push({
                    file: fileName,
                    location: trimmed.substring(0, 35) + '...',
                    type: 'QUESTION_ANSWER_SAME_LINE',
                    message: 'Không xuống dòng giữa phần câu hỏi và đáp án.',
                    suggestion: 'Hãy đặt con trỏ chuột trước chữ cái A. và nhấn phím ENTER để ngắt đáp án xuống dòng mới.'
                });
            }

            // Lỗi 5: Không xuống dòng giữa đáp án và câu hỏi tiếp theo (Dính câu)
            if ((line.type === LineType.ANSWER_MCQ || line.type === LineType.ANSWER_TF) && /[\s\t]+(câu|question|bài)\s*\d+\s*[:\.]/i.test(trimmed)) {
                errors.push({
                    file: fileName,
                    location: trimmed.substring(0, 35) + '...',
                    type: 'STICKY_QUESTION',
                    message: 'Câu hỏi tiếp theo bị dính liền vào dòng đáp án của câu trước đó.',
                    suggestion: 'Hãy đưa con trỏ chuột về cuối đáp án (ví dụ sau đáp án D) và nhấn phím ENTER để ngắt câu hỏi tiếp theo xuống dòng mới.'
                });
            }
        }

        return errors;
    }

    private getCorrectAnswerIndices(pNode: any, answerParts: string[]): number[] {
        const correctIndices: number[] = [];
        const rNodes = pNode.getElementsByTagName('w:r');

        let currentText = '';
        const correctCharIndices = new Set<number>();

        for (let i = 0; i < rNodes.length; i++) {
            const rNode = rNodes.item ? rNodes.item(i) : rNodes[i];
            const rPr = rNode.getElementsByTagName ? rNode.getElementsByTagName('w:rPr')[0] : null;
            let isFormattedAsCorrect = false;

            if (rPr) {
                const xmlStr = new XMLSerializer().serializeToString(rPr).toLowerCase();
                const hasCorrectColor = /w:val="(ff0000|c00000|ee0000|red|00b050|green|008000|blue|0070c0|0000ff)"/i.test(xmlStr);
                const isUnderlined = xmlStr.includes('<w:u ');

                if (hasCorrectColor || isUnderlined) {
                    isFormattedAsCorrect = true;
                }
            }

            const tNodes = rNode.getElementsByTagName ? rNode.getElementsByTagName('w:t') : [];
            for (let j = 0; j < tNodes.length; j++) {
                const text = (tNodes.item ? tNodes.item(j) : tNodes[j])?.textContent || '';
                if (isFormattedAsCorrect) {
                    for (let k = 0; k < text.length; k++) {
                        if (text[k].trim().length > 0) {
                            correctCharIndices.add(currentText.length + k);
                        }
                    }
                }
                currentText += text;
            }
        }

        let searchStartIndex = 0;
        for (let i = 0; i < answerParts.length; i++) {
            const part = answerParts[i];
            const partIndex = currentText.indexOf(part, searchStartIndex);

            if (partIndex !== -1) {
                const partEnd = partIndex + part.length;
                let isPartCorrect = false;

                for (let c = partIndex; c < partEnd; c++) {
                    if (correctCharIndices.has(c)) {
                        isPartCorrect = true;
                        break;
                    }
                }

                if (isPartCorrect) {
                    correctIndices.push(i);
                }
                searchStartIndex = partEnd;
            }
        }

        return correctIndices;
    }

    splitAnswerParts(lineText: string, isTF: boolean): string[] {
        const trimmed = lineText.trim();
        if (!trimmed) return [];

        const mcqOrder = ['A', 'B', 'C', 'D'];
        const tfOrder = ['a', 'b', 'c', 'd'];
        const order = isTF ? tfOrder : mcqOrder;

        const startRegex = isTF ? /^\s*#?([a-d])\)/i : /^\s*#?([A-D])\./;
        const startMatch = lineText.match(startRegex);
        if (!startMatch) return [lineText];

        const firstChar = isTF ? startMatch[1].toLowerCase() : startMatch[1].toUpperCase();
        const firstCharIdx = order.indexOf(firstChar);
        if (firstCharIdx === -1 || firstCharIdx === order.length - 1) return [lineText];

        const splitIndices: number[] = [0];
        let searchFrom = startMatch[0].length;
        let nextCharIdx = firstCharIdx + 1;

        while (nextCharIdx < order.length) {
            const nextChar = order[nextCharIdx];
            const delimiter = isTF ? '\\)' : '\\.';
            const answerRegex = new RegExp(`(?:[\\t\\s\\u00A0]+|(?<=[^a-zA-Z0-9\\-_#°]))(#?${nextChar}${delimiter})`, isTF ? 'i' : '');

            const subStr = lineText.substring(searchFrom);
            const match = subStr.match(answerRegex);
            if (match && match.index !== undefined) {
                const leadingWsLen = match[0].indexOf(match[1]);
                const actualAnswerStart = searchFrom + match.index + (leadingWsLen !== -1 ? leadingWsLen : 0);
                splitIndices.push(actualAnswerStart);
                searchFrom = actualAnswerStart + match[1].length;
                nextCharIdx++;
            } else {
                nextCharIdx++;
            }
        }

        if (splitIndices.length === 1) return [lineText];

        const parts: string[] = [];
        for (let i = 0; i < splitIndices.length; i++) {
            const start = splitIndices[i];
            const end = i + 1 < splitIndices.length ? splitIndices[i + 1] : lineText.length;
            const part = lineText.substring(start, end).trim();
            if (part.length > 0) parts.push(part);
        }
        return parts;
    }

    buildQuestionBlocks(classifiedLines: ClassifiedLine[], docDom: any, fileName: string = 'Đề gốc', selectedParts?: number[]): { questions: Question[], errors: ErrorDetail[], sectionHeadersByPart: Map<number, any[]> } {
        const questions: Question[] = [];
        const errors: ErrorDetail[] = [];
        const sectionHeadersByPart = new Map<number, any[]>();

        // Phát hiện các lỗi định dạng theo 8 quy chuẩn
        const formatErrors = this.detectDocumentErrors(docDom, classifiedLines, fileName);
        if (formatErrors.length > 0) {
            errors.push(...formatErrors);
        }

        let currentGroup = '<g3#1>';
        let currentPart = 1;
        let currentQuestion: Question | null = null;
        let pendingHeaderNodes: any[] = [];

        for (let i = 0; i < classifiedLines.length; i++) {
            const line = classifiedLines[i];

            if (line.type === LineType.END_OF_EXAM) {
                if (currentQuestion) {
                    this.validateQuestion(currentQuestion, errors, fileName);
                    questions.push(currentQuestion);
                    currentQuestion = null;
                }
                break;
            }
            else if (line.type === LineType.SECTION_HEADER) {
                if (currentQuestion) {
                    this.validateQuestion(currentQuestion, errors, fileName);
                    questions.push(currentQuestion);
                    currentQuestion = null;
                }

                const sectionMatch = line.text.match(/(?:phần|part)\s*(I{1,3}|IV|V|[1-4])\b/i);
                if (sectionMatch && sectionMatch[1]) {
                    const rawPart = sectionMatch[1].toUpperCase();
                    let detectedPart = 1;
                    if (rawPart === 'I' || rawPart === '1') detectedPart = 1;
                    else if (rawPart === 'II' || rawPart === '2') detectedPart = 2;
                    else if (rawPart === 'III' || rawPart === '3') detectedPart = 3;
                    else if (rawPart === 'IV' || rawPart === '4') detectedPart = 4;

                    currentPart = detectedPart;
                    currentGroup = detectedPart === 4 ? `<g0#4>` : `<g3#${detectedPart}>`;
                }

                if (!sectionHeadersByPart.has(currentPart)) {
                    sectionHeadersByPart.set(currentPart, []);
                }
                sectionHeadersByPart.get(currentPart)!.push(line.node);
            }
            else if (line.type === LineType.TABLE) {
                const tblText = line.node.textContent || '';
                const hasAnswers = /(^|[\s\t])#?[A-D]\./.test(tblText) || /(^|[\s\t])#?[a-d]\)/.test(tblText);
                if (hasAnswers) {
                    errors.push({
                        file: fileName,
                        location: 'Bảng (Table) chứa đáp án',
                        type: 'TABLE_DETECTED',
                        message: 'Phát hiện các đáp án được đặt bên trong Bảng (Table).',
                        suggestion: 'Hãy copy các đáp án ra ngoài Bảng như gõ văn bản bình thường. Hệ thống sẽ tự động canh chuẩn đẹp.'
                    });
                } else {
                    if (currentQuestion) {
                        currentQuestion.questionNodes.push(line.node);
                    } else {
                        pendingHeaderNodes.push(line.node);
                    }
                }
            }
            else if (line.type === LineType.TAG) {
                currentGroup = line.text.trim();
                const match = currentGroup.match(/<g([0-3])(?:#([1-4]))?>/i);
                if (match && match[2]) {
                    currentPart = parseInt(match[2], 10);
                }
            }
            else if (line.type === LineType.QUESTION) {
                if (currentQuestion) {
                    this.validateQuestion(currentQuestion, errors, fileName);
                    questions.push(currentQuestion);
                }
                currentQuestion = {
                    questionText: line.text.trim(),
                    questionNodes: [line.node],
                    answers: [],
                    group: currentGroup,
                    part: currentPart,
                    headerNodes: pendingHeaderNodes.length > 0 ? [...pendingHeaderNodes] : undefined,
                };
                pendingHeaderNodes = [];
            }
            else if (line.type === LineType.ANSWER_MCQ || line.type === LineType.ANSWER_TF) {
                if (!currentQuestion) {
                    errors.push({ file: fileName, location: line.text.substring(0, 30), type: 'ORPHAN_ANSWER', message: 'Tìm thấy đáp án nhưng không có câu hỏi ở trên.', suggestion: 'Đảm bảo trước các đáp án A. B. C. D. phải có từ khóa "Câu X:" hoặc "Question X:".' });
                    continue;
                }

                // If in Part III:
                if (currentPart === 3 || currentQuestion.part === 3) {
                    currentQuestion.part = 3;
                    const cleanAnswerText = line.text.trim();
                    currentQuestion.answers.push({
                        char: 'A',
                        text: cleanAnswerText,
                        isPinned: cleanAnswerText.startsWith('#'),
                        originalNode: line.node,
                        originalIndex: 0,
                        isCorrect: true,
                    });
                    continue;
                }

                const isTF = line.type === LineType.ANSWER_TF;
                if (isTF && currentQuestion.part === 1) {
                    currentQuestion.part = 2;
                }

                const answerParts = this.splitAnswerParts(line.text, isTF);
                const correctIndices = this.getCorrectAnswerIndices(line.node, answerParts);

                for (let j = 0; j < answerParts.length; j++) {
                    const part = answerParts[j];
                    const trimmed = part.trim();
                    const isPinned = trimmed.startsWith('#');
                    const charMatch = isTF ? trimmed.match(/#?([a-d])\)/) : trimmed.match(/#?([A-D])\./);
                    const char = charMatch ? (isTF ? charMatch[1].toLowerCase() : charMatch[1].toUpperCase()) : '';

                    currentQuestion.answers.push({
                        char, text: trimmed, isPinned,
                        originalNode: line.node,
                        originalIndex: currentQuestion.answers.length,
                        isCorrect: correctIndices.includes(j)
                    });
                }
            }
            else if (line.type === LineType.ANSWER_ESSAY) {
                if (currentQuestion) {
                    currentQuestion.questionText += '\n' + line.text.trim();
                    currentQuestion.questionNodes.push(line.node);
                    if (currentPart === 4 || currentQuestion.part === 4) {
                        currentQuestion.part = 4;
                    }
                } else {
                    pendingHeaderNodes.push(line.node);
                }
            }
            else if (line.type === LineType.TEXT) {
                // If in Part III: check if answer line like "Đáp án: 12"
                if ((currentPart === 3 || currentQuestion?.part === 3) && currentQuestion && currentQuestion.answers.length === 0) {
                    const matchAnswer = line.text.match(/^\s*(đáp\s*án|đáp\s*số|đs|trả\s*lời|kết\s*quả)\s*[:\.]?\s*([^\s]+)/i);
                    if (matchAnswer) {
                        currentQuestion.answers.push({
                            char: 'A',
                            text: `A. ${matchAnswer[2]}`,
                            isPinned: false,
                            originalNode: line.node,
                            originalIndex: 0,
                            isCorrect: true,
                        });
                        continue;
                    }
                }

                if (currentQuestion && currentQuestion.answers.length === 0) {
                    currentQuestion.questionText += '\n' + line.text.trim();
                    currentQuestion.questionNodes.push(line.node);
                } else {
                    // Tiêu đề phần hoặc đề dẫn (passage) đứng trước nhóm câu hỏi tiếp theo
                    if (!currentQuestion && sectionHeadersByPart.has(currentPart) && questions.filter(q => q.part === currentPart).length === 0) {
                        sectionHeadersByPart.get(currentPart)!.push(line.node);
                    } else {
                        pendingHeaderNodes.push(line.node);
                    }
                }
            }
        }

        if (currentQuestion) {
            this.validateQuestion(currentQuestion, errors, fileName);
            questions.push(currentQuestion);
        }

        const activeQuestions = selectedParts && selectedParts.length > 0
            ? questions.filter(q => selectedParts.includes(q.part))
            : questions;

        return { questions: activeQuestions, errors, sectionHeadersByPart };
    }

    private updateLabel(pNode: any, regex: RegExp, newLabel: string) {
        const ts = pNode.getElementsByTagName('w:t');
        let fullText = '';
        for (let i = 0; i < ts.length; i++) fullText += ts.item(i).textContent || '';

        const match = fullText.match(regex);
        if (!match || match.index === undefined) return;

        const matchStart = match.index, matchEnd = matchStart + match[0].length;
        let currentPos = 0;

        let firstIdx = -1;
        let lastIdx = -1;

        for (let i = 0; i < ts.length; i++) {
            const tNode = ts.item(i), text = tNode.textContent || '';
            const nodeStart = currentPos, nodeEnd = currentPos + text.length;

            if (nodeEnd > matchStart && nodeStart < matchEnd) {
                if (firstIdx === -1) firstIdx = i;
                lastIdx = i;
            }
            currentPos = nodeEnd;
        }

        if (firstIdx !== -1) {
            currentPos = 0;
            let beforeMatch = '';
            let afterMatch = '';
            for (let i = 0; i < ts.length; i++) {
                const tNode = ts.item(i);
                const text = tNode.textContent || '';
                const nodeStart = currentPos;
                const nodeEnd = currentPos + text.length;

                if (i === firstIdx) {
                    beforeMatch = nodeStart < matchStart ? text.substring(0, matchStart - nodeStart) : '';
                }
                if (i === lastIdx) {
                    afterMatch = nodeEnd > matchEnd ? text.substring(matchEnd - nodeStart) : '';
                }
                currentPos = nodeEnd;
            }

            for (let i = firstIdx; i <= lastIdx; i++) {
                ts.item(i).textContent = '';
            }

            ts.item(lastIdx).textContent = beforeMatch + newLabel + afterMatch;
        }
    }

    private updateAnswerLabel(pNode: any, regex: RegExp, newLabel: string, labelFormat: 'bold_all' | 'bold_char' | 'regular' = 'bold_all', docDom: any) {
        const ts = pNode.getElementsByTagName('w:t');
        let fullText = '';
        for (let i = 0; i < ts.length; i++) fullText += (ts.item ? ts.item(i) : ts[i]).textContent || '';

        const match = fullText.match(regex);
        if (!match || match.index === undefined) return;

        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        // Cut old label from matching runs
        let currentPos = 0;
        let insertBeforeNode: any = null;
        let fontRefRPr: any = null;

        const rNodes = pNode.getElementsByTagName('w:r');
        const runsArray: any[] = [];
        for (let i = 0; i < rNodes.length; i++) runsArray.push(rNodes.item ? rNodes.item(i) : rNodes[i]);

        for (let rIdx = 0; rIdx < runsArray.length; rIdx++) {
            const rNode = runsArray[rIdx];
            const rTextNodes = rNode.getElementsByTagName('w:t');
            for (let tIdx = 0; tIdx < rTextNodes.length; tIdx++) {
                const tNode = rTextNodes.item ? rTextNodes.item(tIdx) : rTextNodes[tIdx];
                const text = tNode.textContent || '';
                const nodeStart = currentPos;
                const nodeEnd = currentPos + text.length;

                if (nodeEnd > matchStart && nodeStart < matchEnd) {
                    if (!insertBeforeNode) {
                        insertBeforeNode = rNode;
                        fontRefRPr = rNode.getElementsByTagName('w:rPr')[0];
                    }
                    const keepBefore = nodeStart < matchStart ? text.substring(0, matchStart - nodeStart) : '';
                    const keepAfter = nodeEnd > matchEnd ? text.substring(matchEnd - nodeStart) : '';
                    tNode.textContent = keepBefore + keepAfter;
                }
                currentPos = nodeEnd;
            }
        }

        // Create new dedicated run(s) for label (A., B., or a))
        let labelRuns: any[] = [];

        if (labelFormat === 'bold_char') {
            const matchLetter = newLabel.match(/^([A-Da-d])([^\w]*)$/);
            const letterPart = matchLetter ? matchLetter[1] : newLabel[0];
            const punctPart = matchLetter ? (matchLetter[2] || '') : newLabel.substring(1);
            const punctWithSpace = punctPart.endsWith(' ') ? punctPart : `${punctPart} `;

            // Letter run (Bold)
            const charRun = docDom.createElement('w:r');
            const charRPr = docDom.createElement('w:rPr');
            if (fontRefRPr) {
                const rFonts = fontRefRPr.getElementsByTagName('w:rFonts')[0];
                if (rFonts) charRPr.appendChild(rFonts.cloneNode(true));
                const sz = fontRefRPr.getElementsByTagName('w:sz')[0];
                if (sz) charRPr.appendChild(sz.cloneNode(true));
            }
            charRPr.appendChild(docDom.createElement('w:b'));
            charRun.appendChild(charRPr);
            const charT = docDom.createElement('w:t');
            charT.setAttribute('xml:space', 'preserve');
            charT.textContent = letterPart;
            charRun.appendChild(charT);

            // Punctuation run (Not bold)
            const punctRun = docDom.createElement('w:r');
            const punctRPr = docDom.createElement('w:rPr');
            if (fontRefRPr) {
                const rFonts = fontRefRPr.getElementsByTagName('w:rFonts')[0];
                if (rFonts) punctRPr.appendChild(rFonts.cloneNode(true));
                const sz = fontRefRPr.getElementsByTagName('w:sz')[0];
                if (sz) punctRPr.appendChild(sz.cloneNode(true));
            }
            const bOff = docDom.createElement('w:b');
            bOff.setAttribute('w:val', '0');
            punctRPr.appendChild(bOff);
            punctRun.appendChild(punctRPr);
            const punctT = docDom.createElement('w:t');
            punctT.setAttribute('xml:space', 'preserve');
            punctT.textContent = punctWithSpace;
            punctRun.appendChild(punctT);

            if (insertBeforeNode) {
                pNode.insertBefore(charRun, insertBeforeNode);
                pNode.insertBefore(punctRun, insertBeforeNode);
            } else {
                pNode.appendChild(charRun);
                pNode.appendChild(punctRun);
            }
            labelRuns = [charRun, punctRun];
        } else {
            const labelRun = docDom.createElement('w:r');
            const labelRPr = docDom.createElement('w:rPr');

            if (fontRefRPr) {
                const rFonts = fontRefRPr.getElementsByTagName('w:rFonts')[0];
                if (rFonts) labelRPr.appendChild(rFonts.cloneNode(true));
                const sz = fontRefRPr.getElementsByTagName('w:sz')[0];
                if (sz) labelRPr.appendChild(sz.cloneNode(true));
            }

            if (labelFormat === 'bold_all') {
                const b = docDom.createElement('w:b');
                labelRPr.appendChild(b);
            } else {
                const bOff = docDom.createElement('w:b');
                bOff.setAttribute('w:val', '0');
                labelRPr.appendChild(bOff);
            }

            labelRun.appendChild(labelRPr);
            const labelT = docDom.createElement('w:t');
            labelT.setAttribute('xml:space', 'preserve');
            labelT.textContent = newLabel.endsWith(' ') ? newLabel : `${newLabel} `;
            labelRun.appendChild(labelT);

            if (insertBeforeNode) {
                pNode.insertBefore(labelRun, insertBeforeNode);
            } else {
                pNode.appendChild(labelRun);
            }
            labelRuns = [labelRun];
        }

        // Strip bold, underlines, colors from all CONTENT runs in pNode so answer content is NEVER bold!
        const allR = pNode.getElementsByTagName('w:r');
        for (let i = 0; i < allR.length; i++) {
            const r = allR.item ? allR.item(i) : allR[i];
            if (labelRuns.includes(r)) continue;

            let rPr = r.getElementsByTagName('w:rPr')[0];
            if (!rPr) {
                rPr = docDom.createElement('w:rPr');
                r.insertBefore(rPr, r.firstChild);
            }

            const bNodes = rPr.getElementsByTagName('w:b');
            for (let b = bNodes.length - 1; b >= 0; b--) {
                rPr.removeChild(bNodes.item ? bNodes.item(b) : bNodes[b]);
            }
            const bOff = docDom.createElement('w:b');
            bOff.setAttribute('w:val', '0');
            rPr.appendChild(bOff);

            const uNodes = rPr.getElementsByTagName('w:u');
            for (let u = uNodes.length - 1; u >= 0; u--) {
                rPr.removeChild(uNodes.item ? uNodes.item(u) : uNodes[u]);
            }
            const cNodes = rPr.getElementsByTagName('w:color');
            for (let c = cNodes.length - 1; c >= 0; c--) {
                rPr.removeChild(cNodes.item ? cNodes.item(c) : cNodes[c]);
            }
        }

        // Neutralize paragraph-level bold in <w:pPr><w:rPr>
        const pPr = pNode.getElementsByTagName('w:pPr')[0];
        if (pPr) {
            const pPrRPr = pPr.getElementsByTagName('w:rPr')[0];
            if (pPrRPr) {
                const pB = pPrRPr.getElementsByTagName('w:b');
                for (let b = pB.length - 1; b >= 0; b--) {
                    pPrRPr.removeChild(pB.item ? pB.item(b) : pB[b]);
                }
                const bOff = docDom.createElement('w:b');
                bOff.setAttribute('w:val', '0');
                pPrRPr.appendChild(bOff);
            }
        }
    }

    private stripBoldFromAllRuns(pNode: any, docDom: any) {
        const allR = pNode.getElementsByTagName('w:r');
        for (let i = 0; i < allR.length; i++) {
            const r = allR.item ? allR.item(i) : allR[i];
            let rPr = r.getElementsByTagName('w:rPr')[0];
            if (!rPr) {
                rPr = docDom.createElement('w:rPr');
                r.insertBefore(rPr, r.firstChild);
            }
            const bNodes = rPr.getElementsByTagName('w:b');
            for (let b = bNodes.length - 1; b >= 0; b--) {
                rPr.removeChild(bNodes.item ? bNodes.item(b) : bNodes[b]);
            }
            const bOff = docDom.createElement('w:b');
            bOff.setAttribute('w:val', '0');
            rPr.appendChild(bOff);
        }
        const pPr = pNode.getElementsByTagName('w:pPr')[0];
        if (pPr) {
            const pPrRPr = pPr.getElementsByTagName('w:rPr')[0];
            if (pPrRPr) {
                const pB = pPrRPr.getElementsByTagName('w:b');
                for (let b = pB.length - 1; b >= 0; b--) {
                    pPrRPr.removeChild(pB.item ? pB.item(b) : pB[b]);
                }
                const bOff = docDom.createElement('w:b');
                bOff.setAttribute('w:val', '0');
                pPrRPr.appendChild(bOff);
            }
        }
    }

    private removeRedColorAndUnderline(pNode: any) {
        const colors = pNode.getElementsByTagName('w:color');
        for (let i = colors.length - 1; i >= 0; i--) {
            const colorNode = colors.item(i);
            if (colorNode.parentNode) colorNode.parentNode.removeChild(colorNode);
        }
        const underlines = pNode.getElementsByTagName('w:u');
        for (let i = underlines.length - 1; i >= 0; i--) {
            const uNode = underlines.item(i);
            if (uNode.parentNode) uNode.parentNode.removeChild(uNode);
        }
    }

    private validateQuestion(q: Question, errors: ErrorDetail[], fileName: string) {
        const qTitle = q.questionText.split('\n')[0].substring(0, 50) + '...';

        // PHẦN IV: TỰ LUẬN
        if (q.part === 4) {
            return;
        }

        // PHẦN III: TRẢ LỜI NGẮN (ĐIỀN SỐ)
        if (q.part === 3 || (q.answers.length === 1 && q.answers[0]?.char?.toUpperCase() === 'A')) {
            q.part = 3;
            if (q.answers.length === 0) {
                errors.push({
                    file: fileName,
                    location: qTitle,
                    type: 'PART3_EMPTY_ANSWER',
                    message: 'Câu hỏi Phần III (trả lời ngắn) chưa có dòng đáp án (ví dụ: A. 12).',
                    suggestion: 'Hãy xuống dòng và nhập đáp án sau ký tự A. (ví dụ: A. 12 hoặc A. -1,5).'
                });
                return;
            }

            const ansContent = q.answers[0]?.text
                ? q.answers[0].text.replace(/^#?[A-Da-d][\.\)]\s*/i, '').replace(/^(đáp\s*án|đáp\s*số|đs|trả\s*lời|kết\s*quả)\s*[:\.]?\s*/i, '').trim()
                : '';

            if (!ansContent) {
                errors.push({
                    file: fileName,
                    location: qTitle,
                    type: 'PART3_EMPTY_ANSWER',
                    message: 'Đáp án Phần III (trả lời ngắn) bị để trống sau ký tự A.',
                    suggestion: 'Nhập nội dung kết quả sau ký tự A. (ví dụ: A. 12 hoặc A. 12,5).'
                });
            } else {
                if (ansContent.length > 4) {
                    errors.push({
                        file: fileName,
                        location: qTitle,
                        type: 'PART3_ANSWER_TOO_LONG',
                        message: `Đáp án trả lời ngắn '${ansContent}' có độ dài ${ansContent.length} ký tự, vượt quá giới hạn 4 ký tự theo quy định Bộ GD&ĐT.`,
                        suggestion: 'Theo quy định Bộ GD&ĐT, nội dung trả lời ngắn là số có độ dài tối đa 4 ký tự (kể cả dấu âm và dấu phẩy thập phân, ví dụ: 12, 12,5, -1,5).'
                    });
                }
                const isNumber = /^-?\d+([.,]\d+)?$/.test(ansContent.replace(/\s+/g, ''));
                if (!isNumber) {
                    errors.push({
                        file: fileName,
                        location: qTitle,
                        type: 'PART3_NOT_NUMBER',
                        message: `Đáp án trả lời ngắn '${ansContent}' không phải là định dạng số.`,
                        suggestion: 'Theo quy định Bộ GD&ĐT, thí sinh tô đáp án vào các ô số trên phiếu trả lời nên kết quả phải là số.'
                    });
                }
            }
            return;
        }

        if (q.answers.length === 0) {
            q.part = 4;
            return;
        }

        const chars = q.answers.map(a => a.char);
        const uniqueChars = new Set(chars);

        if (chars.length !== uniqueChars.size) {
            errors.push({ file: fileName, location: qTitle, type: 'DUPLICATE_CHAR', message: 'Có đáp án bị trùng lặp ký tự.', suggestion: 'Vui lòng kiểm tra lại, có thể bạn đã gõ 2 lần cùng một ký tự (ví dụ 2 chữ A).' });
        }

        // PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI
        const isPart2TF = (q.answers.length > 0 && chars[0] >= 'a' && chars[0] <= 'z') || q.part === 2;
        if (isPart2TF) {
            q.part = 2;
            if (q.answers.length !== 4) {
                errors.push({
                    file: fileName,
                    location: qTitle,
                    type: 'MISSING_ANSWER',
                    message: `Phần II (Đúng/Sai) yêu cầu đủ 4 ý a), b), c), d), nhưng tìm thấy ${q.answers.length} ý.`,
                    suggestion: 'Đảm bảo mỗi câu hỏi Đúng/Sai có đầy đủ 4 ý từ a) đến d).'
                });
            }
            // Cảnh báo nếu không có ý nào được đánh dấu đúng
            if (!q.answers.some(a => a.isCorrect)) {
                errors.push({
                    file: fileName,
                    location: qTitle,
                    type: 'NO_TF_MARKED',
                    message: 'Câu hỏi Đúng / Sai chưa có ý nào được gạch chân hoặc tô màu để xác định là Đúng.',
                    suggestion: 'Hãy gạch chân (Ctrl+U) hoặc đổi màu chữ các ý Đúng (a, b, c, d). Ý nào không gạch chân sẽ tính là Sai.'
                });
            }
            return;
        }

        // PHẦN I: TRẮC NGHIỆM 4 LỰA CHỌN
        q.part = 1;
        if (q.answers.length !== 4) {
            errors.push({
                file: fileName,
                location: qTitle,
                type: 'MISSING_ANSWER',
                message: `Tìm thấy ${q.answers.length} đáp án thay vì 4.`,
                suggestion: 'Tuyệt đối không dùng phím Enter để ngắt dòng bên trong một đáp án. Đảm bảo có đủ 4 đáp án A. B. C. D.'
            });
        }

        if (!q.answers.some(a => a.isCorrect)) {
            errors.push({
                file: fileName,
                location: qTitle,
                type: 'NO_CORRECT_ANSWER',
                message: 'Chưa đánh dấu đáp án đúng cho câu hỏi này.',
                suggestion: 'Bôi đen đáp án đúng và đổi màu chữ thành Đỏ/Xanh, hoặc nhấn Ctrl+U để gạch chân trong file Word.'
            });
        }
    }

    getQuestionPrefix(part: number, qIdx: number, formatConfig?: FormatConfig, origText?: string): string {
        let mode: 'dot' | 'colon' | 'keep' = formatConfig?.questionPrefixFormat || 'dot';
        if (part === 1 && formatConfig?.p1QuestionFormat) mode = formatConfig.p1QuestionFormat;
        if (part === 2 && formatConfig?.p2QuestionFormat) mode = formatConfig.p2QuestionFormat;
        if (part === 3 && formatConfig?.p3QuestionFormat) mode = formatConfig.p3QuestionFormat;
        if (part === 4 && formatConfig?.p4QuestionFormat) mode = formatConfig.p4QuestionFormat;

        if (mode === 'colon') return `Câu ${qIdx}: `;
        if (mode === 'dot') return `Câu ${qIdx}. `;
        if (mode === 'keep' && origText) {
            const match = origText.match(/^\s*(câu|question|bài)\s*\d+(\s*[:\.])?(\s*\([^)]+\))?\s*([:\.])/i);
            const prefixWord = origText.match(/^\s*(câu|question|bài)/i)?.[0].trim() || 'Câu';
            const punct = match ? (match[4] || match[2] || '.') : '.';
            const paren = match && match[3] ? `${match[3]} ` : ' ';
            return `${prefixWord} ${qIdx}${punct}${paren}`;
        }
        return `Câu ${qIdx}. `;
    }

    getQuestionNumber(part: number, indexInPart: number, indexOverall: number, formatConfig?: FormatConfig): number {
        const mode = formatConfig?.numberingMode || 'continuous';
        if (mode === 'per_part') {
            let partStart = 1;
            if (part === 1) partStart = formatConfig?.p1StartQuestion ?? 1;
            else if (part === 2) partStart = formatConfig?.p2StartQuestion ?? 1;
            else if (part === 3) partStart = formatConfig?.p3StartQuestion ?? 1;
            else if (part === 4) partStart = formatConfig?.p4StartQuestion ?? 1;
            return Number(partStart) + indexInPart;
        } else {
            const start = formatConfig?.startQuestion ?? 1;
            return Number(start) + indexOverall;
        }
    }

    getMatrixLabel(part: number, qNum: number, formatConfig?: FormatConfig): string {
        const mode = formatConfig?.numberingMode || 'continuous';
        if (mode === 'per_part') {
            const partRoman = part === 1 ? 'P.I' : part === 2 ? 'P.II' : part === 3 ? 'P.III' : 'P.IV';
            return `${partRoman} - C${qNum}`;
        }
        return `Câu ${qNum}`;
    }

    async previewExams(fileBuffers: Buffer[], numExams: number, startCode: number, startQuestion: number, formatConfig?: FormatConfig) {
        const allErrors: ErrorDetail[] = [];
        const baseDatas: { rawXml: string; questions: Question[]; sectionHeadersByPart: Map<number, any[]> }[] = [];

        for (let fIdx = 0; fIdx < fileBuffers.length; fIdx++) {
            const buffer = fileBuffers[fIdx];
            const rawXml = this.extractDocumentXml(buffer);
            const domResult = this.parseXmlToDom(rawXml);
            const classifiedLines = this.classifyParagraphs(domResult.paragraphs);
            const fileName = `Đề gốc số ${fIdx + 1}`;
            const { questions, errors, sectionHeadersByPart } = this.buildQuestionBlocks(classifiedLines, domResult.docDom, fileName, formatConfig?.selectedParts);

            if (errors.length > 0) {
                allErrors.push(...errors);
            } else {
                baseDatas.push({ rawXml, questions, sectionHeadersByPart });
            }
        }

        if (allErrors.length > 0) {
            return { success: false, errors: allErrors };
        }

        const allKeys: string[][] = [];
        let matrixLabels: string[] = [];
        let previewExamContent: any[] = [];

        for (let i = 0; i < numExams; i++) {
            const baseIdx = i % baseDatas.length;
            const mixedVariant = this.generateExamVariant(baseDatas[baseIdx].questions, formatConfig, baseDatas[baseIdx].sectionHeadersByPart);
            const LETTERS = ['A', 'B', 'C', 'D'];

            if (i === 0) {
                matrixLabels = mixedVariant.map(q => this.getMatrixLabel(q.part, q.assignedNumber ?? 1, formatConfig));
            }

            const variantKeys = mixedVariant.map(q => {
                if (q.part === 4 || q.answers.length === 0) {
                    return 'TL'; // Tự luận
                }
                if (q.part === 3 || (q.answers.length === 1 && q.answers[0].char.toUpperCase() === 'A')) {
                    return q.answers[0].text.replace(/^#?[A-Da-d][\.\)]\s*/i, '').replace(/^(đáp\s*án|đáp\s*số|đs|trả\s*lời|kết\s*quả)\s*[:\.]?\s*/i, '').trim();
                }
                if (q.part === 2 || (q.answers.length === 4 && q.answers[0].char >= 'a' && q.answers[0].char <= 'z')) {
                    return q.answers.map(a => a.isCorrect ? 'Đ' : 'S').join('');
                }
                const correctIndex = q.answers.findIndex(a => a.isCorrect);
                return correctIndex !== -1 ? LETTERS[correctIndex] : '?';
            });
            allKeys.push(variantKeys);

            if (i === 0) {
                previewExamContent = mixedVariant.map((q, idx) => {
                    const cleanQText = q.questionText.replace(/^(câu|question|bài)\s*\d+(\s*[:\.])?(\s*\([^)]+\))?\s*[:\.]\s*/i, '');
                    const qNum = q.assignedNumber ?? (startQuestion + idx);
                    const qPrefix = this.getQuestionPrefix(q.part, qNum, formatConfig, q.questionText);

                    // PHẦN IV: TỰ LUẬN
                    if (q.part === 4 || q.answers.length === 0) {
                        const lines = cleanQText.split('\n').map(l => l.trim()).filter(Boolean);
                        const subItemRegex = /^\s*#?([1-9]\d*|[a-d])[\.\)]\s+/i;
                        const essaySubItems = lines.filter(l => subItemRegex.test(l));
                        const mainText = lines.filter(l => !subItemRegex.test(l)).join('\n');

                        return {
                            part: 4,
                            questionNumber: qNum,
                            matrixLabel: this.getMatrixLabel(4, qNum, formatConfig),
                            question: `${qPrefix}${mainText || cleanQText}`,
                            answers: essaySubItems.map(item => {
                                const match = item.match(/^\s*#?([1-9]\d*|[a-d])[\.\)]/i);
                                return {
                                    label: match ? match[0].trim() : '',
                                    text: item.replace(/^\s*#?([1-9]\d*|[a-d])[\.\)]\s*/i, ''),
                                    isCorrect: false
                                };
                            }),
                            correctAnswer: 'Tự luận (Chấm theo barem điểm)'
                        };
                    }

                    // PHẦN III: TRẢ LỜI NGẮN (ĐIỀN SỐ)
                    if (q.part === 3 || (q.answers.length === 1 && q.answers[0].char.toUpperCase() === 'A')) {
                        const ans = q.answers[0].text.replace(/^#?[A-Da-d][\.\)]\s*/i, '').replace(/^(đáp\s*án|đáp\s*số|đs|trả\s*lời|kết\s*quả)\s*[:\.]?\s*/i, '').trim();
                        return {
                            part: 3,
                            questionNumber: qNum,
                            matrixLabel: this.getMatrixLabel(3, qNum, formatConfig),
                            question: `${qPrefix}${cleanQText}`,
                            answers: [],
                            correctAnswer: ans
                        };
                    }

                    // PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI
                    const firstChar = q.answers?.[0]?.char;
                    const isTF = q.part === 2 || (typeof firstChar === 'string' && firstChar >= 'a' && firstChar <= 'z');
                    if (isTF) {
                        const labels = ['a', 'b', 'c', 'd'];
                        return {
                            part: 2,
                            questionNumber: qNum,
                            matrixLabel: this.getMatrixLabel(2, qNum, formatConfig),
                            question: `${qPrefix}${cleanQText}`,
                            answers: q.answers.map((a, aIdx) => ({
                                label: `${labels[aIdx]})`,
                                text: a.text.replace(/^#?[A-Da-d][\.\)]\s*/i, ''),
                                isCorrect: a.isCorrect
                            })),
                            correctAnswer: q.answers.map((a, aIdx) => `${labels[aIdx]}: ${a.isCorrect ? 'Đúng' : 'Sai'}`).join(' | '),
                            tfString: q.answers.map(a => a.isCorrect ? 'Đ' : 'S').join('')
                        };
                    }

                    // PHẦN I: TRẮC NGHIỆM 4 LỰA CHỌN
                    const correctIdx = q.answers.findIndex(a => a.isCorrect);
                    return {
                        part: 1,
                        questionNumber: qNum,
                        matrixLabel: this.getMatrixLabel(1, qNum, formatConfig),
                        question: `${qPrefix}${cleanQText}`,
                        answers: q.answers.map((a, aIdx) => ({
                            label: `${LETTERS[aIdx]}.`,
                            text: a.text.replace(/^#?[A-Da-d][\.\)]\s*/i, ''),
                            isCorrect: a.isCorrect
                        })),
                        correctAnswer: correctIdx !== -1 ? LETTERS[correctIdx] : '?'
                    };
                });
            }
        }

        // CHẶN BƯỚC 3 NẾU CÓ BẤT KỲ ĐÁP ÁN NÀO BỊ '?'
        const hasUnresolvedAnswer = allKeys.some(variant => variant.some(ans => ans === '?'));
        if (hasUnresolvedAnswer) {
            allErrors.push({
                file: 'Kiểm tra ma trận đáp án',
                location: 'Ma trận đáp án',
                type: 'UNRESOLVED_ANSWER',
                message: 'Phát hiện câu hỏi chưa xác định được đáp án đúng (hiển thị ký tự ? trong ma trận).',
                suggestion: 'Vui lòng kiểm tra lại file Word, gạch chân (Ctrl+U) hoặc đổi màu chữ đỏ/xanh cho phương án đúng của tất cả các câu hỏi.'
            });
            return { success: false, errors: allErrors };
        }

        return { success: true, matrix: allKeys, matrixLabels, previewExam: previewExamContent };
    }

    private shuffleArray<T>(array: T[]): T[] {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    private shuffleAnswersWithPins(answers: Answer[]): Answer[] {
        const unpinnedAnswers = answers.filter(a => !a.isPinned);
        const shuffledUnpinned = this.shuffleArray(unpinnedAnswers);
        const result: Answer[] = [];
        let unpinnedIndex = 0;

        for (let i = 0; i < answers.length; i++) {
            if (answers[i].isPinned) {
                result.push(answers[i]);
            } else {
                result.push(shuffledUnpinned[unpinnedIndex++]);
            }
        }
        return result;
    }

    generateExamVariant(questions: Question[], formatConfig?: FormatConfig, sectionHeadersByPart?: Map<number, any[]>): Question[] {
        const activeParts = formatConfig?.selectedParts && formatConfig.selectedParts.length > 0
            ? formatConfig.selectedParts
            : [1, 2, 3, 4];

        const filteredQuestions = questions.filter(q => activeParts.includes(q.part));

        const blocks: SequentialBlock[] = [];
        let currentBlock: SequentialBlock | null = null;

        for (const q of filteredQuestions) {
            const match = q.group.match(/<g([0-3])(?:#([1-4]))?>/i);
            const gRule = match ? parseInt(match[1], 10) : 3;
            const part = match && match[2] ? parseInt(match[2], 10) : q.part;

            if (!currentBlock || currentBlock.tag !== q.group || currentBlock.part !== part) {
                currentBlock = {
                    tag: q.group,
                    gRule,
                    part,
                    questions: []
                };
                blocks.push(currentBlock);
            }
            currentBlock.questions.push(q);
        }

        // BẢO ĐẢM TRÌNH TỰ CÁC PHẦN: PHẦN I -> PHẦN II -> PHẦN III -> PHẦN IV
        const part1Blocks = blocks.filter(b => b.part === 1);
        const part2Blocks = blocks.filter(b => b.part === 2);
        const part3Blocks = blocks.filter(b => b.part === 3);
        const part4Blocks = blocks.filter(b => b.part === 4);

        const orderedBlocks = [...part1Blocks, ...part2Blocks, ...part3Blocks, ...part4Blocks];
        const mixedExam: Question[] = [];

        for (const block of orderedBlocks) {
            let blockQs = [...block.questions];

            if (block.gRule === 1 || block.gRule === 3) {
                blockQs = this.shuffleArray(blockQs);
            }

            for (const q of blockQs) {
                const clonedQuestion: Question = { ...q, answers: [...q.answers] };

                if ((block.part === 1 || block.part === 2) && (block.gRule === 2 || block.gRule === 3)) {
                    clonedQuestion.answers = this.shuffleAnswersWithPins(clonedQuestion.answers);
                }

                mixedExam.push(clonedQuestion);
            }
        }

        // Gán số thứ tự câu hỏi và gắn tiêu đề phần vào câu đầu tiên của từng phần sau khi hoán vị
        const partCounters: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
        const partsWithSectionHeader = new Set<number>();

        for (let idx = 0; idx < mixedExam.length; idx++) {
            const q = mixedExam[idx];
            const indexInPart = partCounters[q.part] || 0;
            partCounters[q.part] = indexInPart + 1;

            q.assignedNumber = this.getQuestionNumber(q.part, indexInPart, idx, formatConfig);

            if (sectionHeadersByPart && !partsWithSectionHeader.has(q.part)) {
                partsWithSectionHeader.add(q.part);
                const headers = sectionHeadersByPart.get(q.part);
                if (headers && headers.length > 0) {
                    q.sectionHeaderNodes = [...headers];
                }
            }
        }

        return mixedExam;
    }

    private mergeMultipleAnswers(docDom: any, answers: Answer[], startIndex: number, count: number, tabPositions: number[], labelFormat: 'bold_all' | 'bold_char' | 'regular' = 'bold_all') {
        const LETTERS = ['A', 'B', 'C', 'D'];

        const baseNode = answers[startIndex].originalNode.cloneNode(true);
        let a = answers[startIndex];
        let isTF = a.char >= 'a' && a.char <= 'z';
        let newLabel = isTF ? `${['a', 'b', 'c', 'd'][startIndex]})` : `${LETTERS[startIndex]}.`;
        this.updateAnswerLabel(baseNode, /^\s*#?[A-Da-d][\.\)]/i, newLabel, labelFormat, docDom);
        this.removeRedColorAndUnderline(baseNode);

        let pPr = baseNode.getElementsByTagName('w:pPr')[0];
        if (!pPr) {
            pPr = docDom.createElement('w:pPr');
            baseNode.insertBefore(pPr, baseNode.firstChild);
        }

        const oldTabsList = pPr.getElementsByTagName('w:tabs');
        for (let i = oldTabsList.length - 1; i >= 0; i--) pPr.removeChild(oldTabsList.item(i));

        if (tabPositions.length > 0) {
            const tabsNode = docDom.createElement('w:tabs');
            for (const pos of tabPositions) {
                const tabNode = docDom.createElement('w:tab');
                tabNode.setAttribute('w:val', 'left');
                tabNode.setAttribute('w:pos', pos.toString());
                tabsNode.appendChild(tabNode);
            }
            pPr.appendChild(tabsNode);
        }

        for (let i = 1; i < count; i++) {
            const currIdx = startIndex + i;
            const currAnswer = answers[currIdx];
            const currNode = currAnswer.originalNode.cloneNode(true);

            isTF = currAnswer.char >= 'a' && currAnswer.char <= 'z';
            newLabel = isTF ? `${['a', 'b', 'c', 'd'][currIdx]})` : `${LETTERS[currIdx]}.`;
            this.updateAnswerLabel(currNode, /^\s*#?[A-Da-d][\.\)]/i, newLabel, labelFormat, docDom);
            this.removeRedColorAndUnderline(currNode);

            const tabRun = docDom.createElement('w:r');
            tabRun.appendChild(docDom.createElement('w:tab'));
            baseNode.appendChild(tabRun);

            const children: any[] = [];
            for (let c = 0; c < currNode.childNodes.length; c++) {
                const child = currNode.childNodes.item(c);
                if (child.nodeName !== 'w:pPr') children.push(child);
            }
            for (const child of children) baseNode.appendChild(child);
        }

        return baseNode;
    }

    buildFinalDocx(fileBuffer: Buffer, docDom: any, classifiedLines: ClassifiedLine[], shuffledQuestions: Question[], startQuestion: number, examCode: number, headerInfo: HeaderInfo, formatConfig?: FormatConfig): Buffer {
        const bodyNode = docDom.getElementsByTagName('w:body')[0];

        const firstContentLine = classifiedLines.find(l => l.type === LineType.SECTION_HEADER || l.type === LineType.TAG || l.type === LineType.QUESTION);
        let insertAnchor = firstContentLine ? firstContentLine.node : bodyNode.getElementsByTagName('w:sectPr')[0];

        if (headerInfo.useHeader) {
            const placeholder = docDom.createElement('w:p');
            const rPlaceholder = docDom.createElement('w:r');
            const tPlaceholder = docDom.createElement('w:t');
            tPlaceholder.textContent = '###HEADER_PLACEHOLDER###';
            rPlaceholder.appendChild(tPlaceholder);
            placeholder.appendChild(rPlaceholder);
            bodyNode.insertBefore(placeholder, insertAnchor);
        } else {
            const maDeP = docDom.createElement('w:p');
            const maDeR = docDom.createElement('w:r');
            const maDeRPr = docDom.createElement('w:rPr');
            const rFonts = docDom.createElement('w:rFonts');
            rFonts.setAttribute('w:ascii', 'Times New Roman');
            rFonts.setAttribute('w:hAnsi', 'Times New Roman');

            const sz = docDom.createElement('w:sz');
            sz.setAttribute('w:val', '26');
            maDeRPr.appendChild(sz);

            maDeRPr.appendChild(rFonts);
            maDeRPr.appendChild(docDom.createElement('w:b'));
            const maDeT = docDom.createElement('w:t');
            maDeT.textContent = `Mã đề: ${examCode}`;
            maDeR.appendChild(maDeRPr);
            maDeR.appendChild(maDeT);
            maDeP.appendChild(maDeR);
            bodyNode.insertBefore(maDeP, insertAnchor);
        }

        const LETTERS = ['A', 'B', 'C', 'D'];
        let questionIndex = startQuestion;
        const labelFormat = formatConfig?.answerLabelFormat || 'bold_all';

        for (const q of shuffledQuestions) {
            // Chèn các tiêu đề phần (PHẦN I, II, III, IV) ngay trước câu đầu tiên của phần đó
            if (q.sectionHeaderNodes && q.sectionHeaderNodes.length > 0) {
                for (const sNode of q.sectionHeaderNodes) {
                    bodyNode.insertBefore(sNode.cloneNode(true), insertAnchor);
                }
            }

            // Chèn các tiêu đề bài đọc hiểu (passage) nếu có
            if (q.headerNodes && q.headerNodes.length > 0) {
                for (const hNode of q.headerNodes) {
                    bodyNode.insertBefore(hNode.cloneNode(true), insertAnchor);
                }
            }

            let replacedQ = false;
            const qNum = q.assignedNumber ?? questionIndex;
            for (const qNode of q.questionNodes) {
                const clonedQNode = qNode.cloneNode(true);
                if (!replacedQ && clonedQNode.nodeName === 'w:p') {
                    const qPrefix = this.getQuestionPrefix(q.part, qNum, formatConfig, q.questionText);
                    this.updateLabel(clonedQNode, /^\s*(câu|question|bài)\s*\d+(\s*[:\.])?(\s*\([^)]+\))?\s*[:\.]/i, qPrefix);
                    replacedQ = true;
                }
                bodyNode.insertBefore(clonedQNode, insertAnchor);
            }

            // Với Phần III (Trả lời ngắn): Ẩn đáp án của giáo viên
            if (q.part === 3 || (q.answers.length === 1 && q.answers[0].char.toUpperCase() === 'A')) {
                questionIndex++;
                continue;
            }

            // Với Phần IV (Tự luận): Không có answers trắc nghiệm
            if (q.part === 4 || q.answers.length === 0) {
                questionIndex++;
                continue;
            }

            const uniqueAnswerNodesArray = Array.from(new Set(q.answers.map(a => a.originalNode)));

            if (uniqueAnswerNodesArray.length === q.answers.length) {
                let layoutCols = 1;

                if (q.answers.length === 4) {
                    const maxLen = Math.max(...q.answers.map(a => a.text.trim().length));
                    if (maxLen <= 15) layoutCols = 4;
                    else if (maxLen <= 40) layoutCols = 2;
                }

                if (layoutCols === 4) {
                    const mergedRow = this.mergeMultipleAnswers(docDom, q.answers, 0, 4, [2250, 4500, 6750], labelFormat);
                    bodyNode.insertBefore(mergedRow, insertAnchor);
                }
                else if (layoutCols === 2) {
                    const row1 = this.mergeMultipleAnswers(docDom, q.answers, 0, 2, [4500], labelFormat);
                    const row2 = this.mergeMultipleAnswers(docDom, q.answers, 2, 2, [4500], labelFormat);
                    bodyNode.insertBefore(row1, insertAnchor);
                    bodyNode.insertBefore(row2, insertAnchor);
                }
                else {
                    for (let i = 0; i < q.answers.length; i++) {
                        const a = q.answers[i];
                        if (a.originalNode) {
                            const clonedANode = a.originalNode.cloneNode(true);
                            const isTF = a.char >= 'a' && a.char <= 'z';
                            const newLabel = isTF ? `${['a', 'b', 'c', 'd'][i]})` : `${LETTERS[i]}.`;
                            this.updateAnswerLabel(clonedANode, /^\s*#?[A-Da-d][\.\)]/i, newLabel, labelFormat, docDom);
                            this.removeRedColorAndUnderline(clonedANode);
                            bodyNode.insertBefore(clonedANode, insertAnchor);
                        }
                    }
                }
            } else {
                const originalOrderAnswers = [...q.answers].sort((a, b) => a.originalIndex - b.originalIndex);
                const originalNodesToInsert = Array.from(new Set(originalOrderAnswers.map(a => a.originalNode)));

                for (const singleNode of originalNodesToInsert) {
                    const clonedNode = singleNode.cloneNode(true);
                    this.removeRedColorAndUnderline(clonedNode);
                    this.stripBoldFromAllRuns(clonedNode, docDom);
                    bodyNode.insertBefore(clonedNode, insertAnchor);
                }
            }
            questionIndex++;
        }

        const nodesToRemove = new Set<any>();
        const startIndex = classifiedLines.findIndex(l => l.type === LineType.SECTION_HEADER || l.type === LineType.TAG || l.type === LineType.QUESTION);
        if (startIndex !== -1) {
            for (let i = startIndex; i < classifiedLines.length; i++) {
                nodesToRemove.add(classifiedLines[i].node);
            }
        }
        nodesToRemove.forEach(node => {
            if (node && node.parentNode) node.parentNode.removeChild(node);
        });

        const serializer = new XMLSerializer();
        let newXmlString = serializer.serializeToString(docDom);
        const safe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        if (headerInfo.useHeader) {
            const headerXml = `
            <w:tbl>
              <w:tblPr>
                <w:tblW w:w="5000" w:type="pct"/>
                <w:tblBorders>
                  <w:top w:val="none" w:sz="0"/><w:left w:val="none" w:sz="0"/><w:bottom w:val="none" w:sz="0"/><w:right w:val="none" w:sz="0"/>
                  <w:insideH w:val="none" w:sz="0"/><w:insideV w:val="none" w:sz="0"/>
                </w:tblBorders>
              </w:tblPr>
              <w:tr>
                <w:tc>
                  <w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr>
                  <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>${safe(headerInfo.department)}</w:t></w:r></w:p>
                  <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:u w:val="single"/><w:sz w:val="24"/></w:rPr><w:t>${safe(headerInfo.school)}</w:t></w:r></w:p>
                  <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="28"/></w:rPr><w:t>ĐỀ CHÍNH THỨC</w:t></w:r></w:p>
                </w:tc>
                <w:tc>
                  <w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr>
                  <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>${safe(headerInfo.examName)}</w:t></w:r></w:p>
                  <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>${safe(headerInfo.schoolYear)}</w:t></w:r></w:p>
                  <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Môn: ${safe(headerInfo.subject)}</w:t></w:r></w:p>
                  <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="24"/></w:rPr><w:t>Thời gian làm bài: ${safe(headerInfo.duration)}</w:t></w:r></w:p>
                </w:tc>
              </w:tr>
            </w:tbl>
            <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="22"/></w:rPr><w:t>(Học sinh làm bài bằng cách chọn và tô kín một ô tròn trên Phiếu trả lời trắc nghiệm tương ứng với phương án trả lời đúng của mỗi câu.)</w:t></w:r></w:p>
            <w:p><w:r><w:t></w:t></w:r></w:p>
            <w:tbl>
              <w:tblPr>
                <w:tblW w:w="5000" w:type="pct"/>
                <w:tblBorders>
                  <w:top w:val="none" w:sz="0"/><w:left w:val="none" w:sz="0"/><w:bottom w:val="none" w:sz="0"/><w:right w:val="none" w:sz="0"/>
                  <w:insideH w:val="none" w:sz="0"/><w:insideV w:val="none" w:sz="0"/>
                </w:tblBorders>
              </w:tblPr>
              <w:tr>
                 <w:tc>
                    <w:tcPr><w:tcW w:w="3800" w:type="pct"/></w:tcPr>
                    <w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/></w:rPr><w:t>Họ và tên thí sinh: ..................................................... Lớp: .....................</w:t></w:r></w:p>
                    <w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/></w:rPr><w:t>Số báo danh: ................................. Phòng số: .............. Trường: .....................</w:t></w:r></w:p>
                 </w:tc>
                 <w:tc>
                    <w:tcPr><w:tcW w:w="1200" w:type="pct"/></w:tcPr>
                    <w:p>
                       <w:pPr>
                          <w:pBdr>
                             <w:top w:val="single" w:sz="6" w:space="1" w:color="auto"/><w:left w:val="single" w:sz="6" w:space="1" w:color="auto"/>
                             <w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/><w:right w:val="single" w:sz="6" w:space="1" w:color="auto"/>
                          </w:pBdr>
                          <w:jc w:val="center"/>
                       </w:pPr>
                       <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="28"/></w:rPr><w:t>Mã đề: ${examCode}</w:t></w:r>
                    </w:p>
                 </w:tc>
              </w:tr>
            </w:tbl>
            <w:p><w:r><w:t></w:t></w:r></w:p>
            <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/></w:rPr><w:t>--------------------------------------------------------</w:t></w:r></w:p>
            `;

            newXmlString = newXmlString.replace(/<w:p[^>]*>.*?###HEADER_PLACEHOLDER###.*?<\/w:p>/, headerXml);
        }

        if (headerInfo.useFooter) {
            const footerXml = `
            <w:p><w:r><w:t></w:t></w:r></w:p>
            <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/></w:rPr><w:t>------------- HẾT -------------</w:t></w:r></w:p>
            `;

            const sectPrIdx = newXmlString.lastIndexOf('<w:sectPr');
            if (sectPrIdx !== -1) {
                newXmlString = newXmlString.slice(0, sectPrIdx) + footerXml + newXmlString.slice(sectPrIdx);
            } else {
                const bodyEndIdx = newXmlString.lastIndexOf('</w:body>');
                newXmlString = newXmlString.slice(0, bodyEndIdx) + footerXml + newXmlString.slice(bodyEndIdx);
            }
        }

        const zip = new AdmZip(fileBuffer);
        zip.updateFile('word/document.xml', Buffer.from(newXmlString, 'utf8'));

        return zip.toBuffer();
    }

    async generateMultipleExamsZip(fileBuffers: Buffer[], numExams: number, startCode: number, startQuestion: number, headerInfo: HeaderInfo, archive: archiver.Archiver, formatConfig?: FormatConfig) {
        const baseDatas: { buffer: Buffer; rawXml: string }[] = [];

        for (let fIdx = 0; fIdx < fileBuffers.length; fIdx++) {
            const buffer = fileBuffers[fIdx];
            const rawXml = this.extractDocumentXml(buffer);
            const domResult = this.parseXmlToDom(rawXml);
            const classifiedLines = this.classifyParagraphs(domResult.paragraphs);
            const fileName = `Đề gốc số ${fIdx + 1}`;
            const { errors } = this.buildQuestionBlocks(classifiedLines, domResult.docDom, fileName, formatConfig?.selectedParts);

            if (errors.length > 0) throw new BadRequestException(errors.map(e => `[${e.file}] ${e.location}: ${e.message}`).join('\n'));
            baseDatas.push({ buffer, rawXml });
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Đáp Án');

        const columns = [{ header: 'Câu', key: 'q', width: 14 }];
        for (let i = 0; i < numExams; i++) {
            columns.push({ header: `Mã ${Number(startCode) + i}`, key: `code_${i}`, width: 12 });
        }
        sheet.columns = columns;

        const allKeys: string[][] = [];
        let matrixLabels: string[] = [];
        const examPrefix = formatConfig?.examFilePrefix || 'Ma_de_';
        const rawExcelName = formatConfig?.excelFileName || 'Dap_an_excel.xlsx';
        const excelName = rawExcelName.endsWith('.xlsx') ? rawExcelName : `${rawExcelName}.xlsx`;

        for (let i = 0; i < numExams; i++) {
            const currentCode = Number(startCode) + i;

            const baseIdx = i % baseDatas.length;
            const baseData = baseDatas[baseIdx];

            const domResult = this.parseXmlToDom(baseData.rawXml);
            const classifiedLines = this.classifyParagraphs(domResult.paragraphs);
            const { questions, sectionHeadersByPart } = this.buildQuestionBlocks(classifiedLines, domResult.docDom, undefined, formatConfig?.selectedParts);

            const mixedVariant = this.generateExamVariant(questions, formatConfig, sectionHeadersByPart);

            if (i === 0) {
                matrixLabels = mixedVariant.map(q => this.getMatrixLabel(q.part, q.assignedNumber ?? 1, formatConfig));
            }

            const LETTERS = ['A', 'B', 'C', 'D'];
            const variantKeys = mixedVariant.map(q => {
                if (q.part === 4 || q.answers.length === 0) {
                    return 'TL'; // Tự luận
                }
                if (q.part === 3 || (q.answers.length === 1 && q.answers[0].char.toUpperCase() === 'A')) {
                    return q.answers[0].text.replace(/^#?[A-Da-d][\.\)]\s*/i, '').replace(/^(đáp\s*án|đáp\s*số|đs|trả\s*lời|kết\s*quả)\s*[:\.]?\s*/i, '').trim();
                }
                if (q.part === 2 || (q.answers.length === 4 && q.answers[0].char >= 'a' && q.answers[0].char <= 'z')) {
                    return q.answers.map(a => a.isCorrect ? 'Đ' : 'S').join('');
                }
                const correctIndex = q.answers.findIndex(a => a.isCorrect);
                return correctIndex !== -1 ? LETTERS[correctIndex] : '?';
            });
            allKeys.push(variantKeys);

            const buffer = this.buildFinalDocx(baseData.buffer, domResult.docDom, classifiedLines, mixedVariant, startQuestion, currentCode, headerInfo, formatConfig);
            archive.append(buffer, { name: `${examPrefix}${currentCode}.docx` });
        }

        const numQuestions = allKeys[0]?.length || 0;
        for (let qIdx = 0; qIdx < numQuestions; qIdx++) {
            const rowData: any = { q: matrixLabels[qIdx] || `Câu ${startQuestion + qIdx}` };
            for (let eIdx = 0; eIdx < numExams; eIdx++) {
                rowData[`code_${eIdx}`] = allKeys[eIdx][qIdx];
            }
            sheet.addRow(rowData);
        }

        const excelBuffer = await workbook.xlsx.writeBuffer();
        archive.append(excelBuffer as unknown as Buffer, { name: excelName });
    }
}
