/**
 * MIKE MATH - KNOWLEDGE NODE MANAGER & EDITOR
 * Quản lý toàn bộ danh mục & Soạn thảo trên cùng 1 trang
 * File: js/knowledge-create.js
 */

import { db, auth } from "./firebase.js";
import { 
    collection, 
    addDoc, 
    getDocs, 
    getDoc,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { BlockRenderer } from "./knowledge-renderer.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { MathEditor } from "./editor/MathEditor.js";
import { uploadImage } from "./cloudinary.js";

// GLOBAL EDITOR INSTANCE
let articleEditor = null;

// STATE MANAGEMENT
const state = {
    editingId: null,       // null = Tạo mới | string = Đang sửa Document ID này
    nodeType: "article",   // "article" | "folder"
    blocks: [],            // Mảng chứa các blocks[]
    foldersList: [],       // Danh sách thư mục lấy từ Firestore
    articlesList: []       // Danh sách bài viết lấy từ Firestore
};

// DOM ELEMENTS
const elements = {
    radioNodeTypes: document.getElementsByName("nodeType"),
    parentFolderSelect: document.getElementById("parentFolderSelect"),
    folderFields: document.getElementById("folderFields"),
    articleFields: document.getElementById("articleFields"),
    blockList: document.getElementById("blockList"),
    addBlockBtn: document.getElementById("addBlockBtn"),
    blockMenuDropdown: document.getElementById("blockMenuDropdown"),
    livePreviewContainer: document.getElementById("livePreviewContainer"),
    knowledgeTreeContainer: document.getElementById("knowledgeTreeContainer"),
    editingStatusBadge: document.getElementById("editingStatusBadge"),
    btnDeleteCurrent: document.getElementById("btnDeleteCurrent"),
    btnNewNode: document.getElementById("btnNewNode"),
    btnResetForm: document.getElementById("btnResetForm"),
    searchTreeInput: document.getElementById("searchTreeInput"),
    
    // Global MathLive Field Elements
    globalVisualMathInput: document.getElementById("globalVisualMathInput"),
    latexPreviewText: document.getElementById("latexPreviewText"),
    btnToggleVirtualKeyboard: document.getElementById("btnToggleVirtualKeyboard"),

    // Inputs Form - Article
    articleTitle: document.getElementById("articleTitle"),
    articleSlug: document.getElementById("articleSlug"),
    articleSummary: document.getElementById("articleSummary"),
    chkFeatured: document.getElementById("chkFeatured"),
    chkSearchable: document.getElementById("chkSearchable"),
    chkAiEnabled: document.getElementById("chkAiEnabled"),
    chkHidden: document.getElementById("chkHidden"),

    // Inputs Form - Folder
    folderName: document.getElementById("folderName"),
    folderSlug: document.getElementById("folderSlug"),
    folderIcon: document.getElementById("folderIcon"),
    folderDesc: document.getElementById("folderDesc"),
    
    // Buttons
    btnPublish: document.getElementById("btnPublish")
};

document.addEventListener("DOMContentLoaded", async () => {
    guardAdminRoute();
    
    // Khởi tạo MathEditor cho bài viết kiến thức
    if (document.querySelector('#article-editor-container')) {
        articleEditor = new MathEditor('#article-editor-container', {
            placeholder: 'Nhập nội dung lý thuyết chi tiết, định lý, công thức toán học...',
            minHeight: '220px',
            onChange: () => updatePreview()
        });
    }

    initMathLiveEvents();
    bindEvents();
    await fetchAndRenderTreeData();
    resetFormToCreateNew();
});

function guardAdminRoute() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            if (window.toast) toast.error("Vui lòng đăng nhập tài khoản Quản trị viên.");
            setTimeout(() => window.location.href = "login.html", 1200);
            return;
        }

        try {
            const userSnap = await getDoc(doc(db, "users", user.uid));
            if (!userSnap.exists() || userSnap.data().role !== "admin") {
                alert("Truy cập bị từ chối: Chỉ Quản trị viên mới có quyền vào đây!");
                window.location.href = "knowledge.html";
            }
        } catch (err) {
            console.error("Lỗi kiểm tra quyền truy cập:", err);
            window.location.href = "knowledge.html";
        }
    });
}

