/**
 * MikeMath AI Backend — Cloudflare Worker
 * Version: 4.1.0 (Added /analyze-weakness for Student Learning Profile)
 *
 * Enpoints:
 * - /grade             : Chấm bài 3 bước & phân loại lỗi
 * - /regrade           : Kháng cáo điểm số
 * - /generate-rubric   : Sinh rubric tự động
 * - /check-problem     : Kiểm định chất lượng đề bài
 * - /explain           : Giải thích lỗi sai chi tiết
 * - /generate-practice : Sinh bài luyện tập
 * - /analyze-weakness  : Phân tích điểm yếu & đề xuất cập nhật Learning Profile
 */

export default {
  async fetch(request, env, ctx) {

    // ── CORS Preflight ──────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return corsResponse();
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method Not Allowed' }, 405);
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ error: 'Server configuration error: GEMINI_API_KEY is missing' }, 500);
    }

    // ── Router ──────────────────────────────────────────────────────────────
    const url      = new URL(request.url);
    const pathname = url.pathname;

    let body = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    try {
      switch (pathname) {
        case '/grade':
          return await handleGrade(body, env);

        case '/regrade':
          return await handleRegrade(body, env);

        case '/generate-rubric':
        case '/api/ai-rubric':
          return await handleGenerateRubric(body, env);

        case '/check-problem':
          return await handleCheckProblem(body, env);

        case '/explain':
          return await handleExplain(body, env);

        case '/generate-practice':
          return await handleGeneratePractice(body, env);

        case '/analyze-weakness':
          return await handleAnalyzeWeakness(body, env);

        case '/generate-remedial-lesson':
          return await handleGenerateRemedialLesson(body, env);

        case '/lesson-chat':
          return await handleLessonChat(body, env);

        default:
          return jsonResponse({ error: 'Endpoint not found' }, 404);
      }
    } catch (err) {
      console.error(`[ERROR] ${pathname}:`, err);
      return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
    }
  }
};

/* ============================================================================
   1. /grade — Chấm bài lần đầu
   ========================================================================== */
async function handleGrade(body, env) {
  const {
    problem,
    rubric,
    type,
    images,
    solutions
  } = body;

  const studentSolution = body.submission || body.solution || '';

  if (!problem) {
    return jsonResponse({ error: 'Thiếu thông tin đề bài (problem)' }, 400);
  }
  
  // Tự động sử dụng Rubric chuẩn nếu đề bài chưa có Rubric riêng
  const rubricData = (Array.isArray(rubric) && rubric.length > 0) 
    ? rubric 
    : [
        {
          id: "r1",
          title: "Lời giải & Kết quả toán học",
          description: "Học sinh lập luận đúng và tìm ra kết quả toán học tương đương",
          maxScore: 10
        }
      ];

  if (type === 'text' && !studentSolution.trim()) {
    return jsonResponse({ error: 'Thiếu nội dung bài làm (solution)' }, 400);
  }
  if (type === 'image' && (!Array.isArray(images) || images.length === 0)) {
    return jsonResponse({ error: 'Thiếu ảnh bài làm' }, 400);
  }

  const systemInstruction = `Bạn là Giáo viên Toán THCS Việt Nam giàu kinh nghiệm, chấm bài khách quan và công bằng.

╔══════════════════════════════════════════════════════╗
║          QUY TRÌNH CHẤM BÀI BẮT BUỘC — 3 BƯỚC       ║
╚══════════════════════════════════════════════════════╝

▶ BƯỚC 1 — NHẬN DIỆN PHƯƠNG PHÁP
▶ BƯỚC 2 — ĐÁNH GIÁ THEO Ý NGHĨA TOÁN HỌC
▶ BƯỚC 3 — PHÂN LOẠI LỖI (conceptual / procedural / careless / incomplete)

ĐỊNH DẠNG JSON TRẢ VỀ (KHÔNG DÙNG MARKDOWN, KHÔNG TEXT DƯ):
{
  "detectedMethod": "algebraic",
  "score": 8.5,
  "criteria": [
    {
      "id": "r1",
      "earnedScore": 2.0,
      "maxScore": 3.0,
      "comment": "Học sinh thiết lập đúng mối quan hệ bằng sơ đồ, tương đương phương trình."
    }
  ],
  "feedback": "Nhận xét tổng quan ngắn gọn về bài làm...",
  "mistakes": [
    {
      "type": "careless",
      "severity": "low",
      "description": "Tính 3x4 = 13 thay vì 12 tại bước 2",
      "step": 2
    }
  ],
  "weaknessAnalysis": [
    {
      "knowledgeId": "knowledge_fraction_simplify",
      "severity": "high",
      "description": "Chưa nắm rõ điều kiện xác định phân thức đại số"
    }
  ],
  "strengths": ["Trình bày rõ ràng"],
  "knowledge": ["phuong-trinh-bac-nhat"],
  "suggestion": "Xem lại bước 2...",
  "correctAnswer": "Đáp số đúng...",
  "confidence": 0.85,
  "confidence_reason": "Chữ viết rõ"
}`;

  let promptText = `ĐỀ BÀI:\n${typeof problem === 'object' ? JSON.stringify(problem, null, 2) : problem}\n\n`;
  promptText += `RUBRIC CHẤM ĐIỂM:\n${JSON.stringify(rubricData, null, 2)}\n\n`;

  if (Array.isArray(solutions) && solutions.length > 0) {
    promptText += `CÁC CÁCH GIẢI MẪU HỢP LỆ:\n`;
    solutions.forEach((sol, i) => {
      promptText += `── Cách ${i + 1} ──\n${sol}\n\n`;
    });
  }

  if (type === 'image') {
    promptText += `BÀI LÀM CỦA HỌC SINH: Dạng hình ảnh — đọc từ ảnh đính kèm.`;
  } else {
    promptText += `BÀI LÀM CỦA HỌC SINH:\n${studentSolution}`;
  }

  const parts = [{ text: `${systemInstruction}\n\n${promptText}` }];

  if (type === 'image' && Array.isArray(images) && images.length > 0) {
    const imageParts = await processImagesToParts(images);
    parts.push(...imageParts);
  }

  const rawResult = await askGemini(parts, env.GEMINI_API_KEY, { useThinking: true });
  const parsed    = parseAndValidateJSON(rawResult);

  return jsonResponse(parsed.data, parsed.success ? 200 : 500);
}

