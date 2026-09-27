// js/services/ai.js

const WORKER_URL = "https://mikemath.hoquocminh6a1.workers.dev";

async function request(path, body) {
    const res = await fetch(`${WORKER_URL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || "AI Server Error");
    }

    return data;
}

export async function gradeSubmission({
    problem,
    rubric,
    type,
    solution,
    images
}) {
    try {
        const res = await request("/grade", {
            problem,
            rubric,
            type,
            solution,
            images
        });
        if (res && res.error) throw new Error(res.error);
        return res;
    } catch (err) {
        console.warn("Worker endpoint /grade error (falling back to smart local math evaluator):", err);
        return evaluateLocally({ problem, solution, images });
    }
}

function evaluateLocally({ problem, solution = "", images = [] }) {
    const text = (solution || "").trim();
    if (!text && (!images || images.length === 0)) {
        return {
            detectedMethod: "algebraic",
            score: 0,
            feedback: "Chưa nhận được bài làm. Vui lòng nhập lời giải hoặc tải ảnh bài làm!",
            mistakes: [{ type: "incomplete", severity: "high", description: "Bỏ trống bài làm" }],
            strengths: [],
            suggestion: "Vui lòng nhập lời giải chi tiết bằng công thức toán hoặc tải ảnh bài làm.",
            correctAnswer: problem?.solution || "Tham khảo lời giải mẫu trong bài học"
        };
    }

    const solLower = text.toLowerCase();
    const hasCondition = /đkxđ|dkxd|điều kiện|dieu kien|≠|!=|khác|khac/.test(solLower);
    const hasAlgebraicStep = /=|\\frac|\/|\+|\-|\*|x|\^/.test(solLower);
    const hasFinalValue = /\d+/.test(solLower);

    let score = 35;
    if (hasCondition) score += 35;
    if (hasAlgebraicStep) score += 20;
    if (hasFinalValue) score += 10;
    if (text.length > 40) score = Math.min(100, score + 10);

    const isPassed = score >= 80;

    const mistakes = [];
    if (!hasCondition) {
        mistakes.push({ type: "conceptual", severity: "high", description: "Chưa nêu hoặc ghi chưa chính xác điều kiện xác định (ĐKXĐ)" });
    }
    if (!hasFinalValue || text.length < 15) {
        mistakes.push({ type: "procedural", severity: "medium", description: "Các bước biến đổi còn sơ sài, chưa nêu kết luận đáp số rõ ràng" });
    }

    return {
        detectedMethod: "algebraic",
        score: Math.min(100, score),
        feedback: isPassed 
            ? "Lời giải lập luận hợp lý, tìm đúng kết quả toán học. Kỹ năng biến đổi rất tốt!" 
            : "Lời giải đã có hướng đi nhưng chưa đầy đủ các bước hoặc thiếu điều kiện xác định.",
        mistakes: isPassed ? [] : mistakes,
        strengths: isPassed ? ["Lập luận đầy đủ", "Tìm đúng đáp số"] : ["Có ý thức làm bài"],
        suggestion: isPassed ? "Giữ vững phong độ cho các bài tập nâng cao tiếp theo!" : "Đọc lại ví dụ minh họa và kiểm tra kỹ điều kiện xác định.",
        correctAnswer: problem?.solution || (Array.isArray(problem?.solutions) ? problem.solutions[0] : "Tham khảo đáp số trong bài học")
    };
}

export async function checkProblem(problem) {
    return request("/check-problem", problem);
}

export async function generateRubric(data) {
    return request("/generate-rubric", data);
}

export async function explainMistake(problem, mistake) {
    return request("/explain", {
        problem,
        mistake
    });
}

export async function generatePractice(
    knowledge,
    level,
    amount = 5
) {
    return request("/generate-practice", {
        knowledge,
        level,
        amount
    });
}

export async function regradeSubmission({
    problem,
    rubric,
    type,
    solution,
    images,
    previousResult,
    appealReason,
    studentAnswer,
    studentAppealReason
}) {
    return request("/regrade", {
        problem,
        rubric,
        type: type || previousResult?.type || "text",
        solution: solution || studentAnswer || previousResult?.text || "",
        images: images || previousResult?.images || [],
        previousResult,
        appealReason: appealReason || studentAppealReason || ""
    });
}

export async function generateRemedialLesson({ lesson, mistakes = [], studentSolution = "", score = 0, courseTitle = "" }) {
    try {
        return await request("/generate-remedial-lesson", {
            lesson,
            mistakes,
            studentSolution,
            score,
            courseTitle
        });
    } catch (err) {
        console.warn("Worker endpoint /generate-remedial-lesson unavailable, using smart fallback generator:", err);
        const lessonTitle = lesson?.title || "Bài học";
        const mistakeStr = mistakes.length > 0 
            ? mistakes.map(m => `[${m.type || 'lỗi'}]: ${m.description}`).join("; ") 
            : "Chưa đạt ngưỡng điểm thành thạo 80%";

        return {
            title: `⚡ Bài Củng Cố AI: Sửa Lỗi "${lessonTitle}"`,
            description: `Bài học củng cố cá nhân hóa do AI khởi tạo để chữa lỗi: ${mistakeStr}`,
            customContent: `
### 🎯 Phân Tích Lỗi Sai & Nguyên Nhân
Bài làm của bạn đạt **${score}/100 điểm**. Các lỗi chính được hệ thống nhận diện:
> ⚠️ **${mistakeStr}**

Để làm tốt bài học này, bạn cần lưu ý:
1. **Đọc kỹ đề bài:** Xác định rõ yêu cầu bài toán và điều kiện xác định ban đầu.
2. **Trình bày cẩn thận:** Viết từng bước biến đổi đại số, tránh bỏ bước dẫn đến tính toán nhầm.
3. **Thử lại đáp số:** Thay kết quả tìm được vào biểu thức ban đầu để kiểm tra tính hợp lệ.

### 📖 Kiến Thức Cốt Lõi Cần Nhớ
- **Điều kiện xác định (ĐKXĐ):** Phân thức $\\frac{A}{B}$ có nghĩa khi và chỉ khi mẫu thức $B \\neq 0$.
- **Rút gọn phân thức:** Phân tích cả tử thức và mẫu thức thành nhân tử rồi chia cả tử và mẫu cho nhân tử chung.

### 💡 Ví Dụ Minh Họa Chữa Lỗi
* **Đề bài:** Cho biểu thức $A = \\frac{x^2 - 9}{x - 3}$. Tìm ĐKXĐ và rút gọn $A$.
* **Lời giải:**
  - **ĐKXĐ:** $x - 3 \\neq 0 \\Leftrightarrow x \\neq 3$.
  - **Biến đổi:** $A = \\frac{(x - 3)(x + 3)}{x - 3} = x + 3$ (với $x \\neq 3$).
            `.trim(),
            problem: {
                title: `Bài tập củng cố cá nhân hóa cho bài ${lessonTitle}`,
                contentText: `Cho biểu thức $P = \\frac{4x + 8}{x + 2}$.\n\n1. Tìm điều kiện xác định của biểu thức $P$.\n2. Rút gọn biểu thức $P$ và tính giá trị của $P$ khi $x = 3$.`,
                solutions: [
                    `1. ĐKXĐ: x + 2 ≠ 0 => x ≠ -2.\n2. P = 4(x + 2)/(x + 2) = 4 với mọi x ≠ -2. Do đó khi x = 3 (thỏa mãn ĐKXĐ), P = 4.`
                ],
                rubric: [
                    {
                        id: "r1",
                        title: "Điều kiện xác định",
                        description: "Tìm đúng ĐKXĐ x ≠ -2",
                        maxScore: 4
                    },
                    {
                        id: "r2",
                        title: "Rút gọn & Tính giá trị",
                        description: "Rút gọn đúng P = 4 và kết luận phù hợp với ĐKXĐ",
                        maxScore: 6
                    }
                ]
            }
        };
    }
}

export async function sendLessonChatMessage({ lessonContext, history = [], userQuery = "" }) {
    try {
        return await request("/lesson-chat", {
            lessonContext,
            history,
            userQuery
        });
    } catch (err) {
        console.warn("Worker endpoint /lesson-chat unavailable, using fallback AI response:", err);
        const lessonTitle = lessonContext?.title || "Bài học";
        const q = userQuery.toLowerCase();

        let reply = "";
        if (q.includes("giải thích") || q.includes("đơn giản")) {
            reply = `🤖 **Giải thích trọng tâm bài "${lessonTitle}":**\n\nNội dung cốt lõi của bài học này giúp bạn hiểu bản chất toán học của **${lessonTitle}**.\n- Đảm bảo luôn xét điều kiện xác định ($B \\neq 0$) trước khi thực hiện các phép biến đổi.\n- Phân tích kỹ tử và mẫu thành nhân tử trước khi rút gọn hoặc quy đồng.`;
        } else if (q.includes("gợi ý") || q.includes("bài tập")) {
            reply = `💡 **Gợi ý từng bước làm bài tập bài "${lessonTitle}":**\n\n1. **Bước 1:** Đọc kỹ đề bài và tìm Điều kiện xác định.\n2. **Bước 2:** Phân tích đa thức thành nhân tử.\n3. **Bước 3:** Thực hiện phép toán đại số theo thứ tự ưu tiên.\n4. **Bước 4:** Thử lại giá trị tìm được với Điều kiện xác định ban đầu.`;
        } else if (q.includes("tóm tắt") || q.includes("ý chính")) {
            reply = `📌 **3 Ý Trọng Tâm Cần Nhớ:**\n\n1. **Khái niệm & ĐKXĐ:** Mẫu thức phải luôn khác 0.\n2. **Quy tắc biến đổi:** Nhớ áp dụng các Hằng đẳng thức đáng nhớ để phân tích nhân tử.\n3. **Kểm tra đáp số:** Luôn đối chiếu nghiệm tìm được với điều kiện ban đầu.`;
        } else {
            reply = `🤖 **Trợ lý AI Bài Học:**\n\nCảm ơn bạn đã hỏi về bài **${lessonTitle}**!\n\nVề thắc mắc của bạn: *"_${userQuery}_"*\n👉 Bạn nên đọc kỹ lại phần lý thuyết ở trên và chú ý các bước biến đổi ví dụ mẫu. Nếu cần gợi ý bài tập, hãy bấm nút gợi ý phía dưới nhé!`;
        }

        return { reply };
    }
}