import { db, auth } from "./firebase.js";
import {
    doc,
    getDoc,
    updateDoc,
    increment,
    arrayUnion,
    arrayRemove,
    collection,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import toast from "/components/toast.js";

// =========================
// Elements
// =========================
const titleElement = document.getElementById("problemTitle");
const authorElement = document.getElementById("problemAuthor");
const dateElement = document.getElementById("problemDate");
const viewsElement = document.getElementById("problemViews");
const likesElement = document.getElementById("problemLikes");
const contentElement = document.getElementById("problemContent");
const badgesElement = document.getElementById("problemBadges");
const problemImagesElement = document.getElementById("problemImages");

const likeBtn = document.getElementById("likeBtn");
const commentForm = document.getElementById("commentForm");
const commentInput = document.getElementById("commentInput");
const submitCommentBtn = document.getElementById("submitCommentBtn");
const commentList = document.getElementById("commentList");
const commentCountElement = document.getElementById("commentCount");

const imageModal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const closeImageModalBtn = document.getElementById("closeImageModal");
const submitSolutionBtn = document.getElementById("submitSolutionBtn");
// Global States
let currentProblemId = null;
let currentProblem = null;
let currentUser = null;
let currentUsername = "Thành viên";

// =========================
// Init
// =========================
document.addEventListener("DOMContentLoaded", init);

async function init() {
    setupModalEvents();

    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
        toast.error("Không tìm thấy bài tập.");
        location.href = "problems.html";
        return;
    }

    currentProblemId = id;

    // Lắng nghe auth & tải thông tin username
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user) {
            currentUsername = await fetchUsername(user);
        }
        if (currentProblem) {
            updateLikeButtonState();
        }
    });

    await loadProblem(id);
    listenToComments(id);
    setupInteractionEvents();
}

/**
 * Tải Username từ Firestore / profile (Không hiển thị Email)
 */
async function fetchUsername(user) {
    if (!user) return "Ẩn danh";
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().username) {
            return userDoc.data().username;
        }
        if (userDoc.exists() && userDoc.data().displayName) {
            return userDoc.data().displayName;
        }
    } catch (e) {
        console.warn("Lỗi lấy thông tin user:", e);
    }
    return user.displayName || "Thành viên";
}

// =========================
// Load & Render Problem
// =========================
async function loadProblem(id) {
    try {
        const ref = doc(db, "problems", id);
        const snapshot = await getDoc(ref);

        if (!snapshot.exists() || snapshot.data().deleted || snapshot.data().hidden) {
            toast.error("Bài tập không tồn tại hoặc đã bị ẩn.");
            location.href = "problems.html";
            return;
        }

        currentProblem = {
            id: snapshot.id,
            ...snapshot.data()
        };

        render(currentProblem);

        await updateDoc(ref, {
            views: increment(1)
        });
    } catch (error) {
        console.error("Lỗi khi tải bài tập:", error);
        toast.error("Không thể tải bài tập.");
    }
}
function renderMath(element) {
    if (!element || typeof renderMathInElement !== "function") return;
    
    renderMathInElement(element, {
        delimiters: [
            { left: "$$", right: "$$", display: true },   // Công thức khối (dòng riêng)
            { left: "$", right: "$", display: false },   // Công thức trên cùng dòng
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true }
        ],
        throwOnError: false
    });
}
function render(problem) {
    document.title = `${problem.title || "Chi tiết bài tập"} - MikeMath`;

    titleElement.textContent = problem.title || "Bài tập không tên";
    authorElement.textContent = problem.authorName || "Ẩn danh";
    
    // Ưu tiên render contentHtml nếu có, nếu không thì fallback về content
    if (problem.contentHtml) {
        contentElement.innerHTML = problem.contentHtml;
    } else {
        contentElement.textContent = problem.content || "";
        // Nếu dùng content thô thì mới cần gọi KaTeX render lại
        if (typeof renderMath === "function") renderMath(contentElement);
    }

    viewsElement.textContent = problem.views || 0;
    likesElement.textContent = problem.likes || 0;

    if (problem.createdAt?.seconds) {
        const date = new Date(problem.createdAt.seconds * 1000);
        dateElement.textContent = date.toLocaleDateString("vi-VN");
    } else {
        dateElement.textContent = "-";
    }

    renderBadges(problem);
    renderGallery(problem.images, problemImagesElement);
    updateLikeButtonState();
}

