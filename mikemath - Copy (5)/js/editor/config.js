/**
 * MathEditor Config
 * Module quản lý cấu hình mặc định và định nghĩa các nhóm Toolbar
 */

export const DEFAULT_CONFIG = {
    theme: 'light', // 'light' | 'dark'
    placeholder: 'Nhập nội dung bài toán hoặc công thức tại đây...',
    readOnly: false,
    minHeight: '200px',
    maxHeight: '600px',
    showPreview: true,
    showStatusBar: true,
    katexOptions: {
        throwOnError: false,
        displayMode: false
    }
};

export const TOOLBAR_GROUPS = [
    {
        id: 'text',
        name: 'Văn bản',
        items: [
            { id: 'bold', label: 'In đậm', icon: 'bold', cmd: 'bold' },
            { id: 'italic', label: 'In nghiêng', icon: 'italic', cmd: 'italic' },
            { id: 'underline', label: 'Gạch chân', icon: 'underline', cmd: 'underline' },
            { id: 'alignLeft', label: 'Căn trái', icon: 'alignLeft', cmd: 'justifyLeft' },
            { id: 'alignCenter', label: 'Căn giữa', icon: 'alignCenter', cmd: 'justifyCenter' },
            { id: 'alignRight', label: 'Căn phải', icon: 'alignRight', cmd: 'justifyRight' },
            { id: 'alignJustify', label: 'Căn đều', icon: 'alignJustify', cmd: 'justifyFull' },
            { id: 'bulletList', label: 'Danh sách dấu chấm', icon: 'listUl', cmd: 'insertUnorderedList' },
            { id: 'orderedList', label: 'Danh sách số', icon: 'listOl', cmd: 'insertOrderedList' },
            { id: 'customMath', label: 'Chèn công thức LaTeX', icon: 'customMath', cmd: 'insertPromptMath' },
            { id: 'undo', label: 'Hoàn tác', icon: 'undo', cmd: 'undo' },
            { id: 'redo', label: 'Làm lại', icon: 'redo', cmd: 'redo' }
        ]
    },
    {
        id: 'algebra',
        name: 'Đại số',
        items: [
            { id: 'fraction', label: 'Phân số', icon: 'fraction', cmd: 'insertFraction' },
            { id: 'sqrt', label: 'Căn bậc hai', icon: 'sqrt', cmd: 'insertRoot' },
            { id: 'power', label: 'Lũy thừa (Mũ)', icon: 'power', cmd: 'insertPower' },
            { id: 'subscript', label: 'Chỉ số dưới', icon: 'subscript', cmd: 'insertSubscript' },
            { id: 'abs', label: 'Giá trị tuyệt đối', icon: 'abs', cmd: 'insertAbs' },
            { id: 'parens', label: 'Ngoặc tròn ()', icon: 'parens', cmd: 'insertParens' },
            { id: 'brackets', label: 'Ngoặc vuông []', icon: 'brackets', cmd: 'insertBrackets' },
            { id: 'braces', label: 'Ngoặc nhọn {}', icon: 'braces', cmd: 'insertBraces' }
        ]
    },
    {
        id: 'geometry',
        name: 'Hình học',
        items: [
            { id: 'triangle', label: 'Tam giác (△)', icon: 'triangle', cmd: 'insertTriangle' },
            { id: 'angle', label: 'Góc (∠)', icon: 'angle', cmd: 'insertAngle' },
            { id: 'perp', label: 'Vuông góc (⊥)', icon: 'perp', cmd: 'insertPerpendicular' },
            { id: 'parallel', label: 'Song song (∥)', icon: 'parallel', cmd: 'insertParallel' },
            { id: 'degree', label: 'Ký hiệu độ (°)', icon: 'degree', cmd: 'insertDegree' },
            { id: 'cong', label: 'Đồng dạng / Bằng nhau (≅)', icon: 'cong', cmd: 'insertCongruent' },
            { id: 'sim', label: 'Đồng dạng (∼)', icon: 'sim', cmd: 'insertSimilar' },
            { id: 'arc', label: 'Cung (⌒)', icon: 'arc', cmd: 'insertArc' }
        ]
    },
    {
        id: 'greek',
        name: 'Hy Lạp',
        items: [
            { id: 'alpha', label: 'α', icon: 'alpha', cmd: 'insertGreek', args: '\\alpha' },
            { id: 'beta', label: 'β', icon: 'beta', cmd: 'insertGreek', args: '\\beta' },
            { id: 'gamma', label: 'γ', icon: 'gamma', cmd: 'insertGreek', args: '\\gamma' },
            { id: 'delta_sm', label: 'δ', icon: 'delta_sm', cmd: 'insertGreek', args: '\\delta' },
            { id: 'delta_bg', label: 'Δ (Delta)', icon: 'delta_bg', cmd: 'insertDelta' },
            { id: 'theta', label: 'θ', icon: 'theta', cmd: 'insertGreek', args: '\\theta' },
            { id: 'lambda', label: 'λ', icon: 'lambda', cmd: 'insertGreek', args: '\\lambda' },
            { id: 'pi', label: 'π', icon: 'pi', cmd: 'insertGreek', args: '\\pi' },
            { id: 'omega', label: 'Ω', icon: 'omega', cmd: 'insertGreek', args: '\\Omega' }
        ]
    },
    {
        id: 'math',
        name: 'Toán học',
        items: [
            { id: 'le', label: 'Nhỏ hơn hoặc bằng (≤)', icon: 'le', cmd: 'insertSymbol', args: '\\le' },
            { id: 'ge', label: 'Lớn hơn hoặc bằng (≥)', icon: 'ge', cmd: 'insertSymbol', args: '\\ge' },
            { id: 'neq', label: 'Khác (≠)', icon: 'neq', cmd: 'insertSymbol', args: '\\neq' },
            { id: 'approx', label: 'Xấp xỉ (≈)', icon: 'approx', cmd: 'insertSymbol', args: '\\approx' },
            { id: 'infty', label: 'Vô cực (∞)', icon: 'infty', cmd: 'insertSymbol', args: '\\infty' },
            { id: 'pm', label: 'Cộng trừ (±)', icon: 'pm', cmd: 'insertSymbol', args: '\\pm' },
            { id: 'sum', label: 'Tổng (∑)', icon: 'sum', cmd: 'insertSigma' },
            { id: 'int', label: 'Tích phân (∫)', icon: 'int', cmd: 'insertIntegral' }
        ]
    },
    {
        id: 'advanced',
        name: 'Nâng cao',
        items: [
            { id: 'system2', label: 'Hệ 2 phương trình', icon: 'system2', cmd: 'insertSystem2' },
            { id: 'system3', label: 'Hệ 3 phương trình', icon: 'system3', cmd: 'insertSystem3' },
            { id: 'cases', label: 'Điều kiện / Nhánh', icon: 'cases', cmd: 'insertCases' },
            { id: 'matrix2', label: 'Ma trận 2x2', icon: 'matrix2', cmd: 'insertMatrix', args: 2 },
            { id: 'matrix3', label: 'Ma trận 3x3', icon: 'matrix3', cmd: 'insertMatrix', args: 3 }
        ]
    }
];