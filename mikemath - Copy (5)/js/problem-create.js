// ==========================================
// 1. ALL IMPORTS MUST BE AT THE TOP
// ==========================================
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    collection, 
    addDoc, 
    updateDoc,
    getDocs, 
    query, 
    where, 
    limit,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import toast from "/components/toast.js";
import { uploadImages } from "./cloudinary.js";
import { generateRubric } from "./ai.js";
import { MathEditor } from './editor/MathEditor.js';

// ==========================================
// 2. DOM ELEMENTS & INSTANCES
// ==========================================
const form = document.getElementById("problemForm");
const submitBtn = document.getElementById("submitBtn");

const topicSelect = document.getElementById("topicSelect");
const customTopicContainer = document.getElementById("customTopicContainer");
const customTopicInput = document.getElementById("customTopic");

const problemImageInput = document.getElementById("problemImageInput");
const problemImagePreview = document.getElementById("problemImagePreview");

const solutionImageInput = document.getElementById("solutionImageInput");
const solutionImagePreview = document.getElementById("solutionImagePreview");

// Edit Mode DOM Elements
const pageTitle = document.getElementById("pageTitle");
const editingStatusBadge = document.getElementById("editingStatusBadge");
const btnHeaderNewProblem = document.getElementById("btnHeaderNewProblem");
const btnSidebarNewProblem = document.getElementById("btnSidebarNewProblem");
const btnCancelEdit = document.getElementById("btnCancelEdit");
const searchMyProblemsInput = document.getElementById("searchMyProblemsInput");
const myProblemsListContainer = document.getElementById("myProblemsListContainer");

// Option Tabs & Panels
const tabManual = document.getElementById("tabManual");
const tabAI = document.getElementById("tabAI");
const panelManual = document.getElementById("panelManual");
const panelAI = document.getElementById("panelAI");

// Manual Rubric Elements
const manualRubricList = document.getElementById("manualRubricList");
const btnAddManualRow = document.getElementById("btnAddManualRow");
const lblManualTotal = document.getElementById("lblManualTotal");
const warnManualScore = document.getElementById("warnManualScore");

// Extra Solutions Elements
const extraSolutionsContainer = document.getElementById("extraSolutionsContainer");
const btnAddSolution = document.getElementById("btnAddSolution");

// Related Knowledge Elements
const searchKnowledgeInput = document.getElementById("searchKnowledgeInput");
const knowledgeArticlesGrid = document.getElementById("knowledgeArticlesGrid");

// Rubric Elements (AI Template)
const rubricTemplatesContainer = document.getElementById("rubricTemplatesContainer");
const btnGenerateAiRubric = document.getElementById("btnGenerateAiRubric");
const rubricPreviewCard = document.getElementById("rubricPreviewCard");
const generatedRubricList = document.getElementById("generatedRubricList");
const btnAddRubricRow = document.getElementById("btnAddRubricRow");
const lblTotalRubricScore = document.getElementById("lblTotalRubricScore");

// App State
let currentUser = null;
let currentProfile = null;

let editingProblemId = null;
let userProblemsCache = [];
let existingProblemImages = [];
let existingSolutionImages = [];

let problemFiles = [];
let solutionFiles = [];
let loadedRubricTemplates = []; 
let loadedKnowledgeArticles = [];
let generatedRubricState = [];  

let activeRubricMode = 'manual'; // 'manual' | 'ai'
let manualRubricState = [
    { id: 'm1', title: 'Nêu hướng giải & lập luận ban đầu', description: 'Nêu đúng cách tiếp cận, phương pháp hoặc giả thiết', score: 2, knowledge: [] },
    { id: 'm2', title: 'Các bước biến đổi / tính toán chính', description: 'Thực hiện phép tính logic, chính xác từng bước', score: 6, knowledge: [] },
    { id: 'm3', title: 'Kết quả cuối cùng & Kết luận', description: 'Đáp số đúng, kết luận rõ ràng', score: 2, knowledge: [] }
];
let extraSolutionsState = [];
let extraSolutionsEditors = new Map();

// Khai báo biến chứa bộ soạn thảo MathEditor
let contentEditor = null;
let solutionEditor = null;

// ==========================================
// 3. INITIALIZATION & SECURITY CHECK
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initRubricTabs();
    renderManualRubric();
    renderExtraSolutions();

    // Khởi tạo MathEditor cho Đề bài & Lời giải
    if (document.querySelector('#problem-editor-container')) {
        contentEditor = new MathEditor('#problem-editor-container', {
            placeholder: 'Nhập chi tiết nội dung đề bài toán...',
            minHeight: '180px'
        });
    }

    if (document.querySelector('#solution-editor-container')) {
        solutionEditor = new MathEditor('#solution-editor-container', {
            placeholder: 'Nhập lời giải chi tiết (nếu có)...',
            minHeight: '180px'
        });
    }

    // Sự kiện nút Tạo Mới & Hủy Sửa
    btnSidebarNewProblem?.addEventListener("click", resetToCreateMode);
    btnHeaderNewProblem?.addEventListener("click", resetToCreateMode);
    btnCancelEdit?.addEventListener("click", resetToCreateMode);

    // Lọc danh sách bài tập của bạn
    searchMyProblemsInput?.addEventListener("input", (e) => {
        const kw = (e.target.value || "").toLowerCase().trim();
        const filtered = userProblemsCache.filter(p => {
            return !kw || (p.title || "").toLowerCase().includes(kw) || (p.topic || "").toLowerCase().includes(kw);
        });
        renderMyProblemsList(filtered);
    });

    // Kiểm tra quyền và ngưỡng điểm đăng bài
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            toast.error("Vui lòng đăng nhập để thực hiện chức năng này.");
            setTimeout(() => window.location.href = "login.html", 1200);
            return;
        }

        currentUser = user;

        try {
            const [sysSnap, userSnap] = await Promise.all([
                getDoc(doc(db, "settings", "system")),
                getDoc(doc(db, "users", user.uid))
            ]);

            if (!userSnap.exists()) {
                toast.error("Không tìm thấy thông tin người dùng.");
                location.href = "dashboard.html";
                return;
            }

            currentProfile = userSnap.data();

            const isAdminOrTeacher = currentProfile.role === "admin" || currentProfile.role === "teacher";
            const minScore = sysSnap.exists() ? (sysSnap.data().minScoreCreateProblem ?? 200) : 200;
            const userScore = currentProfile.totalScore || 0;

            if (!isAdminOrTeacher && userScore < minScore) {
                toast.error(`Bạn cần đạt tối thiểu ${minScore} điểm để đăng bài tập. (Hiện tại: ${userScore} điểm)`);
                setTimeout(() => {
                    window.location.href = "problems.html";
                }, 1000);
                return;
            }

            // Tải dữ liệu ban đầu
            await Promise.all([
                loadTopicsToSelect(),
                loadRubricTemplates(),
                loadKnowledgeArticles()
            ]);

            // Tải danh sách bài tập đã đăng
            await loadMyProblems();

            // Nếu URL có ?id=... thì nạp bài tập đó để sửa
            const urlParams = new URLSearchParams(window.location.search);
            const urlProblemId = urlParams.get("id");
            if (urlProblemId) {
                await selectProblemToEdit(urlProblemId);
            }

        } catch (err) {
            console.error("Lỗi bảo mật đăng bài:", err);
            toast.error("Không thể xác minh quyền đăng bài!");
            window.location.href = "problems.html";
        }
    });
});