// ==========================================
// 1. TẢI VÀ RENDER CÂY KIẾN THỨC (CỘT TRÁI + DROPDOWN CHA)
// ==========================================
async function fetchAndRenderTreeData() {
    try {
        // Tải song song Thư mục, Bài viết & Bài tập
        const [foldersSnap, articlesSnap, problemsSnap] = await Promise.all([
            getDocs(collection(db, "knowledgeFolders")),
            getDocs(collection(db, "knowledgeArticles")),
            getDocs(collection(db, "problems"))
        ]);

        state.foldersList = foldersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.articlesList = articlesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.problemsList = problemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        renderDropdownFolderOptions();
        renderSidebarTree();
        renderProblemsGridForKnowledge();
    } catch (err) {
        console.error("Lỗi tải dữ liệu cây kiến thức:", err);
    }
}

function renderProblemsGridForKnowledge() {
    const grid = document.getElementById("problemsGridForKnowledge");
    if (!grid) return;

    if (!state.problemsList || state.problemsList.length === 0) {
        grid.innerHTML = `<span class="text-muted">Chưa có bài tập nào trong kho bài tập.</span>`;
        return;
    }

    const searchStr = (document.getElementById("searchProblemForKnowledgeInput")?.value || "").toLowerCase().trim();
    const filtered = state.problemsList.filter(p => !searchStr || (p.title || "").toLowerCase().includes(searchStr));

    grid.innerHTML = filtered.map(p => `
        <label class="template-item">
            <input type="checkbox" class="chk-knowledge-problem" value="${p.id}">
            <span>[${p.visibility === 'onlycourse' ? '🔒 Course' : '🌐 Public'}] ${p.grade ? `Lớp ${p.grade} - ` : ''}${escapeHtml(p.title || p.id)}</span>
        </label>
    `).join("");

    document.getElementById("searchProblemForKnowledgeInput")?.addEventListener("input", () => {
        renderProblemsGridForKnowledge();
    });
}

function renderDropdownFolderOptions() {
    let optionsHtml = `<option value="">🌳 Root (Cấp cao nhất)</option>`;
    
    const buildTreeOptions = (parentId = null, prefix = "") => {
        const children = state.foldersList.filter(f => (f.parentId || null) === parentId);
        children.forEach(child => {
            const icon = child.icon || "📁";
            optionsHtml += `<option value="${child.id}">${prefix}${icon} ${child.name}</option>`;
            buildTreeOptions(child.id, prefix + "&nbsp;&nbsp;&nbsp;&nbsp;");
        });
    };

    buildTreeOptions(null, "");
    elements.parentFolderSelect.innerHTML = optionsHtml;
}

function renderSidebarTree(filterKeyword = "") {
    if (!elements.knowledgeTreeContainer) return;

    const keyword = filterKeyword.toLowerCase().trim();

    const buildTreeHtml = (parentId = null) => {
        const childFolders = state.foldersList.filter(f => (f.parentId || null) === parentId);
        const childArticles = state.articlesList.filter(a => (a.folderId || null) === parentId);

        let html = "";

        // Render Folders
        childFolders.forEach(folder => {
            if (keyword && !folder.name.toLowerCase().includes(keyword)) return;

            const isEditingThis = state.editingId === folder.id && state.nodeType === "folder";
            const subTree = buildTreeHtml(folder.id);

            html += `
                <div class="tree-folder-item">
                    <button type="button" class="tree-node-btn ${isEditingThis ? 'active' : ''}" onclick="window.selectNodeToEdit('${folder.id}', 'folder')">
                        <span>${folder.icon || '📁'} ${escapeHtml(folder.name)}</span>
                        <small class="text-muted">📁</small>
                    </button>
                    <div class="tree-children">${subTree}</div>
                </div>
            `;
        });

        // Render Articles
        childArticles.forEach(article => {
            if (keyword && !article.title.toLowerCase().includes(keyword)) return;

            const isEditingThis = state.editingId === article.id && state.nodeType === "article";
            html += `
                <div class="tree-article-item">
                    <button type="button" class="tree-node-btn ${isEditingThis ? 'active' : ''}" onclick="window.selectNodeToEdit('${article.id}', 'article')">
                        <span>📄 ${escapeHtml(article.title)}</span>
                    </button>
                </div>
            `;
        });

        return html;
    };

    const fullTree = buildTreeHtml(null);
    elements.knowledgeTreeContainer.innerHTML = fullTree || `<p class="text-muted text-center p-2">Không có mục nào</p>`;
}

