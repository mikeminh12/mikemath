/**
 * MIKE MATH - ADAPTIVE LEARNING ROADMAP & LESSON STUDY CONTROLLER
 * Handles both courses.html (Roadmap Canvas) & learning.html (Full-Page Study Environment)
 * File: js/learning.js
 */

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { doc, getDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { fetchPublishedCourses, fetchCourseDetailAndLessons } from "./course-engine/course-manager.js";
import { getUserCourseState, processLessonEvaluation } from "./course-engine/adaptive-engine.js";
import { getAllUserKnowledgeProfile, fetchRecommendedKnowledgeArticles } from "./course-engine/learning-profile.js";
import { MASTERY_GATE_THRESHOLD, getMasteryLevel } from "./course-engine/mastery-engine.js";
import { BlockRenderer } from "./knowledge-renderer.js";
import { gradeSubmission, sendLessonChatMessage } from "./ai.js";
import { uploadImages } from "./cloudinary.js";
import { MathEditor } from "./editor/MathEditor.js";
import toast from "/components/toast.js";

// GLOBAL STATE
const state = {
    currentUser: null,
    userId: "demo_student_01",
    courses: [],
    currentCourse: null,
    userCourseState: null,
    userKnowledgeList: [],
    
    // For learning.html mode
    courseId: null,
    lessonId: null,
    lessonsList: [],
    activeLesson: null,
    activeArticle: null,
    linkedProblems: [],
    prevLessonId: null,
    nextLessonId: null
};

document.addEventListener("DOMContentLoaded", async () => {
    initAuthListener();
});

function initAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            state.currentUser = user;
            state.userId = user.uid;
        }

        // Detect page mode
        if (document.getElementById("roadmapContainer")) {
            await initRoadmapPage();
        } else if (document.getElementById("lessonTheoryContainer")) {
            await initLearningPage();
        }
    });
}

// ==========================================
// 1. ROADMAP PAGE MODE (courses.html)
// ==========================================
async function initRoadmapPage() {
    const courseSelect = document.getElementById("courseSelect");
    courseSelect?.addEventListener("change", (e) => {
        if (e.target.value) loadRoadmapCourseData(e.target.value);
    });

    try {
        state.courses = await fetchPublishedCourses();

        if (courseSelect) {
            courseSelect.innerHTML = state.courses.map(c => `
                <option value="${c.id}">${c.grade ? `[Lớp ${c.grade}] ` : ''}${c.title}</option>
            `).join("");
        }

        const urlParams = new URLSearchParams(window.location.search);
        const courseParam = urlParams.get("course");
        const defaultCourseId = courseParam || (state.courses.length > 0 ? state.courses[0].id : null);

        if (defaultCourseId) {
            if (courseSelect) courseSelect.value = defaultCourseId;
            await loadRoadmapCourseData(defaultCourseId);
        }
    } catch (err) {
        console.error("Lỗi khởi tạo danh sách khóa học:", err);
    }
}

async function loadRoadmapCourseData(courseId) {
    const roadmapContainer = document.getElementById("roadmapContainer");
    if (roadmapContainer) {
        roadmapContainer.innerHTML = `<p class="text-muted text-center p-4">⏳ Đang đọc dữ liệu lộ trình thích ứng...</p>`;
    }

    try {
        const [courseDetail, userState, userProfileList] = await Promise.all([
            fetchCourseDetailAndLessons(courseId, state.userId),
            getUserCourseState(state.userId, courseId),
            getAllUserKnowledgeProfile(state.userId)
        ]);

        state.currentCourse = courseDetail;
        state.userCourseState = userState || { completedLessons: [], masteredLessons: [], adaptiveQueue: [] };
        state.userKnowledgeList = userProfileList || [];

        // Resolve human-readable titles for knowledge profile widget
        await resolveKnowledgeTitles(state.userKnowledgeList);

        renderCourseHeaderInfo();
        renderAdaptiveSidebarWidgets();
        renderDuolingoRoadmap();

    } catch (err) {
        console.error("Lỗi khi tải dữ liệu khóa học:", err);
    }
}

async function resolveKnowledgeTitles(profileList = []) {
    if (!Array.isArray(profileList) || profileList.length === 0) return;

    for (const item of profileList) {
        if (item.title || item.knowledgeTitle) {
            item.displayTitle = item.title || item.knowledgeTitle;
            continue;
        }

        const kId = item.knowledgeId;
        if (!kId) {
            item.displayTitle = "Kiến thức toán học";
            continue;
        }

        try {
            let snap = await getDoc(doc(db, "knowledgeArticles", kId));
            if (!snap.exists()) {
                snap = await getDoc(doc(db, "knowledge", kId));
            }

            if (snap.exists() && snap.data()?.title) {
                item.displayTitle = snap.data().title;
                continue;
            }
        } catch (e) {
            console.warn(`Lỗi đọc tiêu đề kiến thức ${kId}:`, e);
        }

        // Clean up fallback for ID like "knowledge_fraction_addition" or "knowledge_17400000"
        let cleanName = kId.replace(/^knowledge_/, "");
        if (/^\d+$/.test(cleanName)) {
            item.displayTitle = `Bài kiến thức #${cleanName.slice(-4)}`;
        } else {
            item.displayTitle = cleanName.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        }
    }
}

function renderCourseHeaderInfo() {
    const c = state.currentCourse;
    if (!c) return;

    if (document.getElementById("courseGradeBadge")) document.getElementById("courseGradeBadge").textContent = `Lớp ${c.grade || 8}`;
    if (document.getElementById("courseLevelBadge")) document.getElementById("courseLevelBadge").textContent = c.level || "Cơ bản - Nâng cao";
    if (document.getElementById("courseEstTime")) document.getElementById("courseEstTime").textContent = `${c.estimatedMinutes || 120} phút`;
    if (document.getElementById("courseTitle")) document.getElementById("courseTitle").textContent = c.title;
    if (document.getElementById("courseDesc")) document.getElementById("courseDesc").textContent = c.description;

    const lessons = c.lessons || [];
    const completedSet = new Set(state.userCourseState?.completedLessons || []);
    const masteredCount = lessons.filter(l => completedSet.has(l.id)).length;
    const progressPercent = lessons.length > 0 ? Math.round((masteredCount / lessons.length) * 100) : 0;

    if (document.getElementById("courseProgressText")) document.getElementById("courseProgressText").textContent = `${progressPercent}%`;
    if (document.getElementById("courseMasteredCount")) document.getElementById("courseMasteredCount").textContent = `${masteredCount}/${lessons.length} Bài`;
    if (document.getElementById("courseProgressBarFill")) document.getElementById("courseProgressBarFill").style.width = `${progressPercent}%`;
}

function renderAdaptiveSidebarWidgets() {
    const queue = state.userCourseState?.adaptiveQueue || [];
    const badgeEl = document.getElementById("adaptiveTaskBadge");
    const containerEl = document.getElementById("adaptiveQueueContainer");

    if (badgeEl) badgeEl.textContent = `${queue.length} Nhiệm vụ`;

    if (containerEl) {
        if (queue.length === 0) {
            containerEl.innerHTML = `<p class="small text-muted mb-0">🎉 Hồ sơ không có lỗi sai. Lộ trình chuẩn đang được duy trì!</p>`;
        } else {
            containerEl.innerHTML = queue.map(q => `
                <div style="background:#fff; border:1.5px solid #ef4444; border-radius:6px; padding:8px 10px; margin-bottom:8px; font-size:0.83rem;">
                    <div style="font-weight:800; color:#dc2626;">⚡ ${BlockRenderer.escapeHtml(q.title || 'Củng cố AI')}</div>
                    <div style="font-size:0.78rem; color:#475569;">${BlockRenderer.escapeHtml(q.reason || '')}</div>
                </div>
            `).join("");
        }
    }

    // Render User Knowledge Profile Widget (Human readable titles, not raw IDs)
    const profileWidget = document.getElementById("knowledgeProfileWidgetList");
    if (profileWidget) {
        if (state.userKnowledgeList.length === 0) {
            profileWidget.innerHTML = `<p class="small text-muted mb-0">Chưa có dữ liệu thành thạo.</p>`;
        } else {
            profileWidget.innerHTML = state.userKnowledgeList.slice(0, 5).map(k => {
                const levelInfo = getMasteryLevel(k.mastery || k.masteryScore || 0);
                const titleText = k.displayTitle || k.knowledgeTitle || k.title || k.knowledgeId;
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; font-size:0.82rem; gap:8px;">
                        <span style="font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:170px;" title="${BlockRenderer.escapeHtml(titleText)}">
                            ${BlockRenderer.escapeHtml(titleText)}
                        </span>
                        <span class="badge" style="background:${levelInfo.bg}; color:${levelInfo.color}; font-size:0.75rem; flex-shrink:0;">${levelInfo.label} (${Math.round(k.mastery || k.masteryScore || 0)}%)</span>
                    </div>
                `;
            }).join("");
        }
    }
}

function renderDuolingoRoadmap() {
    const roadmapContainer = document.getElementById("roadmapContainer");
    if (!roadmapContainer || !state.currentCourse) return;

    const units = state.currentCourse.units || [{ id: "unit_1", title: "Chương 1" }];
    const lessons = state.currentCourse.lessons || [];
    const completedSet = new Set(state.userCourseState?.completedLessons || []);
    
    // NGUYÊN TẮC: Chỉ thay đổi lộ trình khi profile có lỗi sai (tồn tại nhiệm vụ trong adaptiveQueue)
    const adaptiveQueue = state.userCourseState?.adaptiveQueue || [];

    let currentLessonId = state.userCourseState?.currentLessonId;
    if (!currentLessonId && lessons.length > 0) {
        currentLessonId = lessons[0].id;
    }

    let html = "";
    const alignments = ["align-center", "align-offset-left", "align-left", "align-offset-left", "align-center", "align-offset-right", "align-right", "align-offset-right"];

    units.forEach((unit, unitIdx) => {
        html += `
            <div class="duolingo-unit-banner">
                <h3>${BlockRenderer.escapeHtml(unit.title)}</h3>
                <p class="small text-muted mb-0" style="color: #cbd5e1;">${BlockRenderer.escapeHtml(unit.description || '')}</p>
            </div>
        `;

        const unitLessons = lessons.filter(l => (l.unitId || "unit_1") === unit.id || (unitIdx === 0 && !l.unitId));

        unitLessons.forEach((lesson, lIdx) => {
            const isCompleted = completedSet.has(lesson.id);
            const isCurrent = lesson.id === currentLessonId || (!currentLessonId && lIdx === 0);
            
            // Chỉ gắn củng cố adaptive khi profile có lỗi sai thuộc bài học này
            const isAdaptive = adaptiveQueue.some(q => q.lessonId === lesson.id || q.knowledgeId === lesson.knowledgeId);
            
            let isUnlocked = isCompleted || isCurrent || isAdaptive;
            if (lIdx > 0 && !isUnlocked) {
                const prevLesson = unitLessons[lIdx - 1];
                if (completedSet.has(prevLesson.id)) isUnlocked = true;
            }

            let nodeClass = "node-locked";
            let nodeIcon = lesson.icon || "🔒";
            let badgeHtml = "";

            if (isAdaptive) {
                nodeClass = "node-adaptive";
                nodeIcon = "⚡";
                badgeHtml = `<div class="floating-start-badge badge-adaptive">CỦNG CỐ AI</div>`;
            } else if (isCompleted) {
                nodeClass = "node-mastered";
                nodeIcon = "👑";
            } else if (isUnlocked) {
                nodeClass = "node-active";
                nodeIcon = lesson.icon || "⭐";
                badgeHtml = `<div class="floating-start-badge">${isCurrent ? 'BẮT ĐẦU' : 'HỌC TIẾP'}</div>`;
            }

            const alignClass = alignments[(unitIdx * 4 + lIdx) % alignments.length];

            html += `
                <div class="duolingo-node-row ${alignClass}">
                    <div class="duolingo-node-circle ${nodeClass}" 
                         data-id="${lesson.id}" 
                         data-unlocked="${isUnlocked}"
                         title="${BlockRenderer.escapeHtml(lesson.title)}">
                        ${badgeHtml}
                        <span>${nodeIcon}</span>
                    </div>
                </div>
            `;
        });
    });

    roadmapContainer.innerHTML = html;

    // Direct redirection to dedicated full-page learning view on node click!
    roadmapContainer.querySelectorAll(".duolingo-node-circle").forEach(nodeEl => {
        nodeEl.addEventListener("click", (e) => {
            const lessonId = e.currentTarget.dataset.id;
            const isUnlocked = e.currentTarget.dataset.unlocked === "true";
            
            if (!isUnlocked) {
                alert("🔒 Bài học này chưa được mở khóa. Hãy hoàn thành các bài học trước để tiếp tục!");
                return;
            }

            location.href = `learning.html?course=${state.currentCourse.id}&lesson=${lessonId}`;
        });
    });
}

// ==========================================
// 2. DEDICATED FULL-PAGE LEARNING PAGE MODE (learning.html)
// ==========================================
async function initLearningPage() {
    const urlParams = new URLSearchParams(window.location.search);
    state.courseId = urlParams.get("course");
    state.lessonId = urlParams.get("lesson");

    if (!state.courseId) {
        toast.error("Không tìm thấy thông tin khóa học!");
        setTimeout(() => location.href = "courses.html", 1500);
        return;
    }

    try {
        state.course = await fetchCourseDetailAndLessons(state.courseId, state.userId);
        if (!state.course) {
            toast.error("Khóa học không tồn tại!");
            setTimeout(() => location.href = "courses.html", 1500);
            return;
        }

        state.userCourseState = await getUserCourseState(state.userId, state.courseId, state.course.lessons || []);
        state.lessonsList = state.course.lessons || [];

        if (!state.lessonId && state.lessonsList.length > 0) {
            state.lessonId = state.lessonsList[0].id;
        }

        const lessonIndex = state.lessonsList.findIndex(l => l.id === state.lessonId);
        if (lessonIndex !== -1) {
            state.activeLesson = state.lessonsList[lessonIndex];
            state.prevLessonId = lessonIndex > 0 ? state.lessonsList[lessonIndex - 1].id : null;
            
            const completedSet = new Set(state.userCourseState?.completedLessons || []);
            const targetParentId = state.activeLesson.parentLessonId || state.activeLesson.id;
            const remedialLesson = (state.userCourseState?.customLessons || []).find(cl => cl.parentLessonId === targetParentId);

            if (!completedSet.has(state.activeLesson.id) && remedialLesson && remedialLesson.id !== state.activeLesson.id) {
                state.nextLessonId = remedialLesson.id;
            } else {
                state.nextLessonId = lessonIndex < state.lessonsList.length - 1 ? state.lessonsList[lessonIndex + 1].id : null;
            }
        } else if (state.lessonsList.length > 0) {
            state.activeLesson = state.lessonsList[0];
            state.nextLessonId = state.lessonsList.length > 1 ? state.lessonsList[1].id : null;
        }

        bindNavControls();
        renderLessonHeader();
        
        const hasTheory = await loadAndRenderTheory();
        const hasPractice = await loadAndRenderPractice();

        updateSectionHeaders(hasTheory, hasPractice);
        initLessonChatbot();

    } catch (err) {
        console.error("Lỗi khi tải trang bài học:", err);
        toast.error("Có lỗi xảy ra khi tải bài học!");
    }
}

function updateSectionHeaders(hasTheory, hasPractice) {
    const theoryHeader = document.getElementById("theorySectionHeader");
    const practiceHeader = document.getElementById("practiceSectionHeader");

    if (hasTheory && hasPractice) {
        if (theoryHeader) theoryHeader.innerHTML = "📖 Lý Thuyết Bài Học";
        if (practiceHeader) practiceHeader.innerHTML = "✍️ Bài Tập Vận Dụng & Đánh Giá Thành Thạo";
    } else if (hasTheory) {
        if (theoryHeader) theoryHeader.innerHTML = "📖 Lý Thuyết & Kiến Thức Trọng Tâm Bài Học";
    } else if (hasPractice) {
        if (practiceHeader) practiceHeader.innerHTML = "✍️ Bài Tập Vận Dụng & Đánh Giá Thành Thạo";
    } else {
        // Form empty fallback
        const theoryCard = document.getElementById("theorySectionCard");
        const container = document.getElementById("lessonTheoryContainer");
        if (theoryCard && container) {
            theoryCard.style.display = "block";
            if (theoryHeader) theoryHeader.innerHTML = "📖 Nội Dung Bài Học";
            container.innerHTML = `
                <div class="text-center p-4">
                    <h4 style="font-weight:800; color:#0f172a;">${BlockRenderer.escapeHtml(state.activeLesson?.title || 'Bài học')}</h4>
                    <p class="text-muted mb-0">${BlockRenderer.escapeHtml(state.activeLesson?.description || 'Nội dung bài học chưa được cập nhật.')}</p>
                </div>
            `;
        }
    }
}

function bindNavControls() {
    const btnBack = document.getElementById("btnBackToRoadmap");
    const btnPrev = document.getElementById("btnPrevLesson");
    const btnNext = document.getElementById("btnNextLesson");
    const btnNextBanner = document.getElementById("btnNextLessonBanner");
    const courseTitleEl = document.getElementById("courseHeaderTitle");

    if (courseTitleEl && state.course) {
        courseTitleEl.textContent = `🗺️ ${state.course.title} [Lớp ${state.course.grade || 8}]`;
    }

    if (btnBack) {
        btnBack.href = `courses.html?course=${state.courseId}`;
    }

    if (btnPrev) {
        if (state.prevLessonId) {
            btnPrev.disabled = false;
            btnPrev.onclick = () => {
                location.href = `learning.html?course=${state.courseId}&lesson=${state.prevLessonId}`;
            };
        } else {
            btnPrev.disabled = true;
        }
    }

    if (btnNext) {
        if (state.nextLessonId) {
            btnNext.disabled = false;
            btnNext.onclick = () => {
                const completedSet = new Set(state.userCourseState?.completedLessons || []);
                const isCurrentCompleted = state.activeLesson ? completedSet.has(state.activeLesson.id) : false;
                const targetLesson = state.lessonsList.find(l => l.id === state.nextLessonId);

                if (!isCurrentCompleted && targetLesson && !targetLesson.isAiGenerated && targetLesson.id !== state.activeLesson.id) {
                    toast.warning("🔒 Bạn cần hoàn thành bài tập bài học này (đạt từ 80% trở lên) để mở khóa bài tiếp theo!");
                    return;
                }

                location.href = `learning.html?course=${state.courseId}&lesson=${state.nextLessonId}`;
            };
        } else {
            btnNext.disabled = true;
        }
    }

    if (btnNextBanner) {
        btnNextBanner.onclick = () => {
            if (state.nextLessonId) {
                const completedSet = new Set(state.userCourseState?.completedLessons || []);
                const isCurrentCompleted = state.activeLesson ? completedSet.has(state.activeLesson.id) : false;
                const targetLesson = state.lessonsList.find(l => l.id === state.nextLessonId);

                if (!isCurrentCompleted && targetLesson && !targetLesson.isAiGenerated && targetLesson.id !== state.activeLesson.id) {
                    toast.warning("🔒 Bạn cần hoàn thành bài tập bài học này (đạt từ 80% trở lên) để mở khóa bài tiếp theo!");
                    return;
                }

                location.href = `learning.html?course=${state.courseId}&lesson=${state.nextLessonId}`;
            } else {
                location.href = `courses.html?course=${state.courseId}`;
            }
        };
    }
}

function renderLessonHeader() {
    const l = state.activeLesson;
    if (!l) return;

    if (document.getElementById("lessonIcon")) document.getElementById("lessonIcon").textContent = l.icon || (l.isAiGenerated ? "🤖" : "📘");
    if (document.getElementById("lessonTitle")) document.getElementById("lessonTitle").textContent = l.title || "Bài học";
    
    if (document.getElementById("lessonUnitBadge")) {
        const badgeEl = document.getElementById("lessonUnitBadge");
        if (l.isAiGenerated) {
            badgeEl.textContent = "🤖 Củng cố AI Cá nhân hóa";
            badgeEl.style.background = "#e11d48";
            badgeEl.style.color = "#ffffff";
        } else {
            badgeEl.textContent = l.unitId ? `Chương ${l.unitId}` : "Chương 1";
            badgeEl.style.background = "";
            badgeEl.style.color = "";
        }
    }
    
    if (document.getElementById("lessonEstTime")) document.getElementById("lessonEstTime").textContent = `${l.estimatedMinutes || 15} phút`;
    if (document.getElementById("lessonDescription")) document.getElementById("lessonDescription").textContent = l.description || "Nắm vững lý thuyết và hoàn thành bài tập vận dụng bên dưới.";
}

async function loadAndRenderTheory() {
    const sectionCard = document.getElementById("theorySectionCard");
    const container = document.getElementById("lessonTheoryContainer");
    if (!container || !sectionCard) return false;

    const l = state.activeLesson;
    if (!l) {
        sectionCard.style.display = "none";
        return false;
    }

    let contentHtml = "";
    state.activeArticle = null;

    if (l.knowledgeId && !l.isAiGenerated) {
        try {
            let snap = await getDoc(doc(db, "knowledgeArticles", l.knowledgeId));
            if (!snap.exists()) {
                snap = await getDoc(doc(db, "knowledge", l.knowledgeId));
            }

            if (snap.exists()) {
                state.activeArticle = { id: snap.id, ...snap.data() };
                const article = state.activeArticle;

                let blocksHtml = "";
                if (article.summary) {
                    blocksHtml += `
                        <div class="mb-4 p-3" style="background:#f0f9ff; border-left:4px solid #0284c7; border-radius:0 8px 8px 0;">
                            <div style="font-weight:800; color:#0369a1; font-size:0.92rem; margin-bottom:4px;">📌 Tóm Tắt Trọng Tâm:</div>
                            <div style="font-size:0.98rem; line-height:1.6; color:#1e293b;">${BlockRenderer.escapeHtml(article.summary)}</div>
                        </div>
                    `;
                }

                if (Array.isArray(article.blocks) && article.blocks.length > 0) {
                    blocksHtml += BlockRenderer.renderBlocks(article.blocks);
                } else if (article.content) {
                    blocksHtml += `
                        <div class="content-rich-text" style="font-size: 1.05rem; line-height: 1.7;">
                            ${BlockRenderer.escapeHtml(article.content)}
                        </div>
                    `;
                }

                contentHtml = blocksHtml;
            }
        } catch (err) {
            console.warn("Lỗi khi tải bài viết kiến thức:", err);
        }
    }

    if (!contentHtml && l.customContent && l.customContent.trim()) {
        const aiBannerHtml = l.isAiGenerated ? `
            <div class="mb-4 p-3" style="background:#fff1f2; border:2px solid #e11d48; border-radius:10px;">
                <span class="badge mb-2" style="background:#e11d48; color:#fff; font-weight:800; font-size:0.8rem;">🤖 BÀI HỌC CỦNG CỐ CÁ NHÂN HÓA DO AI TỰ ĐỘNG TẠO</span>
                <div style="font-weight:800; color:#9f1239; font-size:0.95rem; margin-top:2px;">📌 Bài học này được AI khởi tạo dựa trên các lỗi sai của bạn ở bài học trước để giúp bạn làm chủ kiến thức!</div>
            </div>
        ` : '';

        contentHtml = `
            <div class="mb-3">
                ${aiBannerHtml}
                <div class="custom-lesson-body" style="font-size: 1.05rem; line-height: 1.7;">${BlockRenderer.formatRichText(l.customContent)}</div>
            </div>
        `;
    }

    if (!contentHtml) {
        // KHÔNG CÓ BÀI GIẢNG TỪ KHO KIẾN THỨC -> ẨN THẺ NÀY VÀ KHÔNG HIỂN THỊ!
        sectionCard.style.display = "none";
        return false;
    }

    sectionCard.style.display = "block";
    container.innerHTML = contentHtml;
    BlockRenderer.typesetMath(container);
    return true;
}

async function loadAndRenderPractice() {
    const sectionCard = document.getElementById("practiceSectionCard");
    const container = document.getElementById("lessonPracticeContainer");
    if (!container || !sectionCard) return false;

    const l = state.activeLesson;
    const article = state.activeArticle;

    state.linkedProblems = [];

    // Nếu là Bài học AI có bài tập thực hành đi kèm (1 bài hoặc danh sách nhiều bài)
    if (l && Array.isArray(l.problems) && l.problems.length > 0) {
        l.problems.forEach((p, idx) => {
            state.linkedProblems.push({
                id: p.id || `prob_${l.id}_${idx + 1}`,
                ...p
            });
        });
    } else if (l && l.problem) {
        state.linkedProblems.push({
            id: l.problemId || `prob_${l.id}`,
            ...l.problem
        });
    }

    const problemIds = [];
    if (article && Array.isArray(article.linkedProblems)) {
        problemIds.push(...article.linkedProblems);
    }
    if (l.problemId && !problemIds.includes(l.problemId) && !l.problem) {
        problemIds.push(l.problemId);
    }

    if (problemIds.length > 0) {
        for (const pid of problemIds) {
            try {
                const psnap = await getDoc(doc(db, "problems", pid));
                if (psnap.exists()) {
                    state.linkedProblems.push({ id: psnap.id, ...psnap.data() });
                }
            } catch (e) {
                console.warn(`Lỗi nạp bài tập ${pid}:`, e);
            }
        }
    }

    if (state.linkedProblems.length === 0) {
        if (l.hasDefaultPractice !== false && !article && !l.isAiGenerated) {
            sectionCard.style.display = "block";
            container.innerHTML = renderDefaultPracticeForm();
            bindDefaultPracticeEvents();
            return true;
        } else {
            // Không có bài tập -> Ẩn thẻ bài tập!
            sectionCard.style.display = "none";
            return false;
        }
    }

    state.problemFilesMap = state.problemFilesMap || {};

    sectionCard.style.display = "block";
    container.innerHTML = state.linkedProblems.map((prob, idx) => `
        <div class="practice-problem-box" id="probBox_${prob.id}">
            <div style="display:flex; justify-content:space-between; align-items:center;" class="mb-2">
                <span class="fw-bold" style="color:var(--primary); font-size:1rem;">🧩 Bài tập #${idx + 1}: ${BlockRenderer.escapeHtml(prob.title || 'Bài tập vận dụng')}</span>
                <span class="badge badge-info">${prob.difficulty || 'medium'}</span>
            </div>
            
            <div style="font-size:1rem; line-height:1.6; color:var(--text-main);" class="mb-3">
                ${prob.contentHtml || BlockRenderer.formatRichText(prob.contentText || prob.content || '')}
            </div>

            <!-- SUBMISSION INPUT OPTIONS: IMAGE UPLOAD & MATH EDITOR -->
            <div class="form-group mb-3">
                <label style="font-weight:800; font-size:0.88rem;" class="mb-1">📸 Tải ảnh bài làm (Chụp hình / Tải tệp từ thiết bị):</label>
                <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;" class="mb-2">
                    <input type="file" id="fileInput_${prob.id}" accept="image/*" multiple style="display:none;">
                    <button type="button" class="btn-secondary btn-trigger-upload" data-pid="${prob.id}" style="padding:7px 14px; font-size:0.85rem; font-weight:800;">
                        <i class="fa-solid fa-camera me-1"></i> Chọn / Chụp ảnh bài làm
                    </button>
                    <span class="small text-muted" id="fileCountText_${prob.id}">Chưa chọn ảnh nào</span>
                </div>
                <div id="imgPreviewGrid_${prob.id}" style="display:flex; flex-wrap:wrap; gap:8px;" class="mb-2"></div>

                <label style="font-weight:800; font-size:0.88rem;" class="mt-2 mb-1">📝 Hoặc nhập lời giải / đáp số bằng Bộ soạn thảo Công thức Toán:</label>
                <div id="solutionEditorContainer_${prob.id}" class="mb-2"></div>
                <textarea id="ansInput_${prob.id}" class="form-control hidden" rows="3"></textarea>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center;">
                <button type="button" class="btn-primary btn-submit-problem" data-pid="${prob.id}">
                    🚀 Gửi Bài & Chấm AI
                </button>
            </div>

            <div id="aiFeedback_${prob.id}" class="ai-feedback-box hidden"></div>
        </div>
    `).join("");

    BlockRenderer.typesetMath(container);

    // Mount MathEditor instances for each problem
    state.problemEditorsMap = {};
    state.linkedProblems.forEach(prob => {
        const editorContainer = document.getElementById(`solutionEditorContainer_${prob.id}`);
        if (editorContainer) {
            state.problemEditorsMap[prob.id] = new MathEditor(`#solutionEditorContainer_${prob.id}`, {
                placeholder: "Nhập lời giải hoặc chọn kí hiệu công thức toán trên thanh công cụ...",
                minHeight: "130px"
            });
        }
    });

    // Bind image upload handlers
    container.querySelectorAll(".btn-trigger-upload").forEach(btn => {
        btn.onclick = (e) => {
            const pid = e.currentTarget.dataset.pid;
            const input = document.getElementById(`fileInput_${pid}`);
            if (input) input.click();
        };
    });

    container.querySelectorAll('input[type="file"]').forEach(input => {
        input.onchange = (e) => {
            const pid = e.target.id.replace("fileInput_", "");
            const files = Array.from(e.target.files).filter(f => f.type.startsWith("image/"));
            if (!state.problemFilesMap[pid]) state.problemFilesMap[pid] = [];
            state.problemFilesMap[pid].push(...files);
            renderImagePreviewsForProblem(pid);
        };
    });

    container.querySelectorAll(".btn-submit-problem").forEach(btn => {
        btn.onclick = async (e) => {
            const pid = e.currentTarget.dataset.pid;
            const prob = state.linkedProblems.find(p => p.id === pid);
            
            const editorInstance = state.problemEditorsMap ? state.problemEditorsMap[pid] : null;
            const ansText = editorInstance 
                ? (editorInstance.getCleanLatex() || editorInstance.getText())
                : (document.getElementById(`ansInput_${pid}`)?.value.trim() || "");

            const imageFiles = state.problemFilesMap[pid] || [];

            if (!ansText && imageFiles.length === 0) {
                return toast.warning("Vui lòng nhập lời giải chữ hoặc tải lên ít nhất 1 ảnh bài làm!");
            }

            await evaluateStudentSubmission(prob, ansText, imageFiles);
        };
    });

    return true;
}

function renderImagePreviewsForProblem(probId) {
    const previewContainer = document.getElementById(`imgPreviewGrid_${probId}`);
    const countText = document.getElementById(`fileCountText_${probId}`);
    if (!previewContainer) return;

    const files = state.problemFilesMap[probId] || [];

    if (countText) {
        countText.textContent = files.length > 0 ? `Đã chọn ${files.length} ảnh` : "Chưa chọn ảnh nào";
    }

    if (files.length === 0) {
        previewContainer.innerHTML = "";
        return;
    }

    previewContainer.innerHTML = files.map((file, idx) => {
        const url = URL.createObjectURL(file);
        return `
            <div style="position:relative; width:75px; height:75px; border:2px solid var(--text-main); border-radius:8px; overflow:hidden; background:#000;">
                <img src="${url}" style="width:100%; height:100%; object-fit:cover;">
                <button type="button" data-pid="${probId}" data-idx="${idx}" class="btn-remove-img" style="position:absolute; top:2px; right:2px; background:rgba(239,68,68,0.9); color:#fff; border:none; border-radius:50%; width:20px; height:20px; font-size:11px; cursor:pointer; line-height:1; display:flex; align-items:center; justify-content:center;">✕</button>
            </div>
        `;
    }).join("");

    previewContainer.querySelectorAll(".btn-remove-img").forEach(btn => {
        btn.onclick = (e) => {
            const pId = e.currentTarget.dataset.pid;
            const index = parseInt(e.currentTarget.dataset.idx, 10);
            if (state.problemFilesMap[pId]) {
                state.problemFilesMap[pId].splice(index, 1);
                renderImagePreviewsForProblem(pId);
            }
        };
    });
}

function renderDefaultPracticeForm() {
    return `
        <div class="practice-problem-box">
            <h4 style="margin-top:0; font-weight:900; color:var(--text-main);">❓ Câu Hỏi Vận Dụng Củng Cố Nhanh</h4>
            <p style="font-size:1rem;">Điều kiện xác định của phân thức đại số $\\frac{2x + 1}{x - 3}$ là gì?</p>

            <div class="radio-group" style="display:flex; flex-direction:column; gap:10px;" class="mb-3">
                <label class="radio-card" style="background:#fff; border:2px solid var(--text-main); padding:10px; border-radius:6px; cursor:pointer; font-weight:700;">
                    <input type="radio" name="optQuiz" value="0"> A. $x \\neq 3$
                </label>
                <label class="radio-card" style="background:#fff; border:2px solid var(--text-main); padding:10px; border-radius:6px; cursor:pointer; font-weight:700;">
                    <input type="radio" name="optQuiz" value="1"> B. $x \\neq -3$
                </label>
                <label class="radio-card" style="background:#fff; border:2px solid var(--text-main); padding:10px; border-radius:6px; cursor:pointer; font-weight:700;">
                    <input type="radio" name="optQuiz" value="2"> C. $x \\neq 0$
                </label>
            </div>

            <button type="button" id="btnSubmitDefaultQuiz" class="btn-primary" style="margin-top:12px;">
                🚀 Kiểm Tra Đáp Án & Nộp Bài
            </button>
        </div>
    `;
}

function bindDefaultPracticeEvents() {
    document.getElementById("btnSubmitDefaultQuiz")?.addEventListener("click", async () => {
        const selected = document.querySelector('input[name="optQuiz"]:checked')?.value;
        if (selected === undefined) {
            return toast.warning("Vui lòng chọn 1 đáp án!");
        }

        const isCorrect = selected === "0";
        const score = isCorrect ? 100 : 40;
        const mistakes = isCorrect ? [] : [{ type: "conceptual", severity: "high", description: "Nhầm lẫn điều kiện xác định của phân thức đại số" }];

        await recordLessonCompletion(score, mistakes);
    });
}

async function evaluateStudentSubmission(problem, answerText, imageFiles = []) {
    const feedbackBox = document.getElementById(`aiFeedback_${problem.id}`);
    if (feedbackBox) {
        feedbackBox.classList.remove("hidden");
        feedbackBox.innerHTML = `
            <div class="text-center p-3">
                <i class="fa-solid fa-spinner fa-spin me-2" style="font-size:1.2rem; color:#0284c7;"></i>
                <span style="font-weight:700; color:#0369a1;">
                    ${imageFiles.length > 0 ? `Đang tải ${imageFiles.length} ảnh lên server và Giáo viên AI đang đọc bài...` : 'Giáo viên AI đang đọc bài làm & chấm điểm theo Rubric...'}
                </span>
            </div>
        `;
    }

    try {
        let uploadedImages = [];
        if (imageFiles.length > 0) {
            const rawUploads = await uploadImages(imageFiles);
            uploadedImages = rawUploads.map(res => ({
                url: res.url || res.secure_url || "",
                publicId: res.publicId || "",
                width: res.width || 0,
                height: res.height || 0,
                bytes: res.bytes || 0
            }));
        }

        const submissionType = imageFiles.length > 0 ? "image" : "text";

        const rubricData = Array.isArray(problem.rubric) && problem.rubric.length > 0 
            ? problem.rubric 
            : [{
                id: "r1",
                title: "Lời giải & Kết quả toán học",
                description: "Học sinh lập luận đúng và tìm ra kết quả toán học tương đương",
                score: 10
            }];

        const sampleSolutions = Array.isArray(problem.solutions) && problem.solutions.length > 0
            ? problem.solutions
            : (problem.solution ? [problem.solution] : []);

        const payload = {
            problem: {
                id: problem.id || "p_lesson",
                title: problem.title || "Bài tập vận dụng bài học",
                content: problem.contentHtml || problem.contentText || problem.content || "",
                solution: problem.solution || "",
                solutions: sampleSolutions
            },
            rubric: rubricData,
            type: submissionType,
            solution: answerText || "",
            images: uploadedImages
        };

        const aiResult = await gradeSubmission(payload);

        let rawScore = aiResult.score ?? 0;
        let score = rawScore <= 10 && rawScore > 0 ? Math.round(rawScore * 10) : Math.round(rawScore);
        const mistakes = Array.isArray(aiResult.mistakes) ? aiResult.mistakes : [];
        const isPassed = score >= MASTERY_GATE_THRESHOLD;

        // Fetch recommended articles combining Option 3 (pre-linked) & Option 1 (AI tags query)
        const recommendedArticles = await fetchRecommendedKnowledgeArticles(problem, aiResult);

        if (feedbackBox) {
            let mistakesHtml = "";
            if (mistakes.length > 0) {
                const mistakeTypeLabels = {
                    conceptual: "💡 Hiểu sai khái niệm",
                    procedural: "⚙️ Sai quy trình / các bước",
                    careless: "⚠️ Bất cẩn / tính toán",
                    incomplete: "📝 Thiếu bước / thiếu kết luận"
                };

                mistakesHtml = `
                    <div class="mt-2 p-2" style="background:#fff; border:1.5px solid #ef4444; border-radius:6px;">
                        <div style="font-weight:800; color:#dc2626; margin-bottom:4px; font-size:0.88rem;">❌ Chi Tiết Lỗi Sai Được AI Nhận Diện:</div>
                        <ul class="mb-0 ps-3" style="font-size:0.85rem; color:#1e293b;">
                            ${mistakes.map(m => `
                                <li>
                                    <strong style="color:#b91c1c;">${mistakeTypeLabels[m.type] || m.type || 'Lỗi'}:</strong> 
                                    ${BlockRenderer.escapeHtml(m.description || '')}
                                </li>
                            `).join("")}
                        </ul>
                    </div>
                `;
            }

            let strengthsHtml = "";
            if (Array.isArray(aiResult.strengths) && aiResult.strengths.length > 0) {
                strengthsHtml = `
                    <div style="font-size:0.83rem; color:#15803d; margin-top:4px;">
                        <strong>✨ Điểm sáng:</strong> ${aiResult.strengths.map(s => BlockRenderer.escapeHtml(s)).join(", ")}
                    </div>
                `;
            }

            let recArticlesHtml = "";
            if (recommendedArticles.length > 0) {
                recArticlesHtml = `
                    <div class="mt-3 p-3" style="background:#fff; border:2px solid #0284c7; border-radius:8px;">
                        <div style="font-weight:900; color:#0369a1; font-size:0.9rem; margin-bottom:8px;">
                            📚 AI Đề Xuất Bài Viết Kiến Thức Nên Ôn Tóm Tắt:
                        </div>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            ${recommendedArticles.map(art => `
                                <div style="display:flex; justify-content:space-between; align-items:center; background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; padding:8px 12px; gap:8px;">
                                    <div>
                                        <div style="font-weight:800; color:#0f172a; font-size:0.88rem;">📘 ${BlockRenderer.escapeHtml(art.title || 'Bài giảng')}</div>
                                        <div style="font-size:0.78rem; color:#475569;">${BlockRenderer.escapeHtml(art.reason || art.summary || '')}</div>
                                    </div>
                                    <a href="knowledge-detail.html?id=${art.id}" target="_blank" class="btn-primary" style="padding:4px 10px; font-size:0.78rem; text-decoration:none; flex-shrink:0;">
                                        Xem Bài &gt;
                                    </a>
                                </div>
                            `).join("")}
                        </div>
                    </div>
                `;
            }

            feedbackBox.style.background = isPassed ? "#dcfce7" : "#fee2e2";
            feedbackBox.style.borderColor = isPassed ? "#16a34a" : "#dc2626";

            feedbackBox.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid ${isPassed ? '#bbf7d0' : '#fca5a5'}; padding-bottom:6px; margin-bottom:8px;">
                    <span style="font-weight:900; font-size:1.05rem; color:${isPassed ? '#15803d' : '#991b1b'};">
                        ${isPassed ? '🎯 AI Chấm: ĐẠT' : '⚠️ AI Chấm: CHƯA ĐẠT'} (${score}/100 Điểm)
                    </span>
                    <span class="badge" style="background:${isPassed ? '#16a34a' : '#dc2626'}; color:#fff; font-size:0.78rem;">
                        ${aiResult.detectedMethod ? `Phương pháp: ${BlockRenderer.escapeHtml(aiResult.detectedMethod)}` : (isPassed ? 'Đã duyệt' : 'Cần củng cố')}
                    </span>
                </div>

                <div style="font-weight:700; color:#0f172a; font-size:0.9rem;" class="mb-1">
                    ${BlockRenderer.escapeHtml(aiResult.feedback || (isPassed ? 'Lời giải chính xác, tư duy tốt!' : 'Cần xem lại bài làm theo gợi ý bên dưới.'))}
                </div>

                ${strengthsHtml}
                ${mistakesHtml}

                ${aiResult.suggestion ? `
                    <div class="mt-2 p-2" style="background:#f0f9ff; border:1.5px solid #0284c7; border-radius:6px; font-size:0.85rem; color:#0369a1;">
                        <strong>📌 Lời khuyên của AI:</strong> ${BlockRenderer.escapeHtml(aiResult.suggestion)}
                    </div>
                ` : ''}

                ${recArticlesHtml}

                ${aiResult.correctAnswer ? `
                    <div class="mt-2 font-mono" style="font-size:0.83rem; color:#334155;">
                        <strong>💡 Đáp số / Lời giải tóm tắt:</strong> ${BlockRenderer.escapeHtml(aiResult.correctAnswer)}
                    </div>
                ` : ''}
            `;
            BlockRenderer.typesetMath(feedbackBox);
        }

        await recordLessonCompletion(score, mistakes, answerText);

    } catch (e) {
        console.error("Lỗi khi chấm bài AI:", e);
        toast.error("Có lỗi xảy ra khi gọi AI chấm bài. Đã chuyển sang chế độ đánh giá dự phòng.");

        const fallbackScore = answerText.trim().length > 10 ? 85 : 50;
        const fallbackMistakes = fallbackScore < 80 ? [{ type: "procedural", description: "Lời giải chưa đủ chi tiết" }] : [];
        await recordLessonCompletion(fallbackScore, fallbackMistakes, answerText);
    }
}

async function recordLessonCompletion(score, aiMistakes = [], answerText = "") {
    if (!state.activeLesson) return;

    try {
        const res = await processLessonEvaluation(
            state.userId,
            state.courseId,
            state.activeLesson,
            score,
            state.lessonsList,
            aiMistakes,
            answerText,
            state.course?.title || ""
        );

        if (res.userCourseState) {
            state.userCourseState = res.userCourseState;
        }

        if (res.isPassed) {
            const banner = document.getElementById("lessonMasterySuccessBanner");
            if (banner) banner.classList.remove("hidden");

            const remedialBanner = document.getElementById("lessonRemedialBanner");
            if (remedialBanner) remedialBanner.classList.add("hidden");

            if (res.nextLessonId) {
                state.nextLessonId = res.nextLessonId;
            }
            bindNavControls();

            toast.success(`🎉 Bạn đã đạt ${score}% và mở khóa bài tiếp theo!`);
        } else {
            const banner = document.getElementById("lessonMasterySuccessBanner");
            if (banner) banner.classList.add("hidden");

            if (res.remedialLesson) {
                // Update memory lessons list with new/updated remedial lesson
                const existingIdx = state.lessonsList.findIndex(l => l.id === res.remedialLesson.id);
                if (existingIdx !== -1) {
                    state.lessonsList[existingIdx] = res.remedialLesson;
                } else {
                    const currentIdx = state.lessonsList.findIndex(l => l.id === state.activeLesson?.id);
                    if (currentIdx !== -1) {
                        state.lessonsList.splice(currentIdx + 1, 0, res.remedialLesson);
                    } else {
                        state.lessonsList.push(res.remedialLesson);
                    }
                }

                // Force nextLessonId to point to the remedial lesson
                state.nextLessonId = res.remedialLesson.id;
                bindNavControls();
            }

            const remedialBanner = document.getElementById("lessonRemedialBanner");
            const remedialDesc = document.getElementById("remedialBannerDesc");
            const btnGo = document.getElementById("btnGoToRemedialLesson");

            if (remedialBanner && res.remedialLesson) {
                remedialBanner.classList.remove("hidden");
                if (remedialDesc) {
                    remedialDesc.innerHTML = `🤖 <strong>AI nhận diện lỗi sai:</strong> Bài làm đạt ${score}%. AI đã tự động sinh bài học củng cố <strong>"${BlockRenderer.escapeHtml(res.remedialLesson.title)}"</strong> và chèn trực tiếp vào lộ trình của bạn!`;
                }

                if (btnGo) {
                    btnGo.onclick = () => {
                        location.href = `learning.html?course=${state.courseId}&lesson=${res.remedialLesson.id}`;
                    };
                }
            }

            toast.warning(`Bạn đạt ${score}%. Bài làm chưa đạt 80%, AI đã tự động tạo bài học củng cố cá nhân hóa!`);
        }
    } catch (err) {
        console.error("Lỗi ghi nhận tiến độ bài học:", err);
    }
}

// ==========================================
// 3. AI LESSON CHATBOT ASSISTANT
// ==========================================
function initLessonChatbot() {
    const btnToggle = document.getElementById("btnToggleChatbot");
    const btnClose = document.getElementById("btnCloseChatbot");
    const container = document.getElementById("aiChatContainer");
    const messagesBox = document.getElementById("chatMessagesBox");
    const inputText = document.getElementById("chatInputText");
    const btnSend = document.getElementById("btnSendChatMessage");
    const subtitleEl = document.getElementById("chatLessonSubtitle");
    const suggestionsBox = document.getElementById("chatSuggestionsBox");

    if (!btnToggle || !container || !messagesBox) return;

    state.chatHistory = state.chatHistory || [];

    btnToggle.onclick = () => {
        container.classList.toggle("hidden");
        if (!container.classList.contains("hidden")) {
            if (subtitleEl && state.activeLesson) {
                subtitleEl.textContent = `Bài: ${state.activeLesson.title || 'Bài học'}`;
            }
            if (messagesBox.children.length === 0) {
                renderWelcomeChatMessage();
            }
            if (inputText) inputText.focus();
        }
    };

    if (btnClose) {
        btnClose.onclick = () => container.classList.add("hidden");
    }

    if (suggestionsBox) {
        suggestionsBox.querySelectorAll(".chat-suggest-chip").forEach(chip => {
            chip.onclick = (e) => {
                const promptText = e.currentTarget.dataset.prompt;
                if (promptText) {
                    if (inputText) inputText.value = promptText;
                    handleSendChatMessage();
                }
            };
        });
    }

    if (btnSend) {
        btnSend.onclick = () => handleSendChatMessage();
    }

    if (inputText) {
        inputText.onkeydown = (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendChatMessage();
            }
        };
    }

    function renderWelcomeChatMessage() {
        const lessonTitle = state.activeLesson?.title || "Bài học";
        messagesBox.innerHTML = `
            <div class="chat-msg msg-ai">
                <div class="msg-bubble">
                    👋 <strong>Chào bạn!</strong> Mình là Trợ lý AI hỗ trợ cho bài <strong>"${BlockRenderer.escapeHtml(lessonTitle)}"</strong>.<br>
                    Bạn có thắc mắc gì về lý thuyết hay hướng dẫn giải bài tập không? Hãy hỏi mình bên dưới nhé! 😊
                </div>
            </div>
        `;
    }

    async function handleSendChatMessage() {
        const query = inputText?.value.trim();
        if (!query) return;

        if (inputText) inputText.value = "";

        // 1. Append User Message
        const userMsgEl = document.createElement("div");
        userMsgEl.className = "chat-msg msg-user";
        userMsgEl.innerHTML = `<div class="msg-bubble">${BlockRenderer.escapeHtml(query)}</div>`;
        messagesBox.appendChild(userMsgEl);
        messagesBox.scrollTop = messagesBox.scrollHeight;

        // 2. Append Typing Indicator
        const typingEl = document.createElement("div");
        typingEl.className = "chat-msg msg-ai";
        typingEl.id = "chatTypingIndicator";
        typingEl.innerHTML = `
            <div class="msg-bubble" style="background:#e0f2fe; border-color:#0284c7; color:#0369a1;">
                <i class="fa-solid fa-circle-notch fa-spin me-2"></i> AI đang đọc bài học & suy nghĩ câu trả lời...
            </div>
        `;
        messagesBox.appendChild(typingEl);
        messagesBox.scrollTop = messagesBox.scrollHeight;

        try {
            const lessonContext = {
                title: state.activeLesson?.title || "",
                description: state.activeLesson?.description || "",
                summary: state.activeArticle?.summary || "",
                customContent: state.activeLesson?.customContent || "",
                linkedProblems: state.linkedProblems.map(p => ({ title: p.title, content: p.contentText || p.content || "" }))
            };

            const response = await sendLessonChatMessage({
                lessonContext,
                history: state.chatHistory,
                userQuery: query
            });

            document.getElementById("chatTypingIndicator")?.remove();

            const aiReplyText = response.reply || response.answer || "Rất tiếc, AI chưa thể trả lời lúc này. Bạn hãy thử lại câu hỏi nhé!";

            state.chatHistory.push({ role: "user", text: query });
            state.chatHistory.push({ role: "model", text: aiReplyText });

            const aiMsgEl = document.createElement("div");
            aiMsgEl.className = "chat-msg msg-ai";
            aiMsgEl.innerHTML = `<div class="msg-bubble">${BlockRenderer.formatRichText(aiReplyText)}</div>`;
            messagesBox.appendChild(aiMsgEl);
            messagesBox.scrollTop = messagesBox.scrollHeight;

            BlockRenderer.typesetMath(aiMsgEl);

        } catch (err) {
            console.error("Lỗi gửi tin nhắn chat AI:", err);
            document.getElementById("chatTypingIndicator")?.remove();

            const errMsgEl = document.createElement("div");
            errMsgEl.className = "chat-msg msg-ai";
            errMsgEl.innerHTML = `<div class="msg-bubble" style="color:#ef4444; border-color:#ef4444;">⚠️ Có lỗi kết nối AI. Vui lòng kiểm tra và thử lại!</div>`;
            messagesBox.appendChild(errMsgEl);
            messagesBox.scrollTop = messagesBox.scrollHeight;
        }
    }
}