// ==========================================
// 4. MY PROBLEMS & EDIT MODE HANDLERS
// ==========================================
async function loadMyProblems() {
    if (!myProblemsListContainer) return;
    myProblemsListContainer.innerHTML = `<span style="font-size: 0.85rem; color: #64748b; padding: 6px;">⏳ Đang tải bài tập...</span>`;

    try {
        let docs = [];
        if (currentProfile?.role === "admin") {
            const snap = await getDocs(query(collection(db, "problems"), limit(100)));
            docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.deleted);
        } else {
            const snap = await getDocs(query(collection(db, "problems"), where("authorId", "==", currentUser.uid)));
            docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.deleted);
        }

        docs.sort((a, b) => {
            const tA = a.createdAt?.seconds || a.updatedAt?.seconds || 0;
            const tB = b.createdAt?.seconds || b.updatedAt?.seconds || 0;
            return tB - tA;
        });

        userProblemsCache = docs;
        renderMyProblemsList(docs);
    } catch (e) {
        console.error("Lỗi tải danh sách bài tập của bạn:", e);
        myProblemsListContainer.innerHTML = `<span style="font-size: 0.85rem; color: #ef4444; padding: 6px;">Lỗi tải danh sách bài tập.</span>`;
    }
}

function renderMyProblemsList(docs) {
    if (!myProblemsListContainer) return;

    if (!docs || docs.length === 0) {
        myProblemsListContainer.innerHTML = `<span style="font-size: 0.85rem; color: #94a3b8; padding: 6px;">Bạn chưa đăng bài tập nào.</span>`;
        return;
    }

    myProblemsListContainer.innerHTML = docs.map(p => {
        const isEditing = editingProblemId === p.id;
        const diffText = p.difficulty === 'easy' ? 'Dễ' : (p.difficulty === 'hard' ? 'Khó' : 'TB');

        return `
            <div class="my-problem-item ${isEditing ? 'active' : ''}" data-id="${p.id}" style="padding: 10px 12px; border: 1px solid ${isEditing ? '#2563eb' : '#e2e8f0'}; background: ${isEditing ? '#eff6ff' : '#f8fafc'}; border-radius: 8px; cursor: pointer; transition: all 0.15s ease;">
                <div style="font-weight: 700; font-size: 0.88rem; color: #1e293b; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(p.title)}">
                    ${escapeHtml(p.title || 'Bài tập không tên')}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; color: #64748b;">
                    <span>Lớp ${p.grade || 8} • ${diffText} ${p.topic ? '• ' + escapeHtml(p.topic) : ''}</span>
                    <span style="color: #2563eb; font-weight: 600;"><i class="fa-solid fa-pen"></i> ${isEditing ? 'Đang sửa' : 'Sửa'}</span>
                </div>
            </div>
        `;
    }).join("");

    myProblemsListContainer.querySelectorAll(".my-problem-item").forEach(item => {
        item.addEventListener("click", () => {
            const probId = item.dataset.id;
            selectProblemToEdit(probId);
        });
    });
}