function renderBadges(problem) {
    if (!badgesElement) return;
    badgesElement.innerHTML = "";

    const diffMap = { easy: "Dễ", medium: "Trung bình", hard: "Khó" };
    const gradeText = problem.grade ? `Lớp ${problem.grade}` : "Mọi lớp";
    const diffText = diffMap[problem.difficulty] || "Chưa rõ";

    let html = `<span class="badge">${gradeText}</span>`;

    if (problem.topic) {
        html += `<span class="badge" style="background: #e0f2fe; color: #0369a1; border-color: #7dd3fc;">${escapeHtml(problem.topic)}</span>`;
    }

    html += `<span class="badge" style="background: #fef3c7; color: #b45309; border-color: #fde68a;">${diffText}</span>`;

    badgesElement.innerHTML = html;
}

function renderGallery(images, container) {
    if (!container) return;
    container.innerHTML = "";

    if (!Array.isArray(images) || images.length === 0) return;

    images.forEach(img => {
        if (!img) return;
        const imgUrl = typeof img === "object" ? (img.url || img.secure_url || "") : String(img);
        if (!imgUrl) return;

        const imgCard = document.createElement("div");
        imgCard.style.cssText = `
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid var(--border-color, #e2e8f0);
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            aspect-ratio: 4/3;
            background: #f8fafc;
            cursor: pointer;
        `;

        imgCard.innerHTML = `
            <img src="${escapeHtml(imgUrl)}" 
                 alt="Hình ảnh đính kèm" 
                 style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s ease;"
                 onmouseover="this.style.transform='scale(1.04)'"
                 onmouseout="this.style.transform='scale(1)'">
        `;

        imgCard.addEventListener("click", () => openModal(imgUrl));
        container.appendChild(imgCard);
    });
}

// =========================
// Like Feature
// =========================
function updateLikeButtonState() {
    if (!likeBtn || !currentProblem) return;

    const likedBy = currentProblem.likedBy || [];
    const isLiked = currentUser && likedBy.includes(currentUser.uid);

    if (isLiked) {
        likeBtn.classList.add("btn-liked");
        likeBtn.innerHTML = `👍 Đã thích (${currentProblem.likes || 0})`;
    } else {
        likeBtn.classList.remove("btn-liked");
        likeBtn.innerHTML = `👍 Thích (${currentProblem.likes || 0})`;
    }
}

async function handleToggleLike() {
    if (!currentUser) {
        toast.error("Vui lòng đăng nhập để thích bài viết.");
        return;
    }

    if (!currentProblemId || !currentProblem) return;

    const likedBy = currentProblem.likedBy || [];
    const isLiked = likedBy.includes(currentUser.uid);
    const ref = doc(db, "problems", currentProblemId);

    try {
        likeBtn.disabled = true;

        if (isLiked) {
            await updateDoc(ref, {
                likes: increment(-1),
                likedBy: arrayRemove(currentUser.uid)
            });
            currentProblem.likes = Math.max(0, (currentProblem.likes || 1) - 1);
            currentProblem.likedBy = likedBy.filter(uid => uid !== currentUser.uid);
            toast.info("Đã bỏ thích.");
        } else {
            await updateDoc(ref, {
                likes: increment(1),
                likedBy: arrayUnion(currentUser.uid)
            });
            currentProblem.likes = (currentProblem.likes || 0) + 1;
            currentProblem.likedBy = [...likedBy, currentUser.uid];
            toast.success("Đã thích bài viết!");
        }

        likesElement.textContent = currentProblem.likes;
        updateLikeButtonState();
    } catch (error) {
        console.error("Lỗi thao tác Like:", error);
        toast.error("Không thể thực hiện thao tác này.");
    } finally {
        likeBtn.disabled = false;
    }
}

// =========================
// Real-time Comments & Recursive Tree Rendering (Vô hạn cấp)
// =========================
function listenToComments(problemId) {
    const commentsRef = collection(db, "problems", problemId, "comments");
    const q = query(commentsRef, orderBy("createdAt", "asc"));

    onSnapshot(q, (snapshot) => {
        if (commentCountElement) {
            commentCountElement.textContent = snapshot.size;
        }

        if (!commentList) return;
        commentList.innerHTML = "";

        if (snapshot.empty) {
            commentList.innerHTML = `<p style="color: #64748b; text-align: center; padding: 12px;">Chưa có bình luận nào. Hãy là người đầu tiên bình luận!</p>`;
            return;
        }

        const commentsMap = {};
        const rootComments = [];

        // 1. Lưu các comment vào Map
        snapshot.forEach(docSnap => {
            const data = { id: docSnap.id, ...docSnap.data(), children: [] };
            commentsMap[data.id] = data;
        });

        // 2. Dựng cấu trúc cây Cha - Con lồng nhau vô hạn
        Object.values(commentsMap).forEach(comment => {
            if (comment.parentId && commentsMap[comment.parentId]) {
                commentsMap[comment.parentId].children.push(comment);
            } else {
                rootComments.push(comment);
            }
        });

        // 3. Render cây bình luận
        rootComments.forEach(root => {
            commentList.appendChild(renderCommentNode(root));
        });
    }, (error) => {
        console.error("Lỗi khi nghe bình luận:", error);
    });
}