/* ============================================================================
   2. /regrade — Kháng cáo & chấm lại
   ========================================================================== */
async function handleRegrade(body, env) {
  const {
    problem,
    rubric,
    type,
    images,
    solution,
    studentAnswer,
    previousResult,
    appealReason,
    studentAppealReason
  } = body;

  const actualAppealReason = appealReason || studentAppealReason || body.reason || '';
  const actualSolution = solution || studentAnswer || body.text || '';
  const actualType = type || (previousResult?.type) || 'text';
  const actualImages = (Array.isArray(images) && images.length > 0) ? images : (previousResult?.images || []);

  if (!problem) return jsonResponse({ error: 'Thiếu đề bài (problem)' }, 400);
  if (!actualAppealReason.trim()) return jsonResponse({ error: 'Thiếu lý do phúc khảo (appealReason)' }, 400);

  // Fallback rubric nếu không được truyền trực tiếp
  const actualRubric = (Array.isArray(rubric) && rubric.length > 0)
    ? rubric
    : (Array.isArray(problem?.rubric) && problem.rubric.length > 0
      ? problem.rubric
      : [
          {
            id: "r1",
            title: "Lời giải & Kết quả toán học",
            description: "Học sinh lập luận đúng và tìm ra kết quả toán học tương đương",
            maxScore: 10
          }
        ]);

  const actualPreviousResult = previousResult || {
    score: 0,
    feedback: "Chưa có điểm cũ"
  };

  const systemInstruction = `Bạn là Giáo viên Toán THCS đang xem xét kháng cáo / phúc khảo điểm số của học sinh.

Quy tắc xử lý phúc khảo:
1. Đọc lại TOÀN BỘ bài làm một cách khách quan.
2. Xem xét lý do kháng cáo có cơ sở toán học hay không.
3. Nếu học sinh ĐÚNG (cách giải khác nhưng tương đương, hoặc AI chấm thiếu sót) → set "appealAccepted": true, điều chỉnh newScore và giải thích rõ ràng trong "appealExplanation".
4. Nếu học sinh SAI (kháng cáo không có cơ sở) → set "appealAccepted": false, GIỮ NGUYÊN newScore bằng điểm cũ và giải thích tại sao học sinh chưa đúng trong "appealExplanation".
5. Luôn tôn trọng: ngôn ngữ lịch sự, giải thích rõ lý do để học sinh hiểu.

ĐỊNH DẠNG JSON TRẢ VỀ (KHÔNG MARKDOWN, KHÔNG TEXT DƯ):
{
  "appealAccepted": true,
  "scoreChanged": true,
  "previousScore": 6.0,
  "newScore": 7.5,
  "score": 7.5,
  "changedCriteria": [],
  "appealExplanation": "Sau khi xem xét lại...",
  "detectedMethod": "algebraic",
  "criteria": [],
  "feedback": "Nhận xét mới sau phúc khảo...",
  "mistakes": [],
  "strengths": [],
  "knowledge": [],
  "suggestion": "...",
  "correctAnswer": "...",
  "confidence": 0.9,
  "confidence_reason": "..."
}`;

  let promptText  = `ĐỀ BÀI:\n${typeof problem === 'object' ? JSON.stringify(problem, null, 2) : problem}\n\n`;
  promptText     += `RUBRIC:\n${JSON.stringify(actualRubric, null, 2)}\n\n`;
  promptText     += `KẾT QUẢ CHẤM LẦN TRƯỚC:\n${JSON.stringify(actualPreviousResult, null, 2)}\n\n`;
  promptText     += `LÝ DO KHÁNG CÁO CỦA HỌC SINH:\n${actualAppealReason}\n\n`;

  if (actualType === 'image') {
    promptText += `BÀI LÀM CỦA HỌC SINH: Dạng hình ảnh — đọc từ ảnh đính kèm.`;
  } else {
    promptText += `BÀI LÀM CỦA HỌC SINH:\n${actualSolution}`;
  }

  const parts = [{ text: `${systemInstruction}\n\n${promptText}` }];

  if (type === 'image' && Array.isArray(images) && images.length > 0) {
    const imageParts = await processImagesToParts(images);
    parts.push(...imageParts);
  }

  const rawResult = await askGemini(parts, env.GEMINI_API_KEY, { useThinking: true });
  const parsed    = parseAndValidateJSON(rawResult);

  return jsonResponse(parsed.data, parsed.success ? 200 : 500);
}

/* ============================================================================
   3. /generate-rubric — Sinh rubric chấm điểm
   ========================================================================== */
async function handleGenerateRubric(body, env) {
  const { problem, templates, solutions } = body;

  const content         = typeof problem === 'object' ? (problem.content || '') : String(problem || '');
  const primarySolution = typeof problem === 'object' ? (problem.solution || '') : '';
  const rubricTemplates = templates || [];

  const allSolutions = Array.isArray(solutions) && solutions.length > 0
    ? solutions
    : (primarySolution ? [primarySolution] : []);

  if (!content.trim()) {
    return jsonResponse({ error: 'Nội dung đề bài không được để trống' }, 400);
  }

  const solutionsBlock = allSolutions.length > 0
    ? allSolutions.map((s, i) => `── Cách giải ${i + 1} ──\n${s}`).join('\n\n')
    : 'Không có lời giải sẵn — hãy tự giải bài toán trên.';

  const promptText = `Bạn là Chuyên gia Cố vấn Giảng dạy Toán THCS Việt Nam.

ĐỀ BÀI:
${content}

CÁC CÁCH GIẢI MẪU:
${solutionsBlock}

RUBRIC TEMPLATES THAM KHẢO:
${JSON.stringify(rubricTemplates, null, 2)}

ĐỊNH DẠNG JSON TRẢ VỀ:
{
  "rubric": [
    {
      "id": "r1",
      "title": "Tên tiêu chí mô tả kết quả cần đạt",
      "description": "Mô tả...",
      "acceptedApproaches": ["Cách 1", "Cách 2"],
      "score": 3.0,
      "knowledge": ["ma-kien-thuc-lien-quan"]
    }
  ]
}`;

  const parts     = [{ text: promptText }];
  const rawResult = await askGemini(parts, env.GEMINI_API_KEY);
  const parsed    = parseAndValidateJSON(rawResult);

  return jsonResponse(parsed.data, parsed.success ? 200 : 500);
}

/* ============================================================================
   4. /check-problem — Kiểm định chất lượng đề bài
   ========================================================================== */
async function handleCheckProblem(body, env) {
  const { title, content, solution, images } = body;

  if (!content?.trim() && !images?.length) {
    return jsonResponse({ error: 'Thiếu nội dung đề bài' }, 400);
  }

  const promptText = `Bạn là Chuyên gia Kiểm định Đề thi Toán THCS Việt Nam.

Hãy kiểm tra toàn diện chất lượng đề bài:
Tiêu đề : ${title || '(không có)'}
Nội dung: ${content || '(xem ảnh)'}
Lời giải: ${solution || '(không có)'}

ĐỊNH DẠNG JSON TRẢ VỀ:
{
  "isValid": true,
  "suggestedGrade": "8",
  "difficulty": "medium",
  "errors": [],
  "warnings": [],
  "suggestion": "..."
}`;

  const parts = [{ text: promptText }];

  if (Array.isArray(images) && images.length > 0) {
    const imageParts = await processImagesToParts(images);
    parts.push(...imageParts);
  }

  const rawResult = await askGemini(parts, env.GEMINI_API_KEY);
  const parsed    = parseAndValidateJSON(rawResult);

  return jsonResponse(parsed.data, parsed.success ? 200 : 500);
}

/* ============================================================================
   5. /explain — Giải thích lỗi sai chi tiết
   ========================================================================== */
async function handleExplain(body, env) {
  const { problem, mistake } = body;

  if (!problem) return jsonResponse({ error: 'Thiếu đề bài (problem)' }, 400);
  if (!mistake) return jsonResponse({ error: 'Thiếu thông tin lỗi sai (mistake)' }, 400);

  const promptText = `Bạn là Giáo viên Toán THCS tận tâm, giải thích lỗi sai.

ĐỀ BÀI:
${typeof problem === 'object' ? JSON.stringify(problem, null, 2) : problem}

LỖI SAI:
${JSON.stringify(mistake, null, 2)}

ĐỊNH DẠNG JSON TRẢ VỀ:
{
  "title": "Tiêu đề lỗi sai",
  "explanation": "...",
  "example": "...",
  "relatedConcepts": [],
  "commonMistakes": [],
  "tip": "..."
}`;

  const parts     = [{ text: promptText }];
  const rawResult = await askGemini(parts, env.GEMINI_API_KEY);
  const parsed    = parseAndValidateJSON(rawResult);

  return jsonResponse(parsed.data, parsed.success ? 200 : 500);
}

/* ============================================================================
   6. /generate-practice — Sinh bài luyện tập
   ========================================================================== */
async function handleGeneratePractice(body, env) {
  const { knowledge, level, amount } = body;
  const count = Math.min(Number(amount) || 3, 10);

  if (!knowledge) {
    return jsonResponse({ error: 'Thiếu thông tin kiến thức (knowledge)' }, 400);
  }

  const promptText = `Bạn là Giáo viên Toán THCS Việt Nam.
Kiến thức : ${Array.isArray(knowledge) ? knowledge.join(', ') : knowledge}
Số lượng  : ${count}

ĐỊNH DẠNG JSON TRẢ VỀ:
{
  "questions": [
    {
      "id": 1,
      "content": "...",
      "difficulty": "easy",
      "hint": "...",
      "solution": "...",
      "commonMistakes": []
    }
  ]
}`;

  const parts     = [{ text: promptText }];
  const rawResult = await askGemini(parts, env.GEMINI_API_KEY);
  const parsed    = parseAndValidateJSON(rawResult);

  return jsonResponse(parsed.data, parsed.success ? 200 : 500);
}

/* ============================================================================
   7. /analyze-weakness — AI Nhận diện điểm yếu học sinh từ bài làm
   ========================================================================== */
async function handleAnalyzeWeakness(body, env) {
  const { problem, submission, mistakes, score, maxScore, studentProfile } = body;

  if (!problem) return jsonResponse({ error: 'Thiếu thông tin bài tập (problem)' }, 400);

  const systemInstruction = `Bạn là Chuyên gia Cố vấn Học tập Toán THCS Việt Nam.
Nhiệm vụ: Phân tích bài làm của học sinh để nhận diện ĐIỂM YẾU KIẾN THỨC cụ thể và đưa ra khuyến nghị nhằm ghi vào Hồ sơ Năng lực (Student Profile).

ĐỊNH DẠNG JSON TRẢ VỀ (KHÔNG MARKDOWN):
{
  "studentSummary": "Nhận xét tổng quan ngắn gọn về lỗ hổng kiến thức...",
  "weaknesses": [
    {
      "knowledgeId": "ma_kien_thuc_tuong_ung",
      "concept": "Tên mảng kiến thức học sinh bị yếu",
      "severity": "high",
      "description": "Mô tả chi tiết lỗ hổng logic hoặc tính toán",
      "recommendation": "Khuyên đọc bài viết hoặc làm bài củng cố cụ thể"
    }
  ],
  "strengths": ["Điểm mạnh ghi nhận được"],
  "profileUpdateTags": ["tag-1", "tag-2"]
}`;

  let promptText = `ĐỀ BÀI BÀI TẬP:\n${typeof problem === 'object' ? JSON.stringify(problem, null, 2) : problem}\n\n`;
  promptText += `BÀI LÀM HỌC SINH:\n${typeof submission === 'object' ? JSON.stringify(submission, null, 2) : submission}\n\n`;
  promptText += `ĐIỂM SỐ: ${score} / ${maxScore || 10}\n\n`;
  if (Array.isArray(mistakes) && mistakes.length > 0) {
    promptText += `DANH SÁCH LỖI SAI PHÁT HIỆN:\n${JSON.stringify(mistakes, null, 2)}\n\n`;
  }
  if (studentProfile) {
    promptText += `HỒ SƠ HỌC SINH HIỆN TẠI:\n${JSON.stringify(studentProfile, null, 2)}\n\n`;
  }

  const parts = [{ text: `${systemInstruction}\n\n${promptText}` }];
  const rawResult = await askGemini(parts, env.GEMINI_API_KEY, { useThinking: true });
  const parsed = parseAndValidateJSON(rawResult);

  return jsonResponse(parsed.data, parsed.success ? 200 : 500);
}

/* ============================================================================
   8. /generate-remedial-lesson — AI Tự tạo bài học củng cố khi không vượt qua
   ========================================================================== */
async function handleGenerateRemedialLesson(body, env) {
  const { lesson, mistakes, studentSolution, score, courseTitle } = body;

  if (!lesson) {
    return jsonResponse({ error: 'Thiếu thông tin bài học (lesson)' }, 400);
  }

  const systemInstruction = `Bạn là Chuyên gia Thiết kế Bài giảng Thích ứng Toán THCS Việt Nam.
Học sinh vừa làm bài tập của bài học "${lesson.title || 'Bài học'}" nhưng KHÔNG ĐẠT (Điểm: ${score || 0}/100).
Nhiệm vụ của bạn: Đọc kỹ nội dung sai của học sinh và TỰ ĐỘNG TẠO MỘT BÀI HỌC CỦNG CỐ CÁ NHÂN HÓA (Remedial Lesson) chèn trực tiếp vào lộ trình khóa học riêng dành cho học sinh đó.

Bài học củng cố phải:
1. Phân tích nguyên nhân lỗi sai mà học sinh gặp phải.
2. Cung cấp lý thuyết củng cố súc tích, trực quan kèm các lưu ý tránh bẫy.
3. Đưa ra 1 bài tập vận dụng mới phù hợp để kiểm tra lại khả năng hiểu bài.

ĐỊNH DẠNG JSON TRẢ VỀ (KHÔNG DÙNG MARKDOWN CODEBLOCK, KHÔNG TEXT DƯ):
{
  "title": "⚡ Bài Củng Cố AI: [Tên chủ đề cần khắc phục]",
  "description": "Bài học củng cố cá nhân hóa giúp bạn nắm vững kiến thức bị hổng ở bài trước",
  "customContent": "### 🎯 Phân tích Lỗi Sai Bài Trước\\n[Giải thích ngắn lý do bài trước bị trừ điểm và cách sửa]\\n\\n### 📖 Lý thuyết Cốt lõi & Quy tắc\\n[Nội dung lý thuyết trọng tâm]\\n\\n### 💡 Ví dụ Mẫu Chữa Lỗi\\n[Ví dụ minh họa chi tiết từng bước]",
  "problem": {
    "title": "Bài tập củng cố cá nhân hóa AI",
    "contentText": "[Đề bài tập toán mới vừa sức để kiểm tra lại]",
    "solution": "[Lời giải chi tiết từng bước]",
    "solutions": ["[Lời giải chi tiết từng bước]"],
    "rubric": [
      {
        "id": "r1",
        "title": "Lời giải & Kết quả toán học",
        "description": "Lập luận đúng quy trình và đưa ra đáp số chính xác",
        "maxScore": 10
      }
    ]
  }
}`;

  let promptText = `BÀI HỌC GỐC: ${JSON.stringify(lesson, null, 2)}\n\n`;
  promptText += `ĐIỂM HỌC SINH ĐẠT ĐƯỢC: ${score} / 100\n\n`;
  if (studentSolution) promptText += `BÀI LÀM CỦA HỌC SINH:\n${studentSolution}\n\n`;
  if (Array.isArray(mistakes) && mistakes.length > 0) {
    promptText += `DANH SÁCH LỖI SAI DO AI PHÁT HIỆN:\n${JSON.stringify(mistakes, null, 2)}\n\n`;
  }
  if (courseTitle) promptText += `KHÓA HỌC: ${courseTitle}\n\n`;

  const parts = [{ text: `${systemInstruction}\n\n${promptText}` }];
  const rawResult = await askGemini(parts, env.GEMINI_API_KEY, { useThinking: true });
  const parsed = parseAndValidateJSON(rawResult);

  return jsonResponse(parsed.data, parsed.success ? 200 : 500);
}

/* ============================================================================
   9. /lesson-chat — AI Chatbot hỗ trợ thắc mắc theo ngữ cảnh từng bài học
   ========================================================================== */
async function handleLessonChat(body, env) {
  const { lessonContext, history, userQuery } = body;

  if (!userQuery) {
    return jsonResponse({ error: 'Thiếu câu hỏi của người dùng (userQuery)' }, 400);
  }

  const systemInstruction = `Bạn là Trợ lý AI MikeMath thân thiện, tâm lý và giỏi sư phạm toán THCS.
Nhiệm vụ: Trả lời câu hỏi của học sinh liên quan trực tiếp đến BÀI HỌC HIỆN TẠI.
Quy tắc:
1. Giải thích dễ hiểu, truyền cảm hứng.
2. Dùng công thức toán LaTeX (inline: $...$, block: $$...$$).
3. Nếu học sinh hỏi gợi ý bài tập, hãy đưa ra manh mối và các bước suy luận chứ KHÔNG đưa thẳng đáp số cuối cùng ngay lập tức.
4. Ngắn gọn, súc tích.

ĐỊNH DẠNG JSON TRẢ VỀ (KHÔNG DÙNG MARKDOWN CODEBLOCK):
{
  "reply": "Nội dung câu trả lời của AI bằng định dạng Markdown kèm công thức KaTeX toán học..."
}`;

  let promptText = `BÀI HỌC HIỆN TẠI:\n${JSON.stringify(lessonContext, null, 2)}\n\n`;
  if (Array.isArray(history) && history.length > 0) {
    promptText += `LỊCH SỬ TRÒ CHUYỆN:\n${JSON.stringify(history.slice(-6), null, 2)}\n\n`;
  }
  promptText += `CÂU HỎI CỦA HỌC SINH:\n${userQuery}`;

  const parts = [{ text: `${systemInstruction}\n\n${promptText}` }];
  const rawResult = await askGemini(parts, env.GEMINI_API_KEY, { useThinking: false });
  const parsed = parseAndValidateJSON(rawResult);

  return jsonResponse(parsed.data, parsed.success ? 200 : 500);
}

/* ============================================================================
   HELPERS — Gemini API & Base64
   ========================================================================== */
async function askGemini(parts, apiKey, options = {}) {
  const { useThinking = false } = options;

  const models = [
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-flash-8b'
  ];

  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const generationConfig = {
        temperature: 0.1,
        responseMimeType: 'application/json'
      };

      const requestBody = {
        contents: [{ parts }],
        generationConfig
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) throw new Error('Gemini không trả về nội dung.');

      console.log(`✓ Model: ${model}`);
      return text;

    } catch (err) {
      console.warn(`✗ Model ${model} thất bại:`, err.message);
      lastError = err;
    }
  }

  throw new Error(`Tất cả Gemini models đều thất bại. Lỗi cuối: ${lastError?.message || 'unknown'}`);
}

async function processImagesToParts(images) {
  const parts = [];
  for (const img of images) {
    const imgUrl = typeof img === 'string' ? img : img?.url;
    if (!imgUrl) continue;

    try {
      const response = await fetch(imgUrl);
      if (!response.ok) continue;

      const mimeType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
      const arrayBuffer = await response.arrayBuffer();
      const base64Data  = arrayBufferToBase64(arrayBuffer);

      parts.push({
        inlineData: { mimeType, data: base64Data }
      });
    } catch (e) {
      console.error(`Lỗi xử lý ảnh:`, e.message);
    }
  }
  return parts;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function cleanMarkdown(rawText = '') {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  }
  return cleaned;
}

function parseAndValidateJSON(rawText) {
  if (!rawText) return { success: false, data: { error: 'AI trả về rỗng' } };
  const cleaned = cleanMarkdown(rawText);
  try {
    const parsed = JSON.parse(cleaned);
    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, data: { error: 'Lỗi parse JSON từ AI', raw: rawText.slice(0, 1000) } };
  }
}

function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin' : '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age'      : '86400'
    }
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type'                : 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin' : '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  });
}