async function selectProblemToEdit(problemId) {
    if (!problemId) return;

    try {
        setLoadingState(true);
        let prob = userProblemsCache.find(p => p.id === problemId);

        if (!prob) {
            const snap = await getDoc(doc(db, "problems", problemId));
            if (!snap.exists()) {
                toast.error("Không tìm thấy bài tập để chỉnh sửa!");
                setLoadingState(false);
                return;
            }
            prob = { id: snap.id, ...snap.data() };
        }

        editingProblemId = problemId;

        // Cập nhật URL trình duyệt dạng ?id=... mà không reload
        const newUrl = `${window.location.pathname}?id=${problemId}`;
        window.history.pushState({ path: newUrl }, '', newUrl);

        // Cập nhật Tiêu đề và Nút bấm UI
        if (pageTitle) pageTitle.textContent = "Chỉnh sửa bài tập";
        if (editingStatusBadge) {
            editingStatusBadge.style.display = "inline-flex";
            editingStatusBadge.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Đang sửa: ${escapeHtml(prob.title || problemId)}`;
        }
        if (btnHeaderNewProblem) btnHeaderNewProblem.style.display = "inline-block";
        if (btnCancelEdit) btnCancelEdit.style.display = "inline-block";
        if (submitBtn) submitBtn.textContent = "💾 Cập nhật bài tập";

        // 1. Điền các trường cơ bản
        document.getElementById("title").value = prob.title || "";
        document.getElementById("grade").value = prob.grade || "";
        document.getElementById("difficulty").value = prob.difficulty || "";
        document.getElementById("visibilitySelect").value = prob.visibility || "public";

        // 2. Điền Chủ đề
        if (topicSelect) {
            let topicFound = false;
            for (let i = 0; i < topicSelect.options.length; i++) {
                if (topicSelect.options[i].value === prob.topic) {
                    topicSelect.selectedIndex = i;
                    topicFound = true;
                    break;
                }
            }
            if (!topicFound && prob.topic) {
                topicSelect.value = "custom";
                customTopicContainer.classList.remove("hidden");
                customTopicInput.value = prob.topic;
                customTopicInput.required = true;
            } else {
                customTopicContainer.classList.add("hidden");
                customTopicInput.value = "";
                customTopicInput.required = false;
            }
        }

        // 3. Điền Nội dung Đề bài
        if (contentEditor) {
            if (prob.content && typeof prob.content === "object" && Object.keys(prob.content).length > 0) {
                contentEditor.setContent(prob.content);
            } else if (prob.contentText) {
                contentEditor.setContent(prob.contentText);
            } else if (prob.contentHtml) {
                contentEditor.setContent(prob.contentHtml);
            } else {
                contentEditor.setContent("");
            }
        }

        // 4. Điền Lời giải mẫu
        if (solutionEditor) {
            if (prob.solution && typeof prob.solution === "object" && Object.keys(prob.solution).length > 0) {
                solutionEditor.setContent(prob.solution);
            } else if (prob.solutionText) {
                solutionEditor.setContent(prob.solutionText);
            } else if (prob.solutionHtml) {
                solutionEditor.setContent(prob.solutionHtml);
            } else {
                solutionEditor.setContent("");
            }
        }

        // 5. Ảnh hiện có
        existingProblemImages = Array.isArray(prob.images) ? [...prob.images] : [];
        existingSolutionImages = Array.isArray(prob.solutionImages) ? [...prob.solutionImages] : [];
        problemFiles = [];
        solutionFiles = [];
        if (problemImageInput) problemImageInput.value = "";
        if (solutionImageInput) solutionImageInput.value = "";
        if (problemImagePreview) problemImagePreview.innerHTML = "";
        if (solutionImagePreview) solutionImagePreview.innerHTML = "";

        renderExistingImages(existingProblemImages, "existingProblemImagePreview", "existingProblemImageContainer", removeExistingProblemImage);
        renderExistingImages(existingSolutionImages, "existingSolutionImagePreview", "existingSolutionImageContainer", removeExistingSolutionImage);

        // 6. Các cách giải khác
        extraSolutionsState = [];
        if (Array.isArray(prob.extraSolutions) && prob.extraSolutions.length > 0) {
            prob.extraSolutions.forEach((item, idx) => {
                const solId = "extra_sol_" + Date.now() + "_" + idx;
                extraSolutionsState.push({
                    id: solId,
                    content: item.contentText || "",
                    contentData: item.content || item.contentText || ""
                });
            });
        } else if (Array.isArray(prob.solutions) && prob.solutions.length > 1) {
            for (let i = 1; i < prob.solutions.length; i++) {
                const solId = "extra_sol_" + Date.now() + "_" + i;
                extraSolutionsState.push({
                    id: solId,
                    content: prob.solutions[i],
                    contentData: prob.solutions[i]
                });
            }
        }
        renderExtraSolutions();

        // 7. Bài viết kiến thức liên quan
        const relKnowSet = new Set(prob.relatedKnowledge || []);
        document.querySelectorAll(".chk-knowledge-article").forEach(chk => {
            chk.checked = relKnowSet.has(chk.value);
        });

        // 8. Cấu hình Rubric
        activeRubricMode = prob.rubricMode || "manual";
        if (activeRubricMode === "ai") {
            tabAI?.classList.add("active");
            tabManual?.classList.remove("active");
            panelAI?.classList.add("active");
            panelManual?.classList.remove("active");

            const tmplIds = new Set(prob.rubricTemplateIds || (prob.rubricTemplateId ? [prob.rubricTemplateId] : []));
            document.querySelectorAll(".chk-rubric-template").forEach(chk => {
                chk.checked = tmplIds.has(chk.value);
            });

            generatedRubricState = Array.isArray(prob.rubric) ? JSON.parse(JSON.stringify(prob.rubric)) : [];
            renderRubricEditor();
            if (rubricPreviewCard) rubricPreviewCard.style.display = generatedRubricState.length > 0 ? "block" : "none";
        } else {
            tabManual?.classList.add("active");
            tabAI?.classList.remove("active");
            panelManual?.classList.add("active");
            panelAI?.classList.remove("active");

            manualRubricState = Array.isArray(prob.rubric) && prob.rubric.length > 0 
                ? JSON.parse(JSON.stringify(prob.rubric))
                : [
                    { id: 'm1', title: 'Nêu hướng giải & lập luận ban đầu', description: '', score: 2, knowledge: [] },
                    { id: 'm2', title: 'Các bước biến đổi / tính toán chính', description: '', score: 6, knowledge: [] },
                    { id: 'm3', title: 'Kết quả cuối cùng & Kết luận', description: '', score: 2, knowledge: [] }
                ];
            renderManualRubric();
        }

        // Highlight danh sách bên sidebar
        renderMyProblemsList(userProblemsCache);

        toast.info(`Đã nạp bài tập: ${prob.title}`);

    } catch (err) {
        console.error("Lỗi nạp bài tập để sửa:", err);
        toast.error("Lỗi nạp thông tin bài tập.");
    } finally {
        setLoadingState(false);
    }
}

function resetToCreateMode() {
    editingProblemId = null;

    // Reset URL
    if (window.location.search) {
        window.history.pushState({ path: window.location.pathname }, '', window.location.pathname);
    }

    // Reset Tiêu đề & Nút bấm UI
    if (pageTitle) pageTitle.textContent = "Đăng bài tập mới";
    if (editingStatusBadge) editingStatusBadge.style.display = "none";
    if (btnHeaderNewProblem) btnHeaderNewProblem.style.display = "none";
    if (btnCancelEdit) btnCancelEdit.style.display = "none";
    if (submitBtn) submitBtn.textContent = "Đăng bài tập";

    // Reset Form
    if (form) form.reset();
    if (customTopicContainer) customTopicContainer.classList.add("hidden");

    // Reset Soạn thảo
    if (contentEditor) contentEditor.setContent("");
    if (solutionEditor) solutionEditor.setContent("");

    // Reset Ảnh
    existingProblemImages = [];
    existingSolutionImages = [];
    problemFiles = [];
    solutionFiles = [];
    if (problemImageInput) problemImageInput.value = "";
    if (solutionImageInput) solutionImageInput.value = "";
    if (problemImagePreview) problemImagePreview.innerHTML = "";
    if (solutionImagePreview) solutionImagePreview.innerHTML = "";
    renderExistingImages([], "existingProblemImagePreview", "existingProblemImageContainer", removeExistingProblemImage);
    renderExistingImages([], "existingSolutionImagePreview", "existingSolutionImageContainer", removeExistingSolutionImage);

    // Reset Cách giải khác
    extraSolutionsState = [];
    renderExtraSolutions();

    // Reset Kiến thức liên quan
    document.querySelectorAll(".chk-knowledge-article").forEach(chk => chk.checked = false);

    // Reset Rubric
    activeRubricMode = "manual";
    tabManual?.classList.add("active");
    tabAI?.classList.remove("active");
    panelManual?.classList.add("active");
    panelAI?.classList.remove("active");
    document.querySelectorAll(".chk-rubric-template").forEach(chk => chk.checked = false);

    manualRubricState = [
        { id: 'm1', title: 'Nêu hướng giải & lập luận ban đầu', description: 'Nêu đúng cách tiếp cận, phương pháp hoặc giả thiết', score: 2, knowledge: [] },
        { id: 'm2', title: 'Các bước biến đổi / tính toán chính', description: 'Thực hiện phép tính logic, chính xác từng bước', score: 6, knowledge: [] },
        { id: 'm3', title: 'Kết quả cuối cùng & Kết luận', description: 'Đáp số đúng, kết luận rõ ràng', score: 2, knowledge: [] }
    ];
    renderManualRubric();

    generatedRubricState = [];
    if (rubricPreviewCard) rubricPreviewCard.style.display = "none";

    // Update Sidebar Highlight
    renderMyProblemsList(userProblemsCache);
}

// ==========================================
// 5. DATA LOADERS
// ==========================================
async function loadKnowledgeArticles() {
    if (!knowledgeArticlesGrid) return;
    try {
        const snapshot = await getDocs(collection(db, "knowledgeArticles"));
        if (snapshot.empty) {
            knowledgeArticlesGrid.innerHTML = `<span style="font-size:0.85rem; color:#64748b; padding:6px;">Chưa có bài viết kiến thức nào trong thư viện.</span>`;
            return;
        }

        loadedKnowledgeArticles = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
        }));

        renderKnowledgeArticlesList("");
    } catch (e) {
        console.error("Lỗi khi tải Thư viện kiến thức:", e);
        knowledgeArticlesGrid.innerHTML = `<span style="font-size:0.85rem; color:#ef4444; padding:6px;">Lỗi tải bài viết kiến thức.</span>`;
    }
}

function renderKnowledgeArticlesList(keyword = "") {
    if (!knowledgeArticlesGrid) return;
    const kw = keyword.toLowerCase().trim();

    const filtered = loadedKnowledgeArticles.filter(art => {
        return !kw || (art.title || "").toLowerCase().includes(kw) || (art.summary || "").toLowerCase().includes(kw);
    });

    if (filtered.length === 0) {
        knowledgeArticlesGrid.innerHTML = `<span style="font-size:0.85rem; color:#94a3b8; padding:6px;">Không tìm thấy bài viết kiến thức phù hợp.</span>`;
        return;
    }

    knowledgeArticlesGrid.innerHTML = filtered.map(art => `
        <label class="template-item" title="${escapeHtml(art.summary || art.title)}">
            <input type="checkbox" class="chk-knowledge-article" value="${art.id}">
            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📖 ${escapeHtml(art.title)}</span>
        </label>
    `).join("");
}

searchKnowledgeInput?.addEventListener("input", (e) => {
    renderKnowledgeArticlesList(e.target.value);
});

async function loadRubricTemplates() {
    if (!rubricTemplatesContainer) return;

    try {
        const snapshot = await getDocs(collection(db, "rubricTemplates"));
        if (snapshot.empty) {
            rubricTemplatesContainer.innerHTML = `<span style="font-size:0.85rem; color:#64748b;">Chưa có Rubric Template nào.</span>`;
            return;
        }

        loadedRubricTemplates = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
        }));

        rubricTemplatesContainer.innerHTML = loadedRubricTemplates.map(tpl => `
            <label class="template-item">
                <input type="checkbox" class="chk-rubric-template" value="${tpl.id}">
                <span>${escapeHtml(tpl.name || tpl.title)}</span>
            </label>
        `).join("");

    } catch (e) {
        console.error("Lỗi khi tải Rubric Templates:", e);
        rubricTemplatesContainer.innerHTML = `<span style="font-size:0.85rem; color:#ef4444;">Lỗi tải Rubric Templates.</span>`;
    }
}

async function loadTopicsToSelect() {
    if (!topicSelect) return;

    try {
        const snapshot = await getDocs(collection(db, "topics"));
        const defaultTopics = ["Đại số", "Hình học", "Số học", "Tổ hợp"];
        const dbTopics = snapshot.docs.map(docSnap => docSnap.data().name).filter(Boolean);

        const allTopics = Array.from(new Set([...defaultTopics, ...dbTopics]));
        topicSelect.innerHTML = `<option value="">-- Chọn chủ đề --</option>`;

        allTopics.forEach(topic => {
            const opt = document.createElement("option");
            opt.value = topic;
            opt.textContent = topic;
            topicSelect.appendChild(opt);
        });

        const customOpt = document.createElement("option");
        customOpt.value = "custom";
        customOpt.textContent = "➕ Chủ đề khác (Tự nhập)";
        topicSelect.appendChild(customOpt);

    } catch (e) {
        console.error("Lỗi khi tải danh sách chủ đề:", e);
        toast.error("Không thể tải danh sách chủ đề.");
    }
}

// ==========================================
// 6. MANUAL RUBRIC & EXTRA SOLUTIONS HANDLERS
// ==========================================
function initRubricTabs() {
    tabManual?.addEventListener("click", () => {
        activeRubricMode = 'manual';
        tabManual.classList.add("active");
        tabAI.classList.remove("active");
        panelManual?.classList.add("active");
        panelAI?.classList.remove("active");
    });

    tabAI?.addEventListener("click", () => {
        activeRubricMode = 'ai';
        tabAI.classList.add("active");
        tabManual.classList.remove("active");
        panelAI?.classList.add("active");
        panelManual?.classList.remove("active");
    });
}

function renderManualRubric() {
    if (!manualRubricList) return;
    manualRubricList.innerHTML = "";

    manualRubricState.forEach((item, index) => {
        const card = document.createElement("div");
        card.className = "rubric-item-card";
        card.innerHTML = `
            <div class="rubric-item-header">
                <span style="font-weight:700; font-size:0.85rem; color:#2563eb;">Tiêu chí thủ công #${index + 1}</span>
                <button type="button" class="btn-remove-manual-rubric" data-index="${index}" style="color:#ef4444; background:none; border:none; cursor:pointer; font-size:0.85rem;">
                    <i class="fa-solid fa-trash"></i> Xóa
                </button>
            </div>
            <div style="display:grid; grid-template-columns: 3fr 1fr; gap:10px; margin-bottom:6px;">
                <input type="text" class="manual-edit-title" data-index="${index}" value="${escapeHtml(item.title)}" placeholder="Tên tiêu chí (VD: Biến đổi vế trái)" style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px;">
                <div style="display:flex; align-items:center; gap:4px;">
                    <input type="number" step="0.25" class="manual-edit-score" data-index="${index}" value="${item.score}" style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px;">
                    <span style="font-size:0.8rem; font-weight:600;">đ</span>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <input type="text" class="manual-edit-desc" data-index="${index}" value="${escapeHtml(item.description || '')}" placeholder="Mô tả chi tiết bước làm" style="font-size:0.8rem; padding:6px; border:1px solid #cbd5e1; border-radius:4px;">
                <input type="text" class="manual-edit-know" data-index="${index}" value="${(item.knowledge || []).join(',')}" placeholder="Mã kiến thức (cách nhau bởi phẩy)" style="font-size:0.8rem; padding:6px; border:1px solid #cbd5e1; border-radius:4px;">
            </div>
        `;
        manualRubricList.appendChild(card);
    });

    calculateManualTotalScore();
    bindManualRubricEvents();
}

function bindManualRubricEvents() {
    document.querySelectorAll(".manual-edit-title").forEach(input => {
        input.onchange = (e) => {
            const idx = parseInt(e.target.dataset.index);
            manualRubricState[idx].title = e.target.value.trim();
        };
    });

    document.querySelectorAll(".manual-edit-score").forEach(input => {
        input.onchange = (e) => {
            const idx = parseInt(e.target.dataset.index);
            manualRubricState[idx].score = parseFloat(e.target.value) || 0;
            calculateManualTotalScore();
        };
    });

    document.querySelectorAll(".manual-edit-desc").forEach(input => {
        input.onchange = (e) => {
            const idx = parseInt(e.target.dataset.index);
            manualRubricState[idx].description = e.target.value.trim();
        };
    });

    document.querySelectorAll(".manual-edit-know").forEach(input => {
        input.onchange = (e) => {
            const idx = parseInt(e.target.dataset.index);
            const val = e.target.value.trim();
            manualRubricState[idx].knowledge = val ? val.split(",").map(k => k.trim()).filter(Boolean) : [];
        };
    });

    document.querySelectorAll(".btn-remove-manual-rubric").forEach(btn => {
        btn.onclick = (e) => {
            const idx = parseInt(e.currentTarget.dataset.index);
            manualRubricState.splice(idx, 1);
            renderManualRubric();
        };
    });
}

btnAddManualRow?.addEventListener("click", () => {
    manualRubricState.push({
        id: `m${manualRubricState.length + 1}`,
        title: "",
        description: "",
        score: 1,
        knowledge: []
    });
    renderManualRubric();
});

function calculateManualTotalScore() {
    const total = manualRubricState.reduce((sum, item) => sum + (parseFloat(item.score) || 0), 0);
    if (lblManualTotal) lblManualTotal.textContent = total;
    if (warnManualScore) {
        if (Math.abs(total - 10) > 0.01) {
            warnManualScore.style.display = "block";
            warnManualScore.textContent = `⚠️ Tổng điểm đang là ${total}đ (nên điều chỉnh đạt 10đ)`;
        } else {
            warnManualScore.style.display = "none";
        }
    }
}

// Extra Solutions với MathEditor
function renderExtraSolutions() {
    if (!extraSolutionsContainer) return;
    extraSolutionsEditors.clear();
    extraSolutionsContainer.innerHTML = "";

    extraSolutionsState.forEach((solItem, idx) => {
        const item = document.createElement("div");
        item.className = "extra-solution-card card";
        item.style.cssText = "background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 14px; margin-bottom: 14px;";

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: 700; font-size: 0.9rem; color: #1e293b;">
                    💡 Cách giải khác #${idx + 2} (Rich Math Editor)
                </span>
                <button type="button" class="btn-remove-sol" data-id="${solItem.id}" style="background: #fef2f2; border: 1px solid #fca5a5; color: #ef4444; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 0.8rem; font-weight: 600;">
                    <i class="fa-solid fa-trash"></i> Xóa cách giải này
                </button>
            </div>
            <div id="editor_${solItem.id}" class="block-editor-box" style="background: #ffffff; border-radius: 8px;"></div>
        `;
        extraSolutionsContainer.appendChild(item);

        const ed = new MathEditor(`#editor_${solItem.id}`, {
            placeholder: `Nhập chi tiết lời giải / cách giải bổ sung #${idx + 2}...`,
            minHeight: '130px'
        });

        if (solItem.contentData || solItem.content) {
            ed.setContent(solItem.contentData || solItem.content);
        }

        extraSolutionsEditors.set(solItem.id, ed);
    });

    document.querySelectorAll(".btn-remove-sol").forEach(btn => {
        btn.onclick = (e) => {
            const solId = e.currentTarget.dataset.id;
            extraSolutionsState = extraSolutionsState.filter(s => s.id !== solId);
            if (extraSolutionsEditors.has(solId)) {
                extraSolutionsEditors.delete(solId);
            }
            renderExtraSolutions();
        };
    });
}