/**
 * Hàm đệ quy render Node Bình luận & xử lý nút "Xem thêm câu trả lời"
 */
function renderCommentNode(comment) {
    const container = document.createElement("div");
    container.className = "comment-item";
    container.id = `comment-${comment.id}`;

    let timeStr = "Vừa xong";
    if (comment.createdAt?.seconds) {
        timeStr = new Date(comment.createdAt.seconds * 1000).toLocaleString("vi-VN");
    }

    const upvoted = currentUser && (comment.upvotes || []).includes(currentUser.uid);
    const downvoted = currentUser && (comment.downvotes || []).includes(currentUser.uid);
    const score = (comment.score || 0);
    const hasChildren = comment.children && comment.children.length > 0;

    container.innerHTML = `
        <div class="comment-header">
            <span class="comment-author">${escapeHtml(comment.authorUsername || comment.authorName || "Ẩn danh")}</span>
            <span class="comment-time">${timeStr}</span>
        </div>
        <div class="comment-body">${escapeHtml(comment.content || "")}</div>
        <div class="comment-actions-bar">
            <button class="vote-btn ${upvoted ? 'upvoted' : ''}" data-vote="up">▲</button>
            <span class="vote-score">${score}</span>
            <button class="vote-btn ${downvoted ? 'downvoted' : ''}" data-vote="down">▼</button>
            <button class="btn-reply-toggle">💬 Trả lời</button>
        </div>
        
        <div class="reply-form-container hidden"></div>

        ${hasChildren ? `
            <button class="btn-toggle-replies" data-open="false">
                ▶ Xem thêm ${comment.children.length} câu trả lời
            </button>
        ` : ''}

        <div class="comment-replies-container hidden"></div>
    `;

    // Upvote / Downvote Handlers
    const upBtn = container.querySelector('[data-vote="up"]');
    const downBtn = container.querySelector('[data-vote="down"]');

    upBtn?.addEventListener("click", () => handleVote(comment.id, "up", comment));
    downBtn?.addEventListener("click", () => handleVote(comment.id, "down", comment));

    // Form Reply Handler
    const replyToggleBtn = container.querySelector('.btn-reply-toggle');
    const replyFormContainer = container.querySelector('.reply-form-container');

    replyToggleBtn?.addEventListener("click", () => {
        if (replyFormContainer.classList.contains("hidden")) {
            replyFormContainer.classList.remove("hidden");
            replyFormContainer.innerHTML = `
                <form class="reply-form" style="display:flex; gap:8px; margin-top:8px;">
                    <input type="text" placeholder="Viết phản hồi cho ${escapeHtml(comment.authorUsername || 'bình luận')}..." required style="flex:1; padding:6px 12px; border:1px solid #cbd5e1; border-radius:6px;">
                    <button type="submit" class="btn-primary" style="padding:6px 12px; font-size:0.85rem;">Gửi</button>
                </form>
            `;
            const replyForm = replyFormContainer.querySelector('.reply-form');
            replyForm.addEventListener("submit", (e) => handleSendReply(e, comment.id, replyFormContainer));
        } else {
            replyFormContainer.classList.add("hidden");
            replyFormContainer.innerHTML = "";
        }
    });

    // Toggle Ẩn / Hiển thị các câu trả lời con
    if (hasChildren) {
        const toggleRepliesBtn = container.querySelector('.btn-toggle-replies');
        const repliesContainer = container.querySelector('.comment-replies-container');

        // Render đệ quy tất cả phản hồi con
        comment.children.forEach(childComment => {
            repliesContainer.appendChild(renderCommentNode(childComment));
        });

        toggleRepliesBtn.addEventListener("click", () => {
            const isOpen = toggleRepliesBtn.getAttribute("data-open") === "true";
            if (isOpen) {
                repliesContainer.classList.add("hidden");
                toggleRepliesBtn.setAttribute("data-open", "false");
                toggleRepliesBtn.innerHTML = `▶ Xem thêm ${comment.children.length} câu trả lời`;
            } else {
                repliesContainer.classList.remove("hidden");
                toggleRepliesBtn.setAttribute("data-open", "true");
                toggleRepliesBtn.innerHTML = `▼ Ẩn ${comment.children.length} câu trả lời`;
            }
        });
    }

    return container;
}

// =========================
// Actions: Send Comment, Reply & Vote
// =========================
async function handleSendComment(e) {
    e.preventDefault();

    if (!currentUser) {
        toast.error("Vui lòng đăng nhập để gửi bình luận.");
        return;
    }

    const content = commentInput.value.trim();
    if (!content) {
        toast.error("Vui lòng nhập nội dung bình luận.");
        return;
    }

    try {
        submitCommentBtn.disabled = true;
        submitCommentBtn.textContent = "Đang gửi...";

        const commentsRef = collection(db, "problems", currentProblemId, "comments");
        await addDoc(commentsRef, {
            content: content,
            parentId: null,
            authorId: currentUser.uid,
            authorUsername: currentUsername,
            score: 0,
            upvotes: [],
            downvotes: [],
            createdAt: serverTimestamp()
        });

        commentInput.value = "";
        toast.success("Đã đăng bình luận!");
    } catch (error) {
        console.error("Lỗi gửi bình luận:", error);
        toast.error("Gửi bình luận thất bại.");
    } finally {
        submitCommentBtn.disabled = false;
        submitCommentBtn.textContent = "Gửi bình luận";
    }
}

async function handleSendReply(e, parentId, formContainer) {
    e.preventDefault();
    if (!currentUser) {
        toast.error("Vui lòng đăng nhập để trả lời.");
        return;
    }

    const input = formContainer.querySelector("input");
    const content = input.value.trim();
    if (!content) return;

    try {
        const commentsRef = collection(db, "problems", currentProblemId, "comments");
        await addDoc(commentsRef, {
            content: content,
            parentId: parentId,
            authorId: currentUser.uid,
            authorUsername: currentUsername,
            score: 0,
            upvotes: [],
            downvotes: [],
            createdAt: serverTimestamp()
        });

        toast.success("Đã phản hồi bình luận!");
        formContainer.classList.add("hidden");
        formContainer.innerHTML = "";
    } catch (error) {
        console.error("Lỗi gửi phản hồi:", error);
        toast.error("Không thể gửi phản hồi.");
    }
}

async function handleVote(commentId, voteType, commentData) {
    if (!currentUser) {
        toast.error("Vui lòng đăng nhập để bình chọn.");
        return;
    }

    const commentRef = doc(db, "problems", currentProblemId, "comments", commentId);
    const upvotes = commentData.upvotes || [];
    const downvotes = commentData.downvotes || [];
    const uid = currentUser.uid;

    let newUpvotes = [...upvotes];
    let newDownvotes = [...downvotes];

    if (voteType === "up") {
        if (upvotes.includes(uid)) {
            newUpvotes = newUpvotes.filter(id => id !== uid);
        } else {
            newUpvotes.push(uid);
            newDownvotes = newDownvotes.filter(id => id !== uid);
        }
    } else if (voteType === "down") {
        if (downvotes.includes(uid)) {
            newDownvotes = newDownvotes.filter(id => id !== uid);
        } else {
            newDownvotes.push(uid);
            newUpvotes = newUpvotes.filter(id => id !== uid);
        }
    }

    const newScore = newUpvotes.length - newDownvotes.length;

    try {
        await updateDoc(commentRef, {
            upvotes: newUpvotes,
            downvotes: newDownvotes,
            score: newScore
        });
    } catch (error) {
        console.error("Lỗi vote bình luận:", error);
        toast.error("Không thể thực hiện bình chọn.");
    }
}

function setupInteractionEvents() {
    likeBtn?.addEventListener("click", handleToggleLike);
    commentForm?.addEventListener("submit", handleSendComment);
    const submitSolutionBtn = document.getElementById("submitSolutionBtn");
    submitSolutionBtn?.addEventListener("click", () => {
        if (currentProblemId) {
            window.location.href = `submit.html?id=${currentProblemId}`;
        } else {
            window.location.href = "submit.html";
        }
    });
}

// =========================
// Lightbox Modal
// =========================
function openModal(url) {
    if (!imageModal || !modalImage) return;
    modalImage.src = url;
    imageModal.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeModal() {
    if (!imageModal) return;
    imageModal.classList.remove("active");
    document.body.style.overflow = "";
}

function setupModalEvents() {
    if (!imageModal) return;

    closeImageModalBtn?.addEventListener("click", closeModal);

    imageModal.addEventListener("click", (e) => {
        if (e.target === imageModal) {
            closeModal();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && imageModal.classList.contains("active")) {
            closeModal();
        }
    });
}

function escapeHtml(str = "") {
    const stringValue = typeof str === "string" ? str : String(str ?? "");
    return stringValue
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}