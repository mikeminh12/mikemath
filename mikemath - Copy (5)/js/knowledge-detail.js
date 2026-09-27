/**
 * MIKE MATH - KNOWLEDGE DETAIL MODULE
 * Updated to Schema 2.0 (knowledgeArticles & knowledgeFolders)
 * File: js/knowledge-detail.js
 */

import { db, auth } from "./firebase.js";
import { 
    doc, 
    getDoc, 
    updateDoc, 
    increment, 
    collection, 
    query, 
    where, 
    limit, 
    getDocs,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { BlockRenderer } from "./knowledge-renderer.js";

// STATE MANAGEMENT
const state = {
    articleId: null,
    articleData: null,
    folderTree: [],
    currentUser: null,
    savedKnowledge: []
};

// UI ELEMENTS
const elements = {
    aiBanner: document.getElementById("aiBanner"),
    closeAiBannerBtn: document.getElementById("closeAiBannerBtn"),
    breadcrumbFolders: document.getElementById("breadcrumbFolders"),
    breadcrumbTitle: document.getElementById("breadcrumbTitle"),
    
    badgeFeatured: document.getElementById("badgeFeatured"),
    badgeAi: document.getElementById("badgeAi"),
    articleTitle: document.getElementById("articleTitle"),
    articleSummary: document.getElementById("articleSummary"),
    inpageSearchInput: document.getElementById("inpageSearchInput"),
    blocksContainer: document.getElementById("blocksContainer"),
    
    relatedProblemsList: document.getElementById("relatedProblemsList"),
    relatedKnowledgeList: document.getElementById("relatedKnowledgeList"),
    practiceFolderBtn: document.getElementById("practiceFolderBtn"),

    // Meta Side
    metaFolder: document.getElementById("metaFolder"),
    metaCreatedAt: document.getElementById("metaCreatedAt"),
    metaUpdatedAt: document.getElementById("metaUpdatedAt"),
    metaViews: document.getElementById("metaViews"),
    metaBlockCount: document.getElementById("metaBlockCount"),
    metaFeatured: document.getElementById("metaFeatured"),
    metaAiEnabled: document.getElementById("metaAiEnabled"),

    // TOC
    tableOfContents: document.getElementById("tableOfContents"),

    // Actions
    shareBtn: document.getElementById("shareBtn"),
    saveBtn: document.getElementById("saveBtn"),
    saveBtnText: document.getElementById("saveBtnText"),
    printBtn: document.getElementById("printBtn"),

    // Image Modal
    imageModal: document.getElementById("imageModal"),
    modalImg: document.getElementById("modalImg"),
    closeModalBtn: document.getElementById("closeModalBtn")
};

// GLOBAL IMAGE MODAL HOOK
window.openImageModal = (url) => {
    if (elements.modalImg && elements.imageModal) {
        elements.modalImg.src = url;
        elements.imageModal.classList.remove("hidden");
    }
};

document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    state.articleId = urlParams.get("id");

    if (urlParams.get("from") === "ai") {
        elements.aiBanner?.classList.remove("hidden");
    }

    if (!state.articleId) {
        alert("Không tìm thấy ID bài học!");
        window.location.href = "knowledge.html";
        return;
    }

    bindEvents();
    initAuthListener();
    loadArticleDetail();
});

function bindEvents() {
    elements.closeAiBannerBtn?.addEventListener("click", () => elements.aiBanner.classList.add("hidden"));
    elements.shareBtn.addEventListener("click", handleShare);
    elements.saveBtn.addEventListener("click", handleToggleSave);
    elements.printBtn.addEventListener("click", () => window.print());
    elements.inpageSearchInput.addEventListener("input", handleInpageBlockSearch);
    elements.closeModalBtn?.addEventListener("click", () => elements.imageModal.classList.add("hidden"));
}

function initAuthListener() {
    onAuthStateChanged(auth, (user) => {
        state.currentUser = user;
        if (user) fetchUserSavedState();
    });
}