btnAddSolution?.addEventListener("click", () => {
    const solId = "extra_sol_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
    extraSolutionsState.push({ id: solId, content: "", contentData: {} });
    renderExtraSolutions();
});

// ==========================================
// 7. AI GENERATE RUBRIC EVENT
// ==========================================
btnGenerateAiRubric?.addEventListener("click", async () => {
    const contentVal = contentEditor ? contentEditor.getCleanLatex() : "";
    const solutionVal = solutionEditor ? solutionEditor.getCleanLatex() : "";

    const selectedTemplateIds = Array.from(document.querySelectorAll(".chk-rubric-template:checked"))
                                    .map(cb => cb.value);

    if (!contentVal) {
        return toast.warning("Vui lòng nhập Nội dung đề bài trước khi sinh Rubric!");
    }

    if (selectedTemplateIds.length === 0) {
        return toast.warning("Vui lòng tích chọn ít nhất 1 Rubric Template!");
    }

    const selectedTemplatesData = loadedRubricTemplates.filter(t => selectedTemplateIds.includes(t.id));

    btnGenerateAiRubric.disabled = true;
    btnGenerateAiRubric.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> AI đang phân tích và sinh Rubric...`;

    try {
        const responseData = await generateRubric({
            problem: {
                content: contentVal,
                solution: solutionVal
            },
            templates: selectedTemplatesData.map(t => ({
                id: t.id,
                name: t.name || t.title,
                aiUsage: t.aiUsage || "",
                criteria: t.criteria || []
            }))
        });

        generatedRubricState = responseData.rubric || [];
        
        renderRubricEditor();
        rubricPreviewCard.style.display = "block";
        toast.success("AI đã sinh Rubric thành công!");

    } catch (err) {
        console.error("Lỗi AI sinh Rubric:", err);
        toast.error("Không thể sinh Rubric bằng AI: " + (err.message || "Lỗi không xác định"));
    } finally {
        btnGenerateAiRubric.disabled = false;
        btnGenerateAiRubric.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Sinh Rubric bằng AI`;
    }
});

