import { Injectable, BadRequestException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

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
    originalIndex: number;
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

            return docXmlEntry.getData().toString('utf8');
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

            let type = LineType.TEXT;

            if (trimmedText.length > 0) {
                if (REGEX_RULES.TAG.test(text)) {
                    type = LineType.TAG;
                } else if (REGEX_RULES.QUESTION.test(text)) {
                    type = LineType.QUESTION;
                } else if (REGEX_RULES.ANSWER_MCQ.test(text)) {
                    type = LineType.ANSWER_MCQ;
                } else if (REGEX_RULES.ANSWER_TF.test(text)) {
                    type = LineType.ANSWER_TF;
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

    buildQuestionBlocks(classifiedLines: ClassifiedLine[], docDom: any): Question[] {
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
                if (!currentQuestion) throw new BadRequestException(`Lỗi: ${line.text}`);

                const answerParts = line.text.split(/(?=\s*#?[A-D]\.)/g).filter(p => p.trim().length > 0);

                for (let j = 0; j < answerParts.length; j++) {
                    const part = answerParts[j];
                    const trimmed = part.trim();
                    const isPinned = trimmed.startsWith('#');
                    const charMatch = trimmed.match(/#?([A-D])\./);
                    const char = charMatch ? charMatch[1] : '';

                    currentQuestion.answers.push({
                        char, text: trimmed, isPinned,
                        originalNode: line.node,
                        originalIndex: currentQuestion.answers.length
                    });
                }
            }
            else if (line.type === LineType.TEXT) {
                if (currentQuestion && currentQuestion.answers.length === 0) {
                    currentQuestion.questionText += '\n' + line.text.trim();
                    currentQuestion.questionNodes.push(line.node);
                }
            }
        }
        if (currentQuestion) {
            this.validateQuestion(currentQuestion);
            questions.push(currentQuestion);
        }
        return questions;
    }

    private updateLabel(pNode: any, regex: RegExp, newLabel: string) {
        const ts = pNode.getElementsByTagName('w:t');
        let fullText = '';
        for (let i = 0; i < ts.length; i++) fullText += ts.item(i).textContent || '';

        const match = fullText.match(regex);
        if (!match || match.index === undefined) return;

        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;
        let currentPos = 0;
        let replaced = false;

        for (let i = 0; i < ts.length; i++) {
            const tNode = ts.item(i);
            const text = tNode.textContent || '';
            const nodeStart = currentPos;
            const nodeEnd = currentPos + text.length;

            if (nodeEnd <= matchStart || nodeStart >= matchEnd) {
                currentPos = nodeEnd; continue;
            }

            if (!replaced) {
                const beforeMatch = nodeStart < matchStart ? text.substring(0, matchStart - nodeStart) : '';
                const afterMatch = nodeEnd > matchEnd ? text.substring(matchEnd - nodeStart) : '';
                tNode.textContent = beforeMatch + newLabel + afterMatch;
                replaced = true;
            } else {
                const afterMatch = nodeEnd > matchEnd ? text.substring(matchEnd - nodeStart) : '';
                tNode.textContent = afterMatch;
            }
            currentPos = nodeEnd;
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

    private validateQuestion(q: Question) {
        if (q.answers.length === 0) return;
        const chars = q.answers.map(a => a.char);
        const uniqueChars = new Set(chars);

        if (chars.length !== uniqueChars.size) {
            throw new BadRequestException(`Lỗi tại "${q.questionText}".\nCó đáp án bị trùng lặp ký tự (ví dụ gõ 2 lần chữ A.).`);
        }
        if (q.answers.length !== 4) {
            throw new BadRequestException(`Lỗi tại "${q.questionText}".\nTìm thấy ${q.answers.length} đáp án thay vì 4. Vui lòng kiểm tra lại định dạng A., B., C., D.`);
        }
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

    generateExamVariant(questions: Question[]): Question[] {
        const groupedQuestions: Record<string, Question[]> = {};
        const groupOrder: string[] = [];

        for (const q of questions) {
            if (!groupedQuestions[q.group]) {
                groupedQuestions[q.group] = [];
                groupOrder.push(q.group);
            }
            groupedQuestions[q.group].push(q);
        }

        const mixedExam: Question[] = [];

        for (const groupTag of groupOrder) {
            let groupQs = [...groupedQuestions[groupTag]];
            const match = groupTag.match(/<g([0-3])(?:#([1-3]))?>/i);
            const gRule = match ? parseInt(match[1], 10) : 0;

            if (gRule === 1 || gRule === 3) {
                groupQs = this.shuffleArray(groupQs);
            }

            for (const q of groupQs) {
                const clonedQuestion: Question = { ...q, answers: [...q.answers] };
                if (gRule === 2 || gRule === 3) {
                    clonedQuestion.answers = this.shuffleAnswersWithPins(clonedQuestion.answers);
                }
                mixedExam.push(clonedQuestion);
            }
        }

        return mixedExam;
    }

    buildFinalDocx(fileBuffer: Buffer, docDom: any, classifiedLines: ClassifiedLine[], shuffledQuestions: Question[]): Buffer {
        const bodyNode = docDom.getElementsByTagName('w:body')[0];

        const firstContentLine = classifiedLines.find(l => l.type === LineType.TAG || l.type === LineType.QUESTION);
        let insertAnchor = firstContentLine ? firstContentLine.node : bodyNode.getElementsByTagName('w:sectPr')[0];

        const LETTERS = ['A', 'B', 'C', 'D'];
        let questionIndex = 1;

        for (const q of shuffledQuestions) {
            let replacedQ = false;
            for (const qNode of q.questionNodes) {
                const clonedQNode = qNode.cloneNode(true);
                if (!replacedQ) {
                    this.updateLabel(clonedQNode, /^\s*(câu|question)\s*\d+\s*[:\.]/i, `Câu ${questionIndex}: `);
                    replacedQ = true;
                }
                bodyNode.insertBefore(clonedQNode, insertAnchor);
            }

            const uniqueAnswerNodesArray = Array.from(new Set(q.answers.map(a => a.originalNode)));

            if (uniqueAnswerNodesArray.length === q.answers.length) {
                for (let i = 0; i < q.answers.length; i++) {
                    const a = q.answers[i];
                    if (a.originalNode) {
                        const clonedANode = a.originalNode.cloneNode(true);
                        const newLabel = `${LETTERS[i]}.`;
                        this.updateLabel(clonedANode, /^\s*#?[A-D]\./i, newLabel);
                        this.removeRedColorAndUnderline(clonedANode);
                        bodyNode.insertBefore(clonedANode, insertAnchor);
                    }
                }
            } else {
                const originalOrderAnswers = [...q.answers].sort((a, b) => a.originalIndex - b.originalIndex);
                const originalNodesToInsert = Array.from(new Set(originalOrderAnswers.map(a => a.originalNode)));

                for (const singleNode of originalNodesToInsert) {
                    const clonedNode = singleNode.cloneNode(true);
                    this.removeRedColorAndUnderline(clonedNode);
                    bodyNode.insertBefore(clonedNode, insertAnchor);
                }
            }
            questionIndex++;
        }

        const nodesToRemove = new Set<any>();
        const startIndex = classifiedLines.findIndex(l => l.type === LineType.TAG || l.type === LineType.QUESTION);
        if (startIndex !== -1) {
            for (let i = startIndex; i < classifiedLines.length; i++) {
                nodesToRemove.add(classifiedLines[i].node);
            }
        }
        nodesToRemove.forEach(node => {
            if (node && node.parentNode) node.parentNode.removeChild(node);
        });

        const serializer = new XMLSerializer();
        const newXmlString = serializer.serializeToString(docDom);
        const zip = new AdmZip(fileBuffer);
        zip.updateFile('word/document.xml', Buffer.from(newXmlString, 'utf8'));

        return zip.toBuffer();
    }
}