// ==========================================
// FETCH FIRESTORE DATA
// ==========================================
async function loadArticleDetail() {
    try {
        // Đổi Collection: knowledge -> knowledgeArticles
        const docRef = doc(db, "knowledgeArticles", state.articleId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            alert("Bài học không tồn tại hoặc đã bị xóa.");
            window.location.href = "knowledge.html";
            return;
        }

        const data = docSnap.data();

        if (data.hidden) {
            alert("Bài viết này hiện đang ẩn.");
            window.location.href = "knowledge.html";
            return;
        }

        state.articleData = { id: docSnap.id, ...data };

        // 1. Tải cây thư mục
        if (data.folderId) {
            await loadFolderTree(data.folderId);
        }

        // 2. Render nội dung chính
        renderArticle();
        
        // 3. Tăng Lượt Xem
        incrementViewCount();

        // 4. Lấy dữ liệu liên quan
        fetchRelatedKnowledgeByFolder(data.folderId);
        fetchRelatedProblemsByFolder(data.folderId);

    } catch (error) {
        console.error("Lỗi khi tải bài viết:", error);
    }
}

// ==========================================
// BREADCRUMB & FOLDER TREE (RECURSIVE)
// ==========================================
async function loadFolderTree(folderId) {
    const tree = [];
    let currentId = folderId;

    try {
        while (currentId) {
            const folderSnap = await getDoc(doc(db, "knowledgeFolders", currentId));
            if (!folderSnap.exists()) break;

            const folderData = folderSnap.data();
            tree.unshift({ id: folderSnap.id, ...folderData });
            currentId = folderData.parentId || null;
        }
        state.folderTree = tree;
    } catch (err) {
        console.error("Lỗi khi dựng cây thư mục:", err);
    }
}

// ==========================================
// RENDER ARTICLE
// ==========================================
function renderArticle() {
    const item = state.articleData;
    const blocks = Array.isArray(item.blocks) ? item.blocks : [];

    // Render Breadcrumb
    if (state.folderTree.length > 0) {
        elements.breadcrumbFolders.innerHTML = state.folderTree.map(f => `
            &gt; <a href="knowledge.html?folder=${f.id}">${BlockRenderer.escapeHtml(f.name)}</a>
        `).join("");
        elements.metaFolder.textContent = state.folderTree[state.folderTree.length - 1].name;
    } else {
        elements.metaFolder.textContent = "Gốc";
    }
    elements.breadcrumbTitle.textContent = item.title;

    // Badges & Headers
    elements.articleTitle.textContent = item.title;
    elements.articleSummary.textContent = item.summary || "";
    
    if (item.featured) elements.badgeFeatured.classList.remove("hidden");
    if (item.aiEnabled) elements.badgeAi.classList.remove("hidden");

    // Sidebar Meta
    elements.metaCreatedAt.textContent = formatDate(item.createdAt);
    elements.metaUpdatedAt.textContent = formatDate(item.updatedAt);
    elements.metaViews.textContent = (item.views || 0) + 1;
    elements.metaBlockCount.textContent = blocks.length;
    elements.metaFeatured.textContent = item.featured ? "Có" : "Không";
    elements.metaAiEnabled.textContent = item.aiEnabled ? "Có" : "Không";

    // 1. RENDER ALL BLOCKS VIA SHARED RENDERER
    elements.blocksContainer.innerHTML = BlockRenderer.renderBlocks(blocks);

    // 2. GENERATE TOC VIA SHARED RENDERER
    let tocHtml = BlockRenderer.generateTOC(blocks);
    tocHtml += `<li><a href="#sectionRelatedProblems">🎯 Bài tập</a></li>`;
    tocHtml += `<li><a href="#sectionRelatedKnowledge">📚 Bài học liên quan</a></li>`;
    elements.tableOfContents.innerHTML = tocHtml;

    // 3. TYPESET MATH
    BlockRenderer.typesetMath();
}

// ==========================================
// SEARCH IN BLOCKS
// ==========================================
function handleInpageBlockSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    const blockCards = elements.blocksContainer.querySelectorAll(".block-card");

    blockCards.forEach(card => {
        if (!query) {
            card.style.display = "";
            card.style.backgroundColor = "";
            return;
        }

        const textContent = card.textContent.toLowerCase();
        if (textContent.includes(query)) {
            card.style.display = "";
            card.style.backgroundColor = "rgba(254, 240, 138, 0.2)";
        } else {
            card.style.display = "none";
        }
    });
}