// ==========================================
// 8. RUBRIC UI EDITING & HANDLERS
// ==========================================
function renderRubricEditor() {
    if (!generatedRubricList) return;
    generatedRubricList.innerHTML = "";

    generatedRubricState.forEach((item, index) => {
        const card = document.createElement("div");
        card.className = "rubric-item-card";
        card.innerHTML = `
            <div class="rubric-item-header">
                <span style="font-weight:700; font-size:0.85rem; color:#2563eb;">Tiêu chí #${index + 1}</span>
                <button type="button" class="btn-remove-rubric" data-index="${index}" style="color:#ef4444; background:none; border:none; cursor:pointer; font-size:0.85rem;">
                    <i class="fa-solid fa-trash"></i> Xóa
                </button>
            </div>
            <div style="display:grid; grid-template-columns: 3fr 1fr; gap:10px; margin-bottom:6px;">
                <input type="text" class="rubric-edit-title" data-index="${index}" value="${escapeHtml(item.title)}" placeholder="Tên tiêu chí (VD: Xét ΔABC và ΔDEF)" style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px;">
                <div style="display:flex; align-items:center; gap:4px;">
                    <input type="number" step="0.25" class="rubric-edit-score" data-index="${index}" value="${item.score}" style="width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:4px;">
                    <span style="font-size:0.8rem; font-weight:600;">đ</span>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <input type="text" class="rubric-edit-desc" data-index="${index}" value="${escapeHtml(item.description || '')}" placeholder="Mô tả chi tiết bước làm" style="font-size:0.8rem; padding:6px; border:1px solid #cbd5e1; border-radius:4px;">
                <input type="text" class="rubric-edit-know" data-index="${index}" value="${(item.knowledge || []).join(',')}" placeholder="Mã kiến thức (cách nhau bởi phẩy)" style="font-size:0.8rem; padding:6px; border:1px solid #cbd5e1; border-radius:4px;">
            </div>
        `;
        generatedRubricList.appendChild(card);
    });

    calculateTotalRubricScore();
    bindRubricEvents();
}