// ==========================================
// 2. NẠP DỮ LIỆU CỦA ĐỐI TƯỢNG ĐƯỢC CHỌN VÀO FORM
// ==========================================
window.selectNodeToEdit = (id, type) => {
    state.editingId = id;
    state.nodeType = type;

    // Cập nhật Radio button
    elements.radioNodeTypes.forEach(r => r.checked = (r.value === type));

    // Cập nhật giao diện Trạng thái
    elements.editingStatusBadge.className = "badge badge-warning";
    elements.editingStatusBadge.textContent = `✏️ Đang sửa: ${type === 'folder' ? 'Thư mục' : 'Bài viết'}`;
    elements.btnDeleteCurrent.classList.remove("hidden");
    elements.btnPublish.textContent = "💾 Cập nhật thay đổi";

    if (type === "folder") {
        elements.folderFields.classList.remove("hidden");
        elements.articleFields.classList.add("hidden");

        const folder = state.foldersList.find(f => f.id === id);
        if (folder) {
            elements.folderName.value = folder.name || "";
            elements.folderSlug.value = folder.slug || "";
            elements.folderIcon.value = folder.icon || "📁";
            elements.folderDesc.value = folder.description || "";
            elements.parentFolderSelect.value = folder.parentId || "";
        }
    } else {
        elements.folderFields.classList.add("hidden");
        elements.articleFields.classList.remove("hidden");

        const article = state.articlesList.find(a => a.id === id);
        if (article) {
            elements.articleTitle.value = article.title || "";
            elements.articleSlug.value = article.slug || "";
            elements.articleSummary.value = article.summary || "";
            elements.parentFolderSelect.value = article.folderId || "";

            if (elements.chkFeatured) elements.chkFeatured.checked = !!article.featured;
            if (elements.chkSearchable) elements.chkSearchable.checked = article.searchable !== false;
            if (elements.chkAiEnabled) elements.chkAiEnabled.checked = article.aiEnabled !== false;
            if (elements.chkHidden) elements.chkHidden.checked = !!article.hidden;

            const visibilityVal = article.visibility || "public";
            const radio = document.querySelector(`input[name="articleVisibility"][value="${visibilityVal}"]`);
            if (radio) radio.checked = true;

            const linkedIds = article.linkedProblems || [];
            document.querySelectorAll(".chk-knowledge-problem").forEach(cb => {
                cb.checked = linkedIds.includes(cb.value);
            });

            if (articleEditor) {
                articleEditor.setContent(article.content || article.contentHtml || "");
            }

            // Load Blocks & normalize images
            state.blocks = (article.blocks || []).map(b => {
                const blockCopy = {
                    ...b,
                    id: "block_" + Date.now() + "_" + Math.floor(Math.random() * 10000)
                };
                if (blockCopy.type === "image") {
                    if (!Array.isArray(blockCopy.images)) {
                        blockCopy.images = [];
                        if (blockCopy.url) {
                            blockCopy.images.push({
                                id: "img_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
                                url: blockCopy.url,
                                caption: blockCopy.caption || ""
                            });
                        }
                    }
                }
                return blockCopy;
            });
            renderBlocksUI();
        }
    }

    renderSidebarTree();
    updatePreview();
};

function resetFormToCreateNew() {
    state.editingId = null;
    state.blocks = [];
    
    elements.editingStatusBadge.className = "badge badge-success";
    elements.editingStatusBadge.textContent = "✨ Đang chế độ: TẠO MỚI";
    elements.btnDeleteCurrent.classList.add("hidden");
    elements.btnPublish.textContent = "🚀 Đăng Node mới";

    // Clear inputs
    elements.articleTitle.value = "";
    elements.articleSlug.value = "";
    elements.articleSummary.value = "";
    elements.folderName.value = "";
    elements.folderSlug.value = "";
    elements.folderIcon.value = "📁";
    elements.folderDesc.value = "";
    elements.parentFolderSelect.value = "";

    if (articleEditor) {
        articleEditor.setContent("");
    }

    // Mặc định chọn Article
    state.nodeType = "article";
    elements.radioNodeTypes.forEach(r => r.checked = (r.value === "article"));
    elements.folderFields.classList.add("hidden");
    elements.articleFields.classList.remove("hidden");

    // Thêm block mẫu
    addBlock("definition");
    renderSidebarTree();
    updatePreview();
}