// ==========================================
// FETCH RELATED DATA BY FOLDER
// ==========================================
async function fetchRelatedKnowledgeByFolder(folderId) {
    if (!folderId) return;

    try {
        const q = query(
            collection(db, "knowledgeArticles"),
            where("folderId", "==", folderId),
            where("hidden", "==", false),
            limit(6)
        );

        const snapshot = await getDocs(q);
        const list = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(item => item.id !== state.articleId);

        if (list.length === 0) {
            elements.relatedKnowledgeList.innerHTML = `<p class="text-muted">Chưa có bài học nào khác trong thư mục này.</p>`;
            return;
        }

        elements.relatedKnowledgeList.innerHTML = list.map(item => `
            <a href="knowledge-detail.html?id=${item.id}" class="related-knowledge-item">
                <span class="rel-title">📘 ${BlockRenderer.escapeHtml(item.title)}</span>
                <span class="rel-views">👁️ ${item.views || 0}</span>
            </a>
        `).join("");

    } catch (error) {
        console.error("Lỗi tải bài học liên quan:", error);
    }
}

async function fetchRelatedProblemsByFolder(folderId) {
    if (!folderId) {
        elements.relatedProblemsList.innerHTML = `<p class="text-muted">Chưa có bài tập được gán cho thư mục này.</p>`;
        return;
    }

    try {
        const q = query(
            collection(db, "problems"),
            where("folderId", "==", folderId),
            limit(4)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            elements.relatedProblemsList.innerHTML = `<p class="text-muted">Chưa có bài tập trong thư mục này.</p>`;
            return;
        }

        elements.relatedProblemsList.innerHTML = snapshot.docs.map(docSnap => {
            const prob = docSnap.data();
            return `
                <div class="card problem-item-card">
                    <div class="prob-info">
                        <span class="badge badge-difficulty ${prob.difficulty}">${prob.difficulty || "medium"}</span>
                        <h4 class="prob-title">${BlockRenderer.escapeHtml(prob.title)}</h4>
                    </div>
                    <a href="problem-detail.html?id=${docSnap.id}" class="btn-primary btn-sm">Làm bài</a>
                </div>
            `;
        }).join("");

        if (elements.practiceFolderBtn) {
            elements.practiceFolderBtn.href = `problems.html?folder=${folderId}`;
        }

    } catch (error) {
        console.error("Lỗi khi tải bài tập:", error);
        elements.relatedProblemsList.innerHTML = `<p class="text-muted">Không thể tải bài tập gợi ý.</p>`;
    }
}

// ==========================================
// USER SAVED STATE & ACTIONS
// ==========================================
async function fetchUserSavedState() {
    if (!state.currentUser) return;
    try {
        const userRef = doc(db, "users", state.currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            state.savedKnowledge = userSnap.data().savedArticles || [];
            updateSaveButtonUI();
        }
    } catch (err) {
        console.error("Lỗi lấy danh sách bài đã lưu:", err);
    }
}

async function handleToggleSave() {
    if (!state.currentUser) {
        alert("Vui lòng đăng nhập để lưu bài học!");
        return;
    }

    const userRef = doc(db, "users", state.currentUser.uid);
    const isSaved = state.savedKnowledge.includes(state.articleId);

    try {
        if (isSaved) {
            await updateDoc(userRef, { savedArticles: arrayRemove(state.articleId) });
            state.savedKnowledge = state.savedKnowledge.filter(id => id !== state.articleId);
            alert("Đã xóa khỏi bài viết đã lưu!");
        } else {
            await updateDoc(userRef, { savedArticles: arrayUnion(state.articleId) });
            state.savedKnowledge.push(state.articleId);
            alert("🔖 Đã lưu bài viết!");
        }
        updateSaveButtonUI();
    } catch (err) {
        console.error("Lỗi khi lưu bài:", err);
    }
}

function updateSaveButtonUI() {
    const isSaved = state.savedKnowledge.includes(state.articleId);
    elements.saveBtnText.textContent = isSaved ? "Đã lưu" : "Lưu bài";
    elements.saveBtn.classList.toggle("saved", isSaved);
}

function handleShare() {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(window.location.href);
        alert("📋 Đã sao chép đường dẫn bài viết!");
    } else {
        alert("URL: " + window.location.href);
    }
}

async function incrementViewCount() {
    const viewedKey = `viewed_art_${state.articleId}`;
    if (sessionStorage.getItem(viewedKey)) return;

    try {
        const docRef = doc(db, "knowledgeArticles", state.articleId);
        await updateDoc(docRef, { views: increment(1) });
        sessionStorage.setItem(viewedKey, "true");
    } catch (err) {
        console.warn("Lỗi tăng views:", err);
    }
}

function formatDate(timestamp) {
    if (!timestamp) return "--/--/----";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("vi-VN");
}