function bindRubricEvents() {
    document.querySelectorAll(".rubric-edit-title").forEach(input => {
        input.onchange = (e) => {
            const idx = parseInt(e.target.dataset.index);
            generatedRubricState[idx].title = e.target.value.trim();
        };
    });

    document.querySelectorAll(".rubric-edit-score").forEach(input => {
        input.onchange = (e) => {
            const idx = parseInt(e.target.dataset.index);
            generatedRubricState[idx].score = parseFloat(e.target.value) || 0;
            calculateTotalRubricScore();
        };
    });

    document.querySelectorAll(".rubric-edit-desc").forEach(input => {
        input.onchange = (e) => {
            const idx = parseInt(e.target.dataset.index);
            generatedRubricState[idx].description = e.target.value.trim();
        };
    });

    document.querySelectorAll(".rubric-edit-know").forEach(input => {
        input.onchange = (e) => {
            const idx = parseInt(e.target.dataset.index);
            const val = e.target.value.trim();
            generatedRubricState[idx].knowledge = val ? val.split(",").map(k => k.trim()).filter(Boolean) : [];
        };
    });

    document.querySelectorAll(".btn-remove-rubric").forEach(btn => {
        btn.onclick = (e) => {
            const idx = parseInt(e.currentTarget.dataset.index);
            generatedRubricState.splice(idx, 1);
            renderRubricEditor();
        };
    });
}

btnAddRubricRow?.addEventListener("click", () => {
    generatedRubricState.push({
        id: `r${generatedRubricState.length + 1}`,
        title: "",
        description: "",
        score: 1,
        knowledge: []
    });
    renderRubricEditor();
});

function calculateTotalRubricScore() {
    const total = generatedRubricState.reduce((sum, item) => sum + (parseFloat(item.score) || 0), 0);
    if (lblTotalRubricScore) lblTotalRubricScore.textContent = total;
}

// Custom Topic Toggle
topicSelect?.addEventListener("change", (e) => {
    if (e.target.value === "custom") {
        customTopicContainer.classList.remove("hidden");
        customTopicInput.required = true;
        customTopicInput.focus();
    } else {
        customTopicContainer.classList.add("hidden");
        customTopicInput.required = false;
        customTopicInput.value = "";
    }
});

// Image Upload Previews & Existing Images
problemImageInput?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        problemFiles = [...problemFiles, ...files];
        renderPreview(problemFiles, problemImagePreview, removeProblemImage);
    }
});

solutionImageInput?.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        solutionFiles = [...solutionFiles, ...files];
        renderPreview(solutionFiles, solutionImagePreview, removeSolutionImage);
    }
});

function removeProblemImage(index) {
    problemFiles.splice(index, 1);
    renderPreview(problemFiles, problemImagePreview, removeProblemImage);
}

function removeSolutionImage(index) {
    solutionFiles.splice(index, 1);
    renderPreview(solutionFiles, solutionImagePreview, removeSolutionImage);
}

function renderExistingImages(imagesList, containerId, wrapperId, removeCallback) {
    const container = document.getElementById(containerId);
    const wrapper = document.getElementById(wrapperId);
    if (!container) return;

    if (!imagesList || imagesList.length === 0) {
        if (wrapper) wrapper.style.display = "none";
        container.innerHTML = "";
        return;
    }

    if (wrapper) wrapper.style.display = "block";
    container.innerHTML = "";

    imagesList.forEach((imgItem, index) => {
        const item = document.createElement("div");
        item.className = "preview-item";
        const imgUrl = typeof imgItem === "string" ? imgItem : (imgItem.url || imgItem.secure_url || "");

        item.innerHTML = `
            <img src="${imgUrl}" alt="existing image">
            <div class="file-name" title="Ảnh hiện có">Ảnh hiện có #${index + 1}</div>
            <button type="button" class="remove-btn" data-index="${index}">&times;</button>
        `;

        item.querySelector(".remove-btn").addEventListener("click", () => {
            removeCallback(index);
        });

        container.appendChild(item);
    });
}

function removeExistingProblemImage(index) {
    existingProblemImages.splice(index, 1);
    renderExistingImages(existingProblemImages, "existingProblemImagePreview", "existingProblemImageContainer", removeExistingProblemImage);
}

function removeExistingSolutionImage(index) {
    existingSolutionImages.splice(index, 1);
    renderExistingImages(existingSolutionImages, "existingSolutionImagePreview", "existingSolutionImageContainer", removeExistingSolutionImage);
}

function renderPreview(fileList, container, removeCallback) {
    if (!container) return;
    container.innerHTML = "";

    fileList.forEach((file, index) => {
        const item = document.createElement("div");
        item.className = "preview-item";
        const imgUrl = URL.createObjectURL(file);

        item.innerHTML = `
            <img src="${imgUrl}" alt="${file.name}">
            <div class="file-name" title="${file.name}">${escapeHtml(file.name)}</div>
            <div class="file-size">${formatBytes(file.size)}</div>
            <button type="button" class="remove-btn" data-index="${index}">&times;</button>
        `;

        item.querySelector(".remove-btn").addEventListener("click", () => {
            removeCallback(index);
        });

        container.appendChild(item);
    });
}

function clearAllPreviews() {
    problemFiles = [];
    solutionFiles = [];
    existingProblemImages = [];
    existingSolutionImages = [];
    generatedRubricState = [];
    if (problemImageInput) problemImageInput.value = "";
    if (solutionImageInput) solutionImageInput.value = "";
    if (problemImagePreview) problemImagePreview.innerHTML = "";
    if (solutionImagePreview) solutionImagePreview.innerHTML = "";
    renderExistingImages([], "existingProblemImagePreview", "existingProblemImageContainer", removeExistingProblemImage);
    renderExistingImages([], "existingSolutionImagePreview", "existingSolutionImageContainer", removeExistingSolutionImage);
    if (rubricPreviewCard) rubricPreviewCard.style.display = "none";
    if (contentEditor) contentEditor.setContent("");
    if (solutionEditor) solutionEditor.setContent("");
}

async function saveTopicIfNew(topicName) {
    if (!topicName) return;
    const cleanName = topicName.trim();

    try {
        const q = query(collection(db, "topics"), where("name", "==", cleanName));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            await addDoc(collection(db, "topics"), {
                name: cleanName,
                createdAt: serverTimestamp(),
                createdBy: currentUser.uid
            });
        }
    } catch (error) {
        console.error("Lỗi khi lưu chủ đề mới:", error);
    }
}

