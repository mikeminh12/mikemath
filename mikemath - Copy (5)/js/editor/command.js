/**
 * Command Dispatcher for MathEditor
 */

export class CommandManager {
    constructor(editor) {
        this.editor = editor;
    }

    execute(commandName, args = null) {
        if (typeof this[commandName] === 'function') {
            this[commandName](args);
            this.editor.triggerChange();
        } else {
            console.warn(`MathEditor: Command '${commandName}' không tồn tại.`);
        }
    }

    // Text Commands
    bold() { document.execCommand('bold', false, null); }
    italic() { document.execCommand('italic', false, null); }
    underline() { document.execCommand('underline', false, null); }
    justifyLeft() { document.execCommand('justifyLeft', false, null); }
    justifyCenter() { document.execCommand('justifyCenter', false, null); }
    justifyRight() { document.execCommand('justifyRight', false, null); }
    justifyFull() { document.execCommand('justifyFull', false, null); }
    insertUnorderedList() { document.execCommand('insertUnorderedList', false, null); }
    insertOrderedList() { document.execCommand('insertOrderedList', false, null); }
    undo() { document.execCommand('undo', false, null); }
    redo() { document.execCommand('redo', false, null); }
    insertPromptMath() {
        const latex = prompt('Nhập công thức toán học (mã LaTeX):', 'AB^2 + AC^2 = BC^2');
        if (latex && latex.trim()) {
            this.editor.insertFormula(latex.trim());
        }
    }

    // MathLive Field Insertion Commands
    insertFraction() { this.editor.insertFormula('\\frac{#?}{#?}'); }
    insertRoot() { this.editor.insertFormula('\\sqrt{#?}'); }
    insertPower() { this.editor.insertFormula('#?^{#?}'); }
    insertSubscript() { this.editor.insertFormula('#?_{#?}'); }
    insertAbs() { this.editor.insertFormula('|#?|'); }
    insertParens() { this.editor.insertFormula('(#?)'); }
    insertBrackets() { this.editor.insertFormula('[#?]'); }
    insertBraces() { this.editor.insertFormula('\\{#?\\}'); }

    // Geometry Commands
    insertTriangle() { this.editor.insertFormula('\\triangle #?'); }
    insertAngle() { this.editor.insertFormula('\\angle #?'); }
    insertPerpendicular() { this.editor.insertFormula('\\perp'); }
    insertParallel() { this.editor.insertFormula('\\parallel'); }
    insertDegree() { this.editor.insertFormula('^{\\circ}'); }
    insertCongruent() { this.editor.insertFormula('\\cong'); }
    insertSimilar() { this.editor.insertFormula('\\sim'); }
    insertArc() { this.editor.insertFormula('\\overarc{#?}'); }

    // Symbols & Greek
    insertGreek(latexSymbol) { this.editor.insertFormula(latexSymbol); }
    insertSymbol(latexSymbol) { this.editor.insertFormula(latexSymbol); }
    insertDelta() { this.editor.insertFormula('\\Delta'); }
    insertSigma() { this.editor.insertFormula('\\sum_{i=1}^{n}'); }
    insertIntegral() { this.editor.insertFormula('\\int_{a}^{b} #? dx'); }
    // 🟢 Chèn Ký hiệu Hình học THCS (Unicode trực tiếp cho mượt)
    insertTriangle() { this.editor.insertFormula('Δ'); }
    insertAngle() { this.editor.insertFormula('∠'); }
    insertPerpendicular() { this.editor.insertFormula('⊥'); }
    insertParallel() { this.editor.insertFormula('∥'); }
    insertDegree() { this.editor.insertFormula('°'); }
    insertCongruent() { this.editor.insertFormula('≅'); }
    insertSimilar() { this.editor.insertFormula('∼'); }
    insertArc() { this.editor.insertFormula('\\overarc{AB}'); }

    // 🟢 Chèn Đại số (LaTeX chuẩn)
    insertFraction() { this.editor.insertFormula('\\frac{a}{b}'); }
    insertRoot() { this.editor.insertFormula('\\sqrt{x}'); }
    insertPower() { this.editor.insertFormula('x^{2}'); }
    insertSubscript() { this.editor.insertFormula('x_{1}'); }
    insertAbs() { this.editor.insertFormula('|x|'); }
    // System of equations & Advanced Commands
    insertSystem2() {
        this.editor.insertFormula('\\begin{cases} a_1 x + b_1 y = c_1 \\\\ a_2 x + b_2 y = c_2 \\end{cases}');
    }

    insertSystem3() {
        this.editor.insertFormula('\\begin{cases} a_1 x + b_1 y + c_1 z = d_1 \\\\ a_2 x + b_2 y + c_2 z = d_2 \\\\ a_3 x + b_3 y + c_3 z = d_3 \\end{cases}');
    }

    insertMatrix(size = 2) {
        if (size === 2) {
            this.editor.insertFormula('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}');
        } else {
            this.editor.insertFormula('\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}');
        }
    }

    insertCases() {
        this.editor.insertFormula('\\begin{cases} f(x) & \\text{khi } x \\ge 0 \\\\ g(x) & \\text{khi } x < 0 \\end{cases}');
    }
}