// ==========================================
// 3. EVENT BINDINGS
// ==========================================
function bindEvents() {
    elements.btnNewNode?.addEventListener("click", resetFormToCreateNew);
    elements.btnResetForm?.addEventListener("click", resetFormToCreateNew);

    // Tìm kiếm nhanh cây kiến thức
    elements.searchTreeInput?.addEventListener("input", (e) => {
        renderSidebarTree(e.target.value);
    });

    // Switch Node Type
    elements.radioNodeTypes.forEach(radio => {
        radio.addEventListener("change", (e) => {
            state.nodeType = e.target.value;
            if (state.nodeType === "folder") {
                elements.folderFields.classList.remove("hidden");
                elements.articleFields.classList.add("hidden");
            } else {
                elements.folderFields.classList.add("hidden");
                elements.articleFields.classList.remove("hidden");
            }
            updatePreview();
        });
    });

    // Auto Slug
    elements.articleTitle?.addEventListener("input", (e) => {
        if (!state.editingId) elements.articleSlug.value = generateSlug(e.target.value);
        updatePreview();
    });

    elements.folderName?.addEventListener("input", (e) => {
        if (!state.editingId) elements.folderSlug.value = generateSlug(e.target.value);
        updatePreview();
    });

    // Toggle Dropdown Block
    elements.addBlockBtn?.addEventListener("click", () => {
        elements.blockMenuDropdown.classList.toggle("hidden");
    });

    elements.blockMenuDropdown?.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const type = e.target.getAttribute("data-type");
            addBlock(type);
            elements.blockMenuDropdown.classList.add("hidden");
        });
    });

    // Input listeners cho Preview
    elements.articleSummary?.addEventListener("input", updatePreview);
    elements.folderIcon?.addEventListener("input", updatePreview);
    elements.folderDesc?.addEventListener("input", updatePreview);

    // Save & Delete
    elements.btnPublish?.addEventListener("click", handleSaveNode);
    elements.btnDeleteCurrent?.addEventListener("click", handleDeleteNode);
}

// ==========================================
// 4. LƯU & XÓA FIRESTORE
// ==========================================
async function handleSaveNode() {
    try {
        const parentId = elements.parentFolderSelect.value || null;

        if (state.nodeType === "folder") {
            const folderName = elements.folderName.value.trim();
            if (!folderName) {
                alert("Vui lòng nhập tên thư mục!");
                elements.folderName.focus();
                return;
            }

            const folderPayload = {
                name: folderName,
                slug: elements.folderSlug.value.trim() || generateSlug(folderName),
                parentId: parentId,
                icon: elements.folderIcon.value.trim() || "📁",
                description: elements.folderDesc.value.trim(),
                updatedAt: serverTimestamp()
            };

            if (state.editingId) {
                await updateDoc(doc(db, "knowledgeFolders", state.editingId), folderPayload);
                alert("✅ Đã cập nhật thư mục!");
            } else {
                folderPayload.hidden = false;
                folderPayload.createdAt = serverTimestamp();
                await addDoc(collection(db, "knowledgeFolders"), folderPayload);
                alert("✅ Đã tạo thư mục mới!");
            }

        } else {
            const articleTitle = elements.articleTitle.value.trim();
            if (!articleTitle) {
                alert("Vui lòng nhập tiêu đề bài học!");
                elements.articleTitle.focus();
                return;
            }

            // Đồng bộ dữ liệu từ các block editors
            state.blocks.forEach(block => {
                ["content", "description", "problem", "solution"].forEach(field => {
                    const key = `${block.id}_${field}`;
                    if (blockEditors.has(key)) {
                        const ed = blockEditors.get(key);
                        block[field] = ed.getHTML();
                        block[`${field}Data`] = ed.getJSON();
                    }
                });
            });

            // Tải ảnh mới lên Cloudinary khi bấm nút Đăng/Cập nhật
            let pendingFilesCount = 0;
            state.blocks.forEach(block => {
                if (block.type === "image" && Array.isArray(block.images)) {
                    block.images.forEach(img => {
                        if (img.file && !img.url) pendingFilesCount++;
                    });
                }
            });

            if (pendingFilesCount > 0) {
                if (elements.btnPublish) {
                    elements.btnPublish.disabled = true;
                    elements.btnPublish.textContent = `⏳ Đang tải ${pendingFilesCount} ảnh lên Cloudinary...`;
                }

                for (const block of state.blocks) {
                    if (block.type === "image" && Array.isArray(block.images)) {
                        for (const img of block.images) {
                            if (img.file && !img.url) {
                                try {
                                    const uploadRes = await uploadImage(img.file);
                                    img.url = uploadRes.url;
                                    if (img.tempUrl) {
                                        URL.revokeObjectURL(img.tempUrl);
                                        delete img.tempUrl;
                                    }
                                    delete img.file;
                                } catch (err) {
                                    console.error("Lỗi tải ảnh Cloudinary:", err);
                                    alert(`❌ Không thể tải ảnh "${img.file.name}" lên Cloudinary: ${err.message}`);
                                    if (elements.btnPublish) {
                                        elements.btnPublish.disabled = false;
                                        elements.btnPublish.textContent = state.editingId ? "💾 Cập nhật thay đổi" : "🚀 Đăng Node mới";
                                    }
                                    return;
                                }
                            }
                        }
                    }
                }
            }

            const cleanBlocks = state.blocks.map(({ id, ...rest }) => {
                if (rest.type === "image" && Array.isArray(rest.images)) {
                    const cleanedImages = rest.images.map(img => ({
                        url: img.url || "",
                        caption: img.caption || ""
                    })).filter(img => img.url);

                    return {
                        ...rest,
                        images: cleanedImages,
                        url: cleanedImages[0]?.url || rest.url || "",
                        caption: rest.caption || cleanedImages[0]?.caption || ""
                    };
                }
                return rest;
            });

            const articleVisibilityVal = document.querySelector('input[name="articleVisibility"]:checked')?.value || "public";
            const selectedProblemIds = Array.from(document.querySelectorAll(".chk-knowledge-problem:checked")).map(cb => cb.value);

            const articlePayload = {
                title: articleTitle,
                slug: elements.articleSlug.value.trim() || generateSlug(articleTitle),
                folderId: parentId,
                summary: elements.articleSummary.value.trim(),
                visibility: articleVisibilityVal,
                linkedProblems: selectedProblemIds,
                content: articleEditor ? articleEditor.getJSON() : {},             // 1. Tiptap JSON Schema - Nguồn dữ liệu chính
                contentText: articleEditor ? articleEditor.getCleanLatex() : "",   // 2. Text thuần + LaTeX ($...$) phục vụ Search & AI
                contentHtml: articleEditor ? articleEditor.getHTML() : "",         // 3. Rendered HTML
                blocks: cleanBlocks,
                featured: elements.chkFeatured ? elements.chkFeatured.checked : false,
                searchable: elements.chkSearchable ? elements.chkSearchable.checked : true,
                aiEnabled: elements.chkAiEnabled ? elements.chkAiEnabled.checked : true,
                hidden: elements.chkHidden ? elements.chkHidden.checked : false,
                updatedAt: serverTimestamp()
            };

            if (state.editingId) {
                await updateDoc(doc(db, "knowledgeArticles", state.editingId), articlePayload);
                alert("✅ Đã cập nhật bài học!");
            } else {
                articlePayload.views = 0;
                articlePayload.createdAt = serverTimestamp();
                await addDoc(collection(db, "knowledgeArticles"), articlePayload);
                alert("✅ Đã đăng bài học mới!");
            }
        }

        await fetchAndRenderTreeData();
        resetFormToCreateNew();

    } catch (err) {
        console.error("Lỗi khi lưu dữ liệu:", err);
        alert("❌ Lỗi: " + err.message);
    }
}

async function handleDeleteNode() {
    if (!state.editingId) return;

    const collectionName = state.nodeType === "folder" ? "knowledgeFolders" : "knowledgeArticles";
    const itemTypeName = state.nodeType === "folder" ? "thư mục" : "bài viết";

    if (confirm(`⚠️ Bạn có chắc chắn muốn XÓA ${itemTypeName} này không?`)) {
        try {
            await deleteDoc(doc(db, collectionName, state.editingId));
            alert("🗑️ Đã xóa thành công!");
            await fetchAndRenderTreeData();
                resetFormToCreateNew();
        } catch (err) {
            console.error("Lỗi khi xóa:", err);
            alert("❌ Không thể xóa: " + err.message);
        }
    }
}

// ==========================================
// 5. MATHLIVE & BLOCK UI LOGIC (GIỮ NGUYÊN)
// ==========================================
function initMathLiveEvents() {
    const mf = elements.globalVisualMathInput;
    if (!mf) return;

    if (window.MathfieldElement) {
        window.MathfieldElement.customVirtualKeyboards = {
            'geometry-keyboard': {
                label: '📐 Hình học',
                tooltip: 'Ký hiệu Hình học',
                layer: 'geometry-layer'
            }
        };

        window.MathfieldElement.customVirtualKeyboardLayers = {
            'geometry-layer': {
                backdrop: 'geometry-layer',
                rows: [
                    [
                        { latex: '\\triangle', label: '△' },
                        { latex: '\\angle', label: '∠' },
                        { latex: '\\widehat{A}', label: 'Â' },
                        { latex: '\\perp', label: '⊥' },
                        { latex: '\\parallel', label: '∥' },
                        { latex: '\\sim', label: '∼' }
                    ],
                    [
                        { latex: '^{\\circ}', label: '°' },
                        { latex: '\\cong', label: '≅' },
                        { latex: 'AB', label: 'AB' },
                        { latex: 'O', label: 'O' },
                        { latex: 'R', label: 'R' },
                        { latex: '\\pi', label: 'π' }
                    ]
                ]
            }
        };

        mf.mathVirtualKeyboards = 'numeric geometry-keyboard functions symbols';
    }

    mf.addEventListener("input", (e) => {
        if (elements.latexPreviewText) elements.latexPreviewText.textContent = e.target.value;
    });

    elements.btnToggleVirtualKeyboard?.addEventListener("click", () => {
        mf.focus();
        if (mf.mathVirtualKeyboardPolicy === "manual") {
            mf.mathVirtualKeyboardPolicy = "auto";
            mf.executeCommand("showVirtualKeyboard");
        } else {
            mf.executeCommand("hideVirtualKeyboard");
            mf.mathVirtualKeyboardPolicy = "manual";
        }
    });
}

function addBlock(type = "text") {
    const blockId = "block_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    let newBlock = { id: blockId, type: type, title: "" };

    switch (type) {
        case "definition":
        case "remember":
        case "text":
        case "quote":
            newBlock.content = "";
            break;
        case "formula":
            newBlock.latex = elements.globalVisualMathInput ? elements.globalVisualMathInput.value : "";
            newBlock.description = "";
            break;
        case "example":
            newBlock.problem = "";
            newBlock.solution = "";
            break;
        case "image":
            newBlock.url = "";
            newBlock.caption = "";
            newBlock.images = [];
            break;
        case "code":
            newBlock.language = "javascript";
            newBlock.code = "";
            break;
    }

    state.blocks.push(newBlock);
    renderBlocksUI();
    updatePreview();
}

let blockEditors = new Map();

function destroyBlockEditors() {
    blockEditors.clear();
}

function renderBlocksUI() {
    elements.blockList.innerHTML = state.blocks.map((block, index) => {
        return `
            <div class="block-item nohover card" data-id="${block.id}">
                <div class="block-header">
                    <span class="block-badge">${getBlockBadgeLabel(block.type)}</span>
                    <div class="block-actions">
                        <button type="button" class="btn-sm btn-outline" onclick="window.moveBlock(${index}, -1)">▲</button>
                        <button type="button" class="btn-sm btn-outline" onclick="window.moveBlock(${index}, 1)">▼</button>
                        <button type="button" class="btn-remove-block" onclick="window.removeBlock('${block.id}')">✕ Xóa</button>
                    </div>
                </div>
                <div class="block-body">
                    <div class="form-group mb-2">
                        <input type="text" data-field="title" class="form-control" placeholder="Tiêu đề block..." value="${escapeHtml(block.title || '')}">
                    </div>
                    ${renderBlockSpecificInputs(block)}
                </div>
            </div>
        `;
    }).join("");

    bindBlockInputsEvents();
}

function renderBlockSpecificInputs(block) {
    switch (block.type) {
        case "formula":
            return `
                <div class="form-group mb-2">
                    <label class="form-label">Công thức LaTeX:</label>
                    <div class="input-with-action">
                        <textarea data-field="latex" class="form-control" rows="2" placeholder="LaTeX...">${escapeHtml(block.latex || '')}</textarea>
                        <button type="button" class="btn-sm btn-secondary mt-1" onclick="window.copyFromMathEditor('${block.id}')">📥 Lấy từ Math Editor</button>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Mô tả chi tiết (Rich Math Editor):</label>
                    <div id="editor_${block.id}_description" class="block-editor-box"></div>
                </div>
            `;
        case "example":
            return `
                <div class="form-group mb-2">
                    <label class="form-label">Đề bài ví dụ (Rich Math Editor):</label>
                    <div id="editor_${block.id}_problem" class="block-editor-box"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">Lời giải mẫu (Rich Math Editor):</label>
                    <div id="editor_${block.id}_solution" class="block-editor-box"></div>
                </div>
            `;
        case "image": {
            const images = Array.isArray(block.images) ? block.images : [];
            const imagesListHtml = images.map((img, idx) => {
                const src = img.tempUrl || img.url || "";
                const isPending = !!img.file;
                const statusBadge = isPending 
                    ? `<span class="badge badge-warning">⏳ Chờ tải lên khi đăng</span>`
                    : `<span class="badge badge-success">✅ Đã tải lên</span>`;
                
                return `
                    <div class="image-preview-card">
                        <div class="img-thumb-box">
                            <img src="${escapeHtml(src)}" alt="Preview">
                        </div>
                        <div class="img-info-box">
                            <div class="flex-between align-center mb-1">
                                <small class="text-muted fw-bold">Ảnh #${idx + 1}</small>
                                ${statusBadge}
                            </div>
                            <input type="text" 
                                class="form-control form-control-sm img-caption-input" 
                                placeholder="Chú thích riêng cho ảnh này..." 
                                value="${escapeHtml(img.caption || '')}"
                                data-img-id="${img.id}">
                        </div>
                        <div class="img-action-box">
                            <button type="button" class="btn-sm btn-danger" onclick="window.removeImageFromBlock('${block.id}', '${img.id}')" title="Xóa ảnh này">✕ Xóa</button>
                        </div>
                    </div>
                `;
            }).join("");

            return `
                <div class="form-group mb-2">
                    <label class="form-label">Tải ảnh từ máy tính (Có thể chọn nhiều ảnh cùng lúc, tải lên Cloudinary khi bấm Đăng):</label>
                    <input type="file" accept="image/*" multiple class="form-control block-image-file-input">
                </div>
                <div class="form-group mb-2">
                    <label class="form-label">Hoặc thêm ảnh từ Đường dẫn URL:</label>
                    <div class="input-group">
                        <input type="url" class="form-control block-image-url-input" placeholder="https://...">
                        <button type="button" class="btn-sm btn-secondary btn-add-url-img">+ Thêm URL</button>
                    </div>
                </div>
                <div class="form-group mb-2">
                    <label class="form-label">Chú thích chung của block (Caption):</label>
                    <input type="text" data-field="caption" class="form-control" placeholder="Chú thích..." value="${escapeHtml(block.caption || '')}">
                </div>
                ${images.length > 0 ? `
                    <div class="form-group mt-3">
                        <label class="form-label fw-bold">Danh sách ảnh (${images.length} ảnh):</label>
                        <div class="image-preview-list">
                            ${imagesListHtml}
                        </div>
                    </div>
                ` : `<p class="text-muted small italic mt-2">Chưa có ảnh nào trong block này.</p>`}
            `;
        }
        case "code":
            return `
                <div class="form-group mb-2">
                    <input type="text" data-field="language" class="form-control" placeholder="Language..." value="${escapeHtml(block.language || 'javascript')}">
                </div>
                <div class="form-group">
                    <textarea data-field="code" class="form-control code-font" rows="3">${escapeHtml(block.code || '')}</textarea>
                </div>
            `;
        default: // definition, remember, text, quote
            return `
                <div class="form-group">
                    <label class="form-label">Nội dung (Rich Math Editor):</label>
                    <div id="editor_${block.id}_content" class="block-editor-box"></div>
                </div>
            `;
    }
}

function bindBlockInputsEvents() {
    destroyBlockEditors();

    state.blocks.forEach(block => {
        const container = elements.blockList.querySelector(`[data-id="${block.id}"]`);
        if (!container) return;

        // Bind standard text / inputs
        container.querySelectorAll("textarea[data-field], input[data-field]").forEach(input => {
            input.addEventListener("input", (e) => {
                const field = e.target.getAttribute("data-field");
                block[field] = e.target.value;
                updatePreview();
            });
        });

        // Handle Image Block interactions (Multi-image, local preview, caption binding)
        if (block.type === "image") {
            if (!Array.isArray(block.images)) block.images = [];

            const fileInput = container.querySelector(".block-image-file-input");
            if (fileInput) {
                fileInput.addEventListener("change", (e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length === 0) return;

                    files.forEach(file => {
                        const tempUrl = URL.createObjectURL(file);
                        block.images.push({
                            id: "img_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
                            file: file,
                            tempUrl: tempUrl,
                            url: "",
                            caption: ""
                        });
                    });

                    if (block.images.length > 0) {
                        block.url = block.images[0].url || block.images[0].tempUrl || "";
                    }

                    renderBlocksUI();
                    updatePreview();
                });
            }

            const addUrlBtn = container.querySelector(".btn-add-url-img");
            const urlInput = container.querySelector(".block-image-url-input");
            if (addUrlBtn && urlInput) {
                addUrlBtn.addEventListener("click", () => {
                    const val = urlInput.value.trim();
                    if (!val) return;

                    block.images.push({
                        id: "img_" + Date.now() + "_" + Math.floor(Math.random() * 10000),
                        url: val,
                        caption: ""
                    });

                    if (block.images.length > 0) {
                        block.url = block.images[0].url || "";
                    }

                    urlInput.value = "";
                    renderBlocksUI();
                    updatePreview();
                });
            }

            container.querySelectorAll(".img-caption-input").forEach(input => {
                input.addEventListener("input", (e) => {
                    const imgId = e.target.getAttribute("data-img-id");
                    const img = block.images.find(i => i.id === imgId);
                    if (img) {
                        img.caption = e.target.value;
                        updatePreview();
                    }
                });
            });
        }

        // Initialize MathEditor for block rich text fields
        const editorTargetFields = [];
        if (["definition", "remember", "text", "quote"].includes(block.type)) {
            editorTargetFields.push({ field: "content", elementId: `editor_${block.id}_content` });
        } else if (block.type === "formula") {
            editorTargetFields.push({ field: "description", elementId: `editor_${block.id}_description` });
        } else if (block.type === "example") {
            editorTargetFields.push({ field: "problem", elementId: `editor_${block.id}_problem` });
            editorTargetFields.push({ field: "solution", elementId: `editor_${block.id}_solution` });
        }

        editorTargetFields.forEach(({ field, elementId }) => {
            const targetEl = document.getElementById(elementId);
            if (targetEl) {
                const ed = new MathEditor(`#${elementId}`, {
                    placeholder: `Nhập ${field}...`,
                    minHeight: '120px',
                    onChange: () => {
                        block[field] = ed.getHTML();
                        block[`${field}Data`] = ed.getJSON();
                        updatePreview();
                    }
                });
                const initialData = block[`${field}Data`] || block[field] || "";
                if (initialData) {
                    ed.setContent(initialData);
                }
                blockEditors.set(`${block.id}_${field}`, ed);
            }
        });
    });
}

window.removeBlock = (id) => {
    state.blocks = state.blocks.filter(b => b.id !== id);
    renderBlocksUI();
    updatePreview();
};

window.removeImageFromBlock = (blockId, imgId) => {
    const block = state.blocks.find(b => b.id === blockId);
    if (!block || !Array.isArray(block.images)) return;

    const img = block.images.find(i => i.id === imgId);
    if (img && img.tempUrl) {
        URL.revokeObjectURL(img.tempUrl);
    }

    block.images = block.images.filter(i => i.id !== imgId);
    if (block.images.length > 0) {
        block.url = block.images[0].url || block.images[0].tempUrl || "";
    } else {
        block.url = "";
    }

    renderBlocksUI();
    updatePreview();
};

window.moveBlock = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= state.blocks.length) return;
    const temp = state.blocks[index];
    state.blocks[index] = state.blocks[newIndex];
    state.blocks[newIndex] = temp;
    renderBlocksUI();
    updatePreview();
};

window.copyFromMathEditor = (blockId) => {
    const mf = elements.globalVisualMathInput;
    if (!mf) return;
    const block = state.blocks.find(b => b.id === blockId);
    if (block) {
        block.latex = mf.value;
        renderBlocksUI();
        updatePreview();
    }
};

function updatePreview() {
    if (!elements.livePreviewContainer) return;

    if (state.nodeType === "folder") {
        const name = elements.folderName.value.trim() || "Tên thư mục";
        const icon = elements.folderIcon.value.trim() || "📁";
        const desc = elements.folderDesc.value.trim() || "Chưa có mô tả.";

        elements.livePreviewContainer.innerHTML = `
            <div class="card nohover preview-folder-card">
                <h2>${icon} ${escapeHtml(name)}</h2>
                <p class="text-muted">${escapeHtml(desc)}</p>
                <div class="badge badge-info mt-2">Thư mục kiến thức</div>
            </div>
        `;
        return;
    }

    const title = elements.articleTitle.value.trim() || "Tiêu đề bài học";
    const summary = elements.articleSummary.value.trim() || "Mô tả tóm tắt bài học...";
    const articleHtml = articleEditor ? articleEditor.getHTML() : "";

    elements.livePreviewContainer.innerHTML = `
        <div class="article-header-preview">
            <h1 class="article-title">${escapeHtml(title)}</h1>
            <p class="article-summary">${escapeHtml(summary)}</p>
            <hr class="divider">
        </div>
        ${articleHtml ? `<div class="article-main-body mb-4">${articleHtml}</div>` : ""}
        <div class="blocks-preview-wrapper">
            ${BlockRenderer.renderBlocks(state.blocks)}
        </div>
    `;

    BlockRenderer.typesetMath();
}

function getBlockBadgeLabel(type) {
    const labels = { definition: "📖 Khái niệm", formula: "🧮 Công thức", remember: "✔ Cần nhớ", example: "💡 Ví dụ", text: "📄 Văn bản", image: "🖼️ Hình ảnh", quote: "💬 Trích dẫn", code: "💻 Code" };
    return labels[type] || "Block";
}

function generateSlug(str = "") {
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").replace(/([^0-9a-z-\s])/g, "").replace(/(\s+)/g, "-").replace(/^-+|-+$/g, "");
}

function escapeHtml(str = "") {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}