// ==========================================
// 9. FORM SUBMIT HANDLER (CREATE / EDIT)
// ==========================================
form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const titleVal = document.getElementById("title").value.trim();
    const gradeVal = document.getElementById("grade").value;
    const difficultyVal = document.getElementById("difficulty").value;
    
    // 🟢 Trích xuất dữ liệu LaTeX từ MathEditor
    const contentVal = contentEditor ? contentEditor.getCleanLatex() : "";
    const solutionVal = solutionEditor ? solutionEditor.getCleanLatex() : "";

    if (!contentVal) {
        toast.error("Vui lòng nhập nội dung bài tập.");
        return;
    }

    let selectedTopic = topicSelect.value;
    const isCustomTopic = selectedTopic === "custom";

    if (isCustomTopic) {
        selectedTopic = customTopicInput.value.trim();
    }

    if (!selectedTopic) {
        toast.error("Vui lòng chọn hoặc nhập chủ đề bài tập.");
        return;
    }

    const selectedTemplateIds = activeRubricMode === 'ai' 
        ? Array.from(document.querySelectorAll(".chk-rubric-template:checked")).map(cb => cb.value)
        : [];

    const sourceRubricState = activeRubricMode === 'manual' ? manualRubricState : generatedRubricState;

    const finalRubric = sourceRubricState.map((r, idx) => ({
        id: r.id || `r${idx + 1}`,
        title: r.title,
        description: r.description || "",
        score: parseFloat(r.score) || 0,
        knowledge: r.knowledge || []
    })).filter(r => r.title);

    if (finalRubric.length === 0) {
        toast.error("Vui lòng thiết lập ít nhất 1 tiêu chí Rubric trước khi lưu!");
        return;
    }

    // Thu thập các bài viết kiến thức được chọn
    const selectedKnowledgeIds = Array.from(document.querySelectorAll(".chk-knowledge-article:checked")).map(cb => cb.value);

    // Thu thập các lời giải mẫu bổ sung từ các MathEditor
    const validExtraSolutionsLatex = [];
    const validExtraSolutionsStructured = [];

    extraSolutionsEditors.forEach((ed) => {
        const latex = ed.getCleanLatex().trim();
        if (latex) {
            validExtraSolutionsLatex.push(latex);
            validExtraSolutionsStructured.push({
                content: ed.getJSON(),
                contentText: latex,
                contentHtml: ed.getHTML()
            });
        }
    });

    const solutions = [solutionVal, ...validExtraSolutionsLatex].filter(Boolean);

    setLoadingState(true);

    try {
        let uploadedProblemImages = [];
        let uploadedSolutionImages = [];

        if (problemFiles.length > 0) {
            toast.info("Đang tải ảnh đề bài mới lên...");
            uploadedProblemImages = await uploadImages(problemFiles);
        }

        if (solutionFiles.length > 0) {
            toast.info("Đang tải ảnh lời giải mới lên...");
            uploadedSolutionImages = await uploadImages(solutionFiles);
        }

        if (isCustomTopic) {
            await saveTopicIfNew(selectedTopic);
        }

        const finalProblemImages = [...existingProblemImages, ...uploadedProblemImages];
        const finalSolutionImages = [...existingSolutionImages, ...uploadedSolutionImages];

        // Đóng gói document lưu vào Firestore chuẩn schema
        const problemPayload = {
            title: titleVal,
            grade: Number(gradeVal),
            difficulty: difficultyVal,
            topic: selectedTopic,
            visibility: document.getElementById("visibilitySelect")?.value || "public",
            content: contentEditor ? contentEditor.getJSON() : {},
            contentText: contentVal,
            contentHtml: contentEditor ? contentEditor.getHTML() : "",
            images: finalProblemImages,
            solution: solutionEditor ? solutionEditor.getJSON() : {},
            solutionText: solutionVal,
            solutions: solutions,
            solutionHtml: solutionEditor ? solutionEditor.getHTML() : "",
            solutionImages: finalSolutionImages,
            extraSolutions: validExtraSolutionsStructured,
            relatedKnowledge: selectedKnowledgeIds,

            deleted: false,
            hidden: false,
            rubricMode: activeRubricMode,
            rubricTemplateIds: selectedTemplateIds,
            rubric: finalRubric,
            updatedAt: serverTimestamp()
        };

        if (editingProblemId) {
            await updateDoc(doc(db, "problems", editingProblemId), problemPayload);
            toast.success("Cập nhật bài tập thành công!");
            await loadMyProblems();
            await selectProblemToEdit(editingProblemId);
        } else {
            problemPayload.authorId = currentUser.uid;
            problemPayload.authorName = currentProfile.username || currentProfile.displayName || "User";
            problemPayload.createdAt = serverTimestamp();
            problemPayload.likes = 0;
            problemPayload.comments = 0;
            problemPayload.views = 0;

            await addDoc(collection(db, "problems"), problemPayload);
            toast.success("Đăng bài tập mới thành công!");
            await loadMyProblems();
            resetToCreateMode();
        }

    } catch (error) {
        console.error("Lỗi lưu bài tập:", error);
        toast.error("Không thể lưu bài tập. " + (error.message || ""));
    } finally {
        setLoadingState(false);
    }
});

// ==========================================
// 10. HELPER FUNCTIONS
// ==========================================
function setLoadingState(isLoading) {
    if (!submitBtn) return;

    if (isLoading) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.textContent = editingProblemId ? "⏳ Đang cập nhật..." : "⏳ Đang đăng...";
    } else {
        submitBtn.disabled = false;
        if (submitBtn.dataset.originalText) {
            submitBtn.textContent = submitBtn.dataset.originalText;
        }
    }
}

function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function escapeHtml(str = "") {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}