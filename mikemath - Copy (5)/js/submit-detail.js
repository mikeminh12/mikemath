import { db } from "./firebase.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import toast from "/components/toast.js";
import { regradeSubmission } from "./ai.js";

// ==========================================
// 1. Safe DOM Elements Collection
// ==========================================
const DOM = {
    skeletonState: document.getElementById("skeletonState"),
    mainLayout: document.getElementById("mainLayout"),

    // Card 1: Problem Elements
    problemTitle: document.getElementById("problemTitle"),
    problemContent: document.getElementById("problemContent"),
    problemImages: document.getElementById("problemImages"),
    problemAuthor: document.getElementById("problemAuthor"),
    problemGrade: document.getElementById("problemGrade"),
    problemTopic: document.getElementById("problemTopic"),
    problemDifficulty: document.getElementById("problemDifficulty"),

    // Card 2: Student Submission
    submissionImageContainer: document.getElementById("submissionImageContainer"),
    submissionGallery: document.getElementById("submissionGallery"),
    submissionTextContainer: document.getElementById("submissionTextContainer"),
    submissionText: document.getElementById("submissionText"),

    // Card 3: AI Output
    aiConfidence: document.getElementById("aiConfidence"),
    confidenceReason: document.getElementById("confidenceReason"),
    detectedMethod: document.getElementById("detectedMethod"),
    scoreDisplay: document.getElementById("scoreDisplay"),
    scoreBar: document.getElementById("scoreBar"),
    aiFeedback: document.getElementById("aiFeedback"),

    criteriaSection: document.getElementById("criteriaSection"),
    criteriaTbody: document.getElementById("criteriaTbody"),

    sectionStrengths: document.getElementById("sectionStrengths"),
    listStrengths: document.getElementById("listStrengths"),

    sectionMistakes: document.getElementById("sectionMistakes"),
    listMistakes: document.getElementById("listMistakes"),
    listMistakesContainer: document.getElementById("listMistakesContainer"),

    sectionKnowledge: document.getElementById("sectionKnowledge"),
    badgeKnowledge: document.getElementById("badgeKnowledge"),

    sectionSuggestion: document.getElementById("sectionSuggestion"),
    aiSuggestion: document.getElementById("aiSuggestion"),

    sectionCorrectAnswer: document.getElementById("sectionCorrectAnswer"),
    aiCorrectAnswer: document.getElementById("aiCorrectAnswer"),

    // Sidebar Info & Actions
    subCreatedAt: document.getElementById("subCreatedAt"),
    subType: document.getElementById("subType"),
    subStatus: document.getElementById("subStatus"),
    btnRetry: document.getElementById("btnRetry"),
    btnAppeal: document.getElementById("btnAppeal"),
    btnViewProblem: document.getElementById("btnViewProblem"),
    btnProblemList: document.getElementById("btnProblemList"),

    // Modal
    imageModal: document.getElementById("imageModal"),
    modalImage: document.getElementById("modalImage"),
    modalCloseBtn: document.getElementById("modalCloseBtn")
};

// Helper an toàn để gán textContent không gây crash ứng dụng nếu DOM thay đổi
function setSafeText(element, text) {
    if (element) {
        element.textContent = text;
    }
}

// ==========================================
// 2. Global State Management
// ==========================================
const state = {
    submissionId: null,
    problemId: null,
    submission: null,
    problem: null
};

// ==========================================
// 3. Application Entrypoint
// ==========================================
document.addEventListener("DOMContentLoaded", init);

async function init() {
    try {
        parseQueryParams();

        if (!state.submissionId) {
            toast.error("Không tìm thấy mã bài làm (Submission ID).");
            setTimeout(() => location.replace("problems.html"), 1500);
            return; // Dừng tiến trình ngay lập tức
        }

        // Tải submission trước
        const loaded = await loadSubmission();
        if (!loaded) return; // Nếu không tìm thấy submission, dừng ngay không render

        // Đọc problemId trực tiếp từ document submission đã nạp
        if (state.submission?.problemId) {
            state.problemId = state.submission.problemId;
            await loadProblem();
        }

        render();
        bindEvents();

    } catch (err) {
        console.error("Lỗi khởi tạo trang chi tiết:", err);
        toast.error("Đã xảy ra lỗi khi tải dữ liệu.");
    } finally {
        hideSkeleton();
    }
}

// ==========================================
// 4. Data Fetching
// ==========================================
function parseQueryParams() {
    const params = new URLSearchParams(window.location.search);
    // [Cải tiến 15] Chỉ cần đọc id submission, không phụ thuộc query param problem
    state.submissionId = params.get("id");
}

async function loadSubmission() {
    try {
        const snap = await getDoc(doc(db, "submissions", state.submissionId));
        if (!snap.exists()) {
            toast.error("Bài làm không tồn tại hoặc đã bị xóa.");
            setTimeout(() => location.replace("problems.html"), 1500);
            return false; // [Cải tiến 3] Trả về false để dừng init()
        }
        state.submission = { id: snap.id, ...snap.data() };
        return true;
    } catch (err) {
        console.error("Lỗi đọc submission Firestore:", err);
        toast.error("Không thể tải thông tin lượt nộp bài.");
        setTimeout(() => location.replace("problems.html"), 1500);
        return false;
    }
}

async function loadProblem() {
    try {
        const snap = await getDoc(doc(db, "problems", state.problemId));
        if (snap.exists()) {
            state.problem = { id: snap.id, ...snap.data() };
        }
    } catch (err) {
        console.warn("Không thể tải thông tin bài toán gốc:", err);
    }
}

// ==========================================
// 5. Render Core & Sub-components
// ==========================================
function render() {
    renderProblemCard();
    renderSubmissionCard();
    renderAICard();
    renderSidebarInfo();
    triggerMathJax();
}

function renderProblemCard() {
    const prob = state.problem || {};
    const sub = state.submission || {};

    setSafeText(DOM.problemTitle, prob.title || sub.problemTitle || "Bài toán chưa cập nhật");

    // [Cải tiến 8] Xử lý an toàn cho nội dung bài toán
    if (DOM.problemContent) {
        if (prob.content) {
            DOM.problemContent.innerHTML = escapeHtml(prob.content).replace(/\n/g, "<br>");
        } else {
            DOM.problemContent.textContent = "Nội dung đề bài không khả dụng.";
        }
    }

    setSafeText(DOM.problemAuthor, prob.authorName || "Ẩn danh");
    setSafeText(DOM.problemGrade, prob.grade ? `Lớp ${prob.grade}` : "Mọi khối");
    setSafeText(DOM.problemTopic, prob.topic || "Toán");

    // [Cải tiến 6] Mapping đa dạng cho cả Tiếng Anh lẫn Tiếng Việt
    const diffMap = {
        easy: "Dễ",
        medium: "Trung bình",
        hard: "Khó",
        "Dễ": "Dễ",
        "Trung bình": "Trung bình",
        "Khó": "Khó"
    };
    setSafeText(DOM.problemDifficulty, diffMap[prob.difficulty] || "Chưa rõ");

    // Render ảnh đề bài
    if (DOM.problemImages) {
        DOM.problemImages.innerHTML = "";
        if (Array.isArray(prob.images) && prob.images.length > 0) {
            prob.images.forEach(imgData => {
                const src = typeof imgData === "string" ? imgData : imgData?.url;
                if (src) DOM.problemImages.appendChild(createGalleryItem(src, "Ảnh đề bài"));
            });
        }
    }
}

function renderSubmissionCard() {
    const sub = state.submission;
    if (!sub) return;

    // [Cải tiến 4] Bọc tách biệt rõ ràng giữa type="image" và type="text"
    if (sub.type === "image") {
        if (DOM.submissionImageContainer) DOM.submissionImageContainer.classList.remove("hidden");
        if (DOM.submissionTextContainer) DOM.submissionTextContainer.classList.add("hidden");

        if (DOM.submissionGallery) {
            DOM.submissionGallery.innerHTML = "";
            const images = Array.isArray(sub.images) ? sub.images : [];

            if (images.length === 0) {
                DOM.submissionGallery.innerHTML = `<p style="color:#64748b; font-style:italic;">Bài làm không có hình ảnh đính kèm.</p>`;
            } else {
                images.forEach(img => {
                    const url = typeof img === "string" ? img : img?.url;
                    if (url) {
                        DOM.submissionGallery.appendChild(createGalleryItem(url, "Bài làm học sinh"));
                    }
                });
            }
        }
    } else if (sub.type === "text") {
        if (DOM.submissionTextContainer) DOM.submissionTextContainer.classList.remove("hidden");
        if (DOM.submissionImageContainer) DOM.submissionImageContainer.classList.add("hidden");

        if (DOM.submissionText) {
            DOM.submissionText.value = sub.text || sub.solution || "(Không có nội dung văn bản)";
        }
    }
}

function renderAICard() {
    const sub = state.submission;
    if (!sub) return;

    // [Cải tiến 15] Kiểm tra xem AI đã trả dữ liệu hay chưa
    const hasAIData = typeof sub.score === "number" || sub.feedback || (sub.strengths && sub.strengths.length > 0);
    if (!hasAIData) {
        setSafeText(DOM.aiFeedback, "AI chưa hoàn tất trả dữ liệu hoặc gặp sự cố khi chấm bài.");
        return;
    }

    // 1. Score & Bar
    const score = typeof sub.score === "number" ? sub.score : 0;
    setSafeText(DOM.scoreDisplay, score.toFixed(1));
    
    const percentage = Math.min(Math.max((score / 10) * 100, 0), 100);
    if (DOM.scoreBar) {
        DOM.scoreBar.style.width = `${percentage}%`;
        DOM.scoreBar.className = "progress-bar-fill " + getScoreColorClass(score, "bg");
    }

    if (DOM.scoreDisplay) {
        DOM.scoreDisplay.className = "score-number " + getScoreColorClass(score, "text");
    }

    // 2. Confidence & Reason
    let confValue = 90;
    if (typeof sub.confidence === "number") {
        confValue = sub.confidence <= 1 ? Math.round(sub.confidence * 100) : Math.round(sub.confidence);
    }
    setSafeText(DOM.aiConfidence, `Độ tin cậy: ${confValue}%`);
    if (DOM.confidenceReason && sub.confidence_reason) {
        DOM.confidenceReason.textContent = sub.confidence_reason;
    }

    // Detected Method Badge
    if (DOM.detectedMethod && sub.detectedMethod) {
        const methodMap = {
            algebraic: "📐 Đại số",
            geometric: "📏 Hình học",
            arithmetic: "🔢 Số học",
            logical: "🧠 Lập luận logic",
            mixed: "🔀 Hỗn hợp",
            unclear: "❓ Không xác định"
        };
        const text = methodMap[sub.detectedMethod] || sub.detectedMethod;
        DOM.detectedMethod.innerHTML = `<span style="font-size: 0.78rem; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 6px; font-weight: 600;">Cách giải: ${text}</span>`;
    }

    // 3. Feedback General
    setSafeText(DOM.aiFeedback, sub.feedback || "Chưa có nhận xét tổng quan.");

    // Criteria Breakdown Table
    if (DOM.criteriaSection && DOM.criteriaTbody && Array.isArray(sub.criteria) && sub.criteria.length > 0) {
        DOM.criteriaSection.classList.remove("hidden");
        DOM.criteriaTbody.innerHTML = sub.criteria.map(c => {
            const earned = typeof c.earnedScore === 'number' ? c.earnedScore : (c.score || 0);
            const max = typeof c.maxScore === 'number' ? c.maxScore : (c.max || earned);
            const isFull = earned === max;
            const scoreColor = isFull ? "#16a34a" : (earned > 0 ? "#d97706" : "#dc2626");
            return `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 8px; font-weight: 600; color: #334155;">${escapeHtml(c.title || c.id || "Tiêu chí")}</td>
                    <td style="padding: 8px; text-align: center; font-weight: 700; color: ${scoreColor};">${earned}</td>
                    <td style="padding: 8px; text-align: center; color: #64748b;">${max}</td>
                    <td style="padding: 8px; color: #475569;">${escapeHtml(c.comment || c.feedback || "-")}</td>
                </tr>
            `;
        }).join("");
    }

    // 4. Strengths
    renderListSection(DOM.sectionStrengths, DOM.listStrengths, sub.strengths);

    // 5. Mistakes with Taxonomy (high/medium/low severity + concept/procedural/careless type)
    if (DOM.sectionMistakes) {
        if (Array.isArray(sub.mistakes) && sub.mistakes.length > 0) {
            DOM.sectionMistakes.classList.remove("hidden");
            const isObj = typeof sub.mistakes[0] === 'object';
            if (isObj && DOM.listMistakesContainer) {
                const sevBadge = {
                    high: '<span style="background:#fee2e2; color:#991b1b; padding:1px 6px; border-radius:4px; font-size:0.75rem; font-weight:600;">🔴 Nghiêm trọng</span>',
                    medium: '<span style="background:#fef3c7; color:#92400e; padding:1px 6px; border-radius:4px; font-size:0.75rem; font-weight:600;">🟡 Trung bình</span>',
                    low: '<span style="background:#dcfce7; color:#166534; padding:1px 6px; border-radius:4px; font-size:0.75rem; font-weight:600;">🟢 Nhẹ</span>'
                };
                const typeText = {
                    conceptual: "Sai khái niệm",
                    procedural: "Sai quy trình",
                    careless: "Bất cẩn",
                    incomplete: "Thiếu sót"
                };

                DOM.listMistakesContainer.innerHTML = sub.mistakes.map(m => `
                    <div style="background: #fff5f5; border: 1px solid #fed7aa; border-radius: 8px; padding: 10px; margin-bottom: 8px;">
                        <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 4px; flex-wrap: wrap;">
                            ${sevBadge[m.severity] || ''}
                            <span style="font-size: 0.78rem; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; color: #475569; font-weight: 600;">
                                ${typeText[m.type] || m.type || 'Lỗi'}
                            </span>
                            ${m.step ? `<span style="font-size:0.78rem; color:#64748b; font-weight:600;">Bước ${m.step}</span>` : ''}
                        </div>
                        <div style="font-size: 0.88rem; color: #334155;">${escapeHtml(m.description || m.text || JSON.stringify(m))}</div>
                    </div>
                `).join("");
            } else {
                renderListSection(DOM.sectionMistakes, DOM.listMistakes, sub.mistakes);
            }
        }
    }

    // 6. Knowledge Badges
    if (DOM.sectionKnowledge && DOM.badgeKnowledge) {
        if (Array.isArray(sub.knowledge) && sub.knowledge.length > 0) {
            DOM.sectionKnowledge.classList.remove("hidden");
            DOM.badgeKnowledge.innerHTML = "";
            sub.knowledge.forEach(item => {
                const badge = document.createElement("span");
                badge.className = "badge";
                badge.textContent = item; 
                DOM.badgeKnowledge.appendChild(badge);
            });
        }
    }

    // 7. Suggestion
    if (sub.suggestion && DOM.sectionSuggestion) {
        DOM.sectionSuggestion.classList.remove("hidden");
        setSafeText(DOM.aiSuggestion, sub.suggestion);
    }

    // 8. Correct Answer
    if (sub.correctAnswer && DOM.sectionCorrectAnswer) {
        DOM.sectionCorrectAnswer.classList.remove("hidden");
        if (DOM.aiCorrectAnswer) DOM.aiCorrectAnswer.value = sub.correctAnswer;
    }

    // 9. Recommended Knowledge Articles (Phương án 1 + 3)
    if (Array.isArray(sub.recommendedArticles) && sub.recommendedArticles.length > 0 && DOM.sectionSuggestion) {
        let recContainer = document.getElementById("recommendedArticlesContainer");
        if (!recContainer) {
            recContainer = document.createElement("div");
            recContainer.id = "recommendedArticlesContainer";
            recContainer.className = "mt-3 p-3";
            recContainer.style.cssText = "background: #fff; border: 2px solid #0284c7; border-radius: 8px;";
            DOM.sectionSuggestion.parentNode.insertBefore(recContainer, DOM.sectionSuggestion.nextSibling);
        }
        recContainer.innerHTML = `
            <div style="font-weight: 800; color: #0369a1; font-size: 0.9rem; margin-bottom: 8px;">
                📚 AI Đề Xuất Bài Viết Kiến Thức Nên Ôn Tập:
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                ${sub.recommendedArticles.map(art => `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 8px 12px; gap: 8px;">
                        <div>
                            <div style="font-weight: 800; color: #0f172a; font-size: 0.88rem;">📘 ${escapeHtml(art.title)}</div>
                            <div style="font-size: 0.78rem; color: #475569;">${escapeHtml(art.reason || art.summary || '')}</div>
                        </div>
                        <a href="knowledge-detail.html?id=${art.id}" target="_blank" class="btn-primary" style="padding: 4px 10px; font-size: 0.78rem; text-decoration: none; flex-shrink: 0;">
                            Xem Bài &gt;
                        </a>
                    </div>
                `).join("")}
            </div>
        `;
    }
}

function renderSidebarInfo() {
    const sub = state.submission;
    if (!sub) return;

    setSafeText(DOM.subCreatedAt, formatDate(sub.createdAt));
    setSafeText(DOM.subType, sub.type === "image" ? "📷 Tải ảnh" : "✍️ Văn bản/LaTeX");
    setSafeText(DOM.subStatus, sub.status === "completed" ? "Đã hoàn tất" : "Đang xử lý");
}

// ==========================================
// 6. UI Helpers & Event Handlers
// ==========================================
function bindEvents() {
    // Action Buttons
    if (DOM.btnRetry) {
        DOM.btnRetry.addEventListener("click", () => {
            if (state.problemId) {
                location.href = `submit.html?id=${state.problemId}`;
            } else {
                toast.error("Không tìm thấy thông tin bài toán để làm lại.");
            }
        });
    }

    if (DOM.btnAppeal) {
        DOM.btnAppeal.addEventListener("click", () => {
            const card = document.getElementById("appealFormCard");
            if (card) {
                card.classList.remove("hidden");
                card.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        });
    }

    // Bind Appeal Form Card Handlers
    const closeBtn = document.getElementById("btnCloseAppealCard");
    const cancelBtn = document.getElementById("btnCancelAppealCard");
    const submitBtn = document.getElementById("btnSubmitAppealForm");
    const appealCard = document.getElementById("appealFormCard");

    const hideAppealCard = () => {
        if (appealCard) appealCard.classList.add("hidden");
    };

    if (closeBtn) closeBtn.onclick = hideAppealCard;
    if (cancelBtn) cancelBtn.onclick = hideAppealCard;

    // Quick chip buttons
    document.querySelectorAll(".btn-chip-reason").forEach(chip => {
        chip.onclick = (e) => {
            const reason = e.currentTarget.dataset.reason;
            const input = document.getElementById("appealReasonText");
            if (input) {
                input.value = reason;
                input.focus();
            }
        };
    });

    if (submitBtn) {
        submitBtn.onclick = async () => {
            const reasonInput = document.getElementById("appealReasonText");
            const reason = reasonInput?.value.trim();

            if (!reason) {
                return toast.warning("Vui lòng nhập lý do thắc mắc hoặc chọn gợi ý trước khi gửi!");
            }

            const feedbackRes = document.getElementById("appealFeedbackResult");
            if (feedbackRes) {
                feedbackRes.classList.remove("hidden");
                feedbackRes.style.background = "#eff6ff";
                feedbackRes.style.color = "#1e40af";
                feedbackRes.style.border = "1.5px solid #93c5fd";
                feedbackRes.innerHTML = `<i class="fa-solid fa-spinner fa-spin me-2"></i> Giáo viên AI đang đọc lại bài giải và xem xét lý do phúc khảo...`;
            }

            submitBtn.disabled = true;

            try {
                const rubricData = Array.isArray(state.problem?.rubric) && state.problem.rubric.length > 0
                    ? state.problem.rubric
                    : (Array.isArray(state.submission?.criteria) && state.submission.criteria.length > 0
                        ? state.submission.criteria
                        : [{ id: "r1", title: "Lời giải & Kết quả", description: "Lập luận đúng", maxScore: 10 }]);

                const data = await regradeSubmission({
                    problem: state.problem || { title: state.submission?.problemTitle || "Bài tập" },
                    rubric: rubricData,
                    type: state.submission?.type || "text",
                    solution: state.submission?.text || state.submission?.solution || "",
                    images: state.submission?.images || [],
                    previousResult: state.submission,
                    appealReason: reason
                });

                const newScore = typeof data.newScore === "number" ? data.newScore : (data.score ?? state.submission.score);
                const isAccepted = data.appealAccepted === true || newScore > (state.submission.score || 0);

                if (isAccepted) {
                    if (feedbackRes) {
                        feedbackRes.style.background = "#dcfce7";
                        feedbackRes.style.color = "#15803d";
                        feedbackRes.style.border = "1.5px solid #86efac";
                        feedbackRes.innerHTML = `🎉 Phúc khảo thành công! Điểm mới: ${newScore}/10.<br><div style="font-weight:600; margin-top:4px;">${data.appealExplanation || data.feedback || ''}</div>`;
                    }
                    toast.success("Phúc khảo thành công!");

                    state.submission = { 
                        ...state.submission, 
                        ...data, 
                        score: newScore,
                        feedback: data.feedback || state.submission.feedback 
                    };
                    renderAICard();

                    if (state.submissionId) {
                        await updateDoc(doc(db, "submissions", state.submissionId), {
                            score: newScore,
                            feedback: data.feedback || state.submission.feedback,
                            criteria: data.criteria || state.submission.criteria || [],
                            mistakes: data.mistakes || state.submission.mistakes || [],
                            appealAccepted: true,
                            appealReason: reason,
                            appealExplanation: data.appealExplanation || ""
                        });
                    }
                } else {
                    if (feedbackRes) {
                        feedbackRes.style.background = "#fef3c7";
                        feedbackRes.style.color = "#92400e";
                        feedbackRes.style.border = "1.5px solid #fde68a";
                        feedbackRes.innerHTML = `ℹ️ AI xem xét và giữ nguyên kết quả cũ (${state.submission.score}/10).<br><div style="font-weight:600; margin-top:4px;">${data.appealExplanation || data.feedback || 'Không có sự thay đổi về điểm số.'}</div>`;
                    }
                    toast.info("AI đã giữ nguyên kết quả.");
                }

            } catch (err) {
                console.error("Lỗi khi phúc khảo:", err);
                if (feedbackRes) {
                    feedbackRes.style.background = "#fee2e2";
                    feedbackRes.style.color = "#991b1b";
                    feedbackRes.style.border = "1.5px solid #fca5a5";
                    feedbackRes.textContent = "Không thể hoàn tất phúc khảo: " + err.message;
                }
                toast.error("Lỗi khi gửi yêu cầu phúc khảo!");
            } finally {
                submitBtn.disabled = false;
            }
        };
    }

    if (DOM.btnViewProblem) {
        DOM.btnViewProblem.addEventListener("click", () => {
            if (state.problemId) {
                location.href = `problem-detail.html?id=${state.problemId}`;
            } else {
                toast.error("Không tìm thấy mã bài toán gốc.");
            }
        });
    }

    if (DOM.btnProblemList) {
        DOM.btnProblemList.addEventListener("click", () => {
            location.href = "problems.html";
        });
    }

    // Modal Events
    if (DOM.modalCloseBtn) DOM.modalCloseBtn.addEventListener("click", closeModal);
    if (DOM.imageModal) {
        DOM.imageModal.addEventListener("click", (e) => {
            if (e.target === DOM.imageModal) closeModal();
        });
    }

    // [Cải tiến 10] Bổ sung phím Escape để đóng Modal
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && DOM.imageModal && DOM.imageModal.classList.contains("active")) {
            closeModal();
        }
    });
}

function createGalleryItem(url, altText = "Hình ảnh") {
    const div = document.createElement("div");
    div.className = "gallery-item";
    
    const img = document.createElement("img");
    img.src = url;
    img.alt = altText;
    
    // [Cải tiến 11] Bổ sung lazy loading và async decoding
    img.loading = "lazy";
    img.decoding = "async";

    // [Cải tiến 12] Xử lý fallback ảnh lỗi
    img.onerror = () => {
        img.onerror = null; // Chống lặp vô hạn nếu ảnh fallback cũng hỏng
        img.src = "/assets/image-error.png";
        img.alt = "Ảnh không tải được";
    };

    div.appendChild(img);
    div.addEventListener("click", () => openModal(url));
    return div;
}

function openModal(url) {
    if (DOM.modalImage && DOM.imageModal) {
        DOM.modalImage.src = url;
        DOM.imageModal.classList.add("active");
    }
}

function closeModal() {
    if (DOM.modalImage && DOM.imageModal) {
        DOM.imageModal.classList.remove("active");
        DOM.modalImage.src = "";
    }
}

// [Cải tiến 9] Thang điểm phân loại chi tiết hơn
function getScoreColorClass(score, type = "text") {
    const prefix = type === "bg" ? "bg-" : "score-";
    if (score >= 9) return `${prefix}green`;   // A+ / Tốt
    if (score >= 8) return `${prefix}green`;   // Giỏi
    if (score >= 6.5) return `${prefix}blue`;  // Khá
    if (score >= 5) return `${prefix}yellow`;  // Trung bình
    return `${prefix}red`;                     // Yếu / Cần cố gắng
}

function renderListSection(containerEl, listEl, items) {
    if (containerEl && listEl) {
        if (Array.isArray(items) && items.length > 0) {
            containerEl.classList.remove("hidden");
            listEl.innerHTML = "";
            items.forEach(text => {
                const li = document.createElement("li");
                li.textContent = text;
                listEl.appendChild(li);
            });
        }
    }
}

function hideSkeleton() {
    if (DOM.skeletonState) DOM.skeletonState.classList.add("hidden");
    if (DOM.mainLayout) DOM.mainLayout.classList.remove("hidden");
}

function formatDate(timestamp) {
    if (!timestamp) return "Mới đây";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function escapeHtml(str = "") {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// [Cải tiến 13] Reset MathJax trước khi Typeset
async function triggerMathJax() {
    if (window.MathJax) {
        try {
            window.MathJax.typesetClear?.();
            if (window.MathJax.typesetPromise) {
                await window.MathJax.typesetPromise();
            }
        } catch (err) {
            console.warn("MathJax typeset error:", err);
        }
    }
}