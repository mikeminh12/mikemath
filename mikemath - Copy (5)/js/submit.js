/**
 * submit.js - MikeMath Submission Handler
 * Runtime: ES Module / Browser
 */

import { db, auth } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  increment,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import toast from "/components/toast.js";
import { uploadImages } from "./cloudinary.js";
import { gradeSubmission } from "./ai.js";
import { fetchRecommendedKnowledgeArticles } from "./course-engine/learning-profile.js";
import { MathEditor } from "./editor/MathEditor.js";

// ==========================================
// GLOBAL STATE
// ==========================================
let currentUser = null;
let currentProblem = null;
let currentProblemId = null;
let selectedMode = "image"; // Default mode: "image" | "text"
let selectedFiles = [];
let qrUnsubscribe = null;
/**
 * Cập nhật điểm cao nhất của bài tập & Tổng điểm của User
 * @param {string} userId - ID người dùng
 * @param {string} problemId - ID bài tập
 * @param {number} newScore - Điểm vừa chấm được từ AI
 */
// ==========================================
// DOM ELEMENTS
// ==========================================
const DOM = {
  problemTitle: document.getElementById("problemTitle"),
  problemAuthor: document.getElementById("problemAuthor"),
  problemGrade: document.getElementById("problemGrade"),
  problemTopic: document.getElementById("problemTopic"),
  problemDifficulty: document.getElementById("problemDifficulty"),

  submissionForm: document.getElementById("submissionForm"),
  cardUpload: document.getElementById("cardUpload"),
  cardText: document.getElementById("cardText"),

  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  previewGrid: document.getElementById("previewGrid"),

  solutionText: document.getElementById("solutionText"),
  charCount: document.getElementById("charCount"),

  submitBtn: document.getElementById("submitBtn"),
  loadingStatus: document.getElementById("loadingStatus")
};

// ==========================================
// INITIALIZATION
// ==========================================
let solutionEditor = null;

function init() {
  // 1. Đọc problemId từ URL (?id=xxxx)
  const urlParams = new URLSearchParams(window.location.search);
  currentProblemId = urlParams.get("id");

  if (!currentProblemId) {
    toast.error("Không tìm thấy mã bài tập!");
    setTimeout(() => {
      window.location.href = "problems.html";
    }, 1500);
    return;
  }

  // Khởi tạo MathEditor cho khung nhập lời giải văn bản
  if (document.querySelector('#solution-editor-container')) {
    solutionEditor = new MathEditor('#solution-editor-container', {
      placeholder: 'Nhập chi tiết các bước giải hoặc chèn công thức toán học (Đại số, Hình học, Hy Lạp)...',
      minHeight: '200px'
    });
  }

  // 2. Kiểm tra trạng thái đăng nhập
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
    } else {
      currentUser = null;
      toast.warning("Vui lòng đăng nhập để nộp bài!");
      setTimeout(() => {
        window.location.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
      }, 1500);
    }
  });

  // 3. Tải thông tin bài tập
  loadProblem(currentProblemId);

  // 4. Lắng nghe các sự kiện UI
  bindEvents();
}

// ==========================================
// LOAD PROBLEM DATA
// ==========================================
async function loadProblem(problemId) {
  try {
    const docRef = doc(db, "problems", problemId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      toast.error("Bài tập không tồn tại hoặc đã bị xóa!");
      setTimeout(() => {
        window.location.href = "problems.html";
      }, 1500);
      return;
    }

    currentProblem = { id: docSnap.id, ...docSnap.data() };

    // Render thông tin bài tập lên giao diện
    if (DOM.problemTitle) DOM.problemTitle.textContent = currentProblem.title || "Bài tập không có tiêu đề";
    if (DOM.problemAuthor) DOM.problemAuthor.textContent = currentProblem.authorName || "Ẩn danh";
    if (DOM.problemGrade) DOM.problemGrade.textContent = currentProblem.grade ? `Lớp ${currentProblem.grade}` : "N/A";
    if (DOM.problemTopic) DOM.problemTopic.textContent = currentProblem.topic || "Chủ đề chung";
    if (DOM.problemDifficulty) DOM.problemDifficulty.textContent = currentProblem.difficulty || "Trung bình";

  } catch (error) {
    console.error("Lỗi khi tải bài tập:", error);
    toast.error("Lỗi kết nối khi tải bài tập!");
  }
}

// ==========================================
// EVENT BINDINGS
// ==========================================
function bindEvents() {
  // Chuyển đổi phương thức nộp (Sửa tên radio đúng với HTML: submitMode)
  const modeRadios = document.querySelectorAll('input[name="submitMode"]');
  if (modeRadios.length > 0) {
    modeRadios.forEach((radio) => {
      radio.addEventListener("change", (e) => switchMode(e.target.value));
    });
  }

  // Drag & Drop
  if (DOM.dropZone) {
    DOM.dropZone.addEventListener("click", () => {
      if (DOM.fileInput) DOM.fileInput.click();
    });

    DOM.dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      DOM.dropZone.classList.add("dragover");
    });

    DOM.dropZone.addEventListener("dragleave", () => {
      DOM.dropZone.classList.remove("dragover");
    });

    DOM.dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      DOM.dropZone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files);
      }
    });
  }

  // Choose File Input
  if (DOM.fileInput) {
    DOM.fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelect(e.target.files);
      }
    });
  }

  // Textarea input character count
  if (DOM.solutionText) {
    DOM.solutionText.addEventListener("input", (e) => {
      if (DOM.charCount) {
        DOM.charCount.textContent = e.target.value.length;
      }
    });
  }

  // Form Submit
  if (DOM.submissionForm) {
    DOM.submissionForm.addEventListener("submit", handleSubmit);
  }
  const btnQrUpload = document.getElementById("btnQrUpload");
  const btnCloseQrModal = document.getElementById("btnCloseQrModal");

  if (btnQrUpload) btnQrUpload.addEventListener("click", openQrModal);
  if (btnCloseQrModal) btnCloseQrModal.addEventListener("click", closeQrModal);
}

// ==========================================
// SWITCH MODE (Image / Text)
// ==========================================
function switchMode(mode) {
  selectedMode = mode;
  if (mode === "image") {
    if (DOM.cardUpload) DOM.cardUpload.classList.remove("hidden");
    if (DOM.cardText) DOM.cardText.classList.add("hidden");
  } else if (mode === "text") {
    if (DOM.cardUpload) DOM.cardUpload.classList.add("hidden");
    if (DOM.cardText) DOM.cardText.classList.remove("hidden");
  }
}

async function openQrModal() {
  if (!currentUser) {
    toast.warning("Vui lòng đăng nhập để sử dụng tính năng này!");
    return;
  }

  const qrModal = document.getElementById("qrModal");
  const qrContainer = document.getElementById("qrCodeContainer");
  qrContainer.innerHTML = "";
  qrModal.classList.remove("hidden");

  // Tạo Session ID ngẫu nhiên cho đợt quét này
  const sessionId = "qr_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
  
  // Tạo tài liệu session trong Firestore
  const sessionRef = doc(db, "qr_sessions", sessionId);
  await setDoc(sessionRef, {
    userId: currentUser.uid,
    status: "active",
    images: [],
    createdAt: serverTimestamp()
  });

  // Đường dẫn mở giao diện camera di động
  const mobileUrl = `${window.location.origin}/camera-capture.html?session=${sessionId}`;

  // Vẽ QR Code
  new QRCode(qrContainer, {
    text: mobileUrl,
    width: 180,
    height: 180
  });

  // Lắng nghe biến động Realtime khi điện thoại tải ảnh lên thành công
  qrUnsubscribe = onSnapshot(sessionRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      if (data.images && data.images.length > 0) {
        // Chuyển đổi các URL hình ảnh nhận được từ điện thoại thành File object / Preview
        handleUploadedMobileImages(data.images);
      }
    }
  });
}

function closeQrModal() {
  const qrModal = document.getElementById("qrModal");
  qrModal.classList.add("hidden");
  if (qrUnsubscribe) {
    qrUnsubscribe(); // Tắt kết nối lắng nghe
    qrUnsubscribe = null;
  }
}

// Chuyển đổi URL ảnh từ Cloudinary thành File object để tương thích với luồng nộp bài hiện tại
async function handleUploadedMobileImages(remoteImages) {
  const statusEl = document.getElementById("qrStatus");
  statusEl.textContent = `Đã nhận được ${remoteImages.length} ảnh từ điện thoại!`;

  for (const imgData of remoteImages) {
    // Kiểm tra xem ảnh này đã có trong selectedFiles chưa[cite: 1]
    const exists = selectedFiles.some(f => f.remoteUrl === imgData.url);
    if (!exists) {
      const response = await fetch(imgData.url);
      const blob = await response.blob();
      const file = new File([blob], `mobile_photo_${Date.now()}.jpg`, { type: "image/jpeg" });
      file.remoteUrl = imgData.url;

      selectedFiles.push(file);
    }
  }

  previewImages();
}

// ==========================================
// FILE SELECTION & PREVIEW
// ==========================================
function handleFileSelect(files) {
  const validImageFiles = Array.from(files).filter((file) =>
    file.type.startsWith("image/")
  );

  if (validImageFiles.length === 0) {
    toast.warning("Vui lòng chọn file hình ảnh hợp lệ!");
    return;
  }

  if (selectedFiles.length + validImageFiles.length > 10) {
    toast.warning("Chỉ được tải lên tối đa 10 ảnh!");
    return;
  }

  selectedFiles = [...selectedFiles, ...validImageFiles];
  previewImages();
  
  if (DOM.fileInput) DOM.fileInput.value = "";
}

function previewImages() {
  if (!DOM.previewGrid) return;

  DOM.previewGrid.innerHTML = "";

  selectedFiles.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imgSrc = e.target.result;
      const item = document.createElement("div");
      item.className = "preview-card";
      
      // Đã tối ưu CSS Inline chống tràn dòng & Rút gọn tên file (...)
      item.innerHTML = `
        <img src="${imgSrc}" class="preview-thumb" alt="${escapeHtml(file.name)}" style="cursor: pointer;" title="Bấm để xem ảnh phóng to" />
        <div class="preview-info">
          <span class="preview-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; width: 100%;" title="${escapeHtml(file.name)}">
            ${escapeHtml(file.name)}
          </span>
          <span class="preview-size">${formatBytes(file.size)}</span>
        </div>
        <button type="button" class="btn-remove-img" data-index="${index}" title="Bỏ chọn ảnh">&times;</button>
      `;

      // 1. Sự kiện xem ảnh phóng to
      const thumbEl = item.querySelector(".preview-thumb");
      thumbEl.addEventListener("click", () => {
        openImgPreviewModal(imgSrc, file.name);
      });

      // 2. Sự kiện xoá ảnh
      const removeBtn = item.querySelector(".btn-remove-img");
      removeBtn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        removeImage(index);
      });

      DOM.previewGrid.appendChild(item);
    };
    reader.readAsDataURL(file);
  });
}

function removeImage(index) {
  selectedFiles.splice(index, 1);
  previewImages();
}
// ==========================================
// MODAL PREVIEW IMAGE FULLSCREEN
// ==========================================
function openImgPreviewModal(src, fileName) {
  const modal = document.getElementById("imgPreviewModal");
  const modalImg = document.getElementById("modalPreviewImage");
  const modalName = document.getElementById("modalPreviewName");

  if (modal && modalImg) {
    modalImg.src = src;
    if (modalName) modalName.textContent = fileName;
    modal.classList.remove("hidden");
  }
}

// Lắng nghe sự kiện đóng Modal Preview
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("imgPreviewModal");
  const closeBtn = document.getElementById("closeImgModal");

  if (closeBtn && modal) {
    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  }
});
// ==========================================
// VALIDATION
// ==========================================
function validate() {
  if (!currentUser) {
    toast.error("Bạn chưa đăng nhập!");
    return false;
  }

  if (!currentProblem) {
    toast.error("Chưa tải được thông tin bài tập!");
    return false;
  }

  if (selectedMode === "image") {
    if (selectedFiles.length === 0) {
      toast.warning("Vui lòng chọn ít nhất 1 ảnh bài làm!");
      return false;
    }
    if (selectedFiles.length > 10) {
      toast.warning("Chỉ được gửi tối đa 10 hình ảnh!");
      return false;
    }
  } else if (selectedMode === "text") {
    const textContent = solutionEditor 
      ? (solutionEditor.getCleanLatex() || solutionEditor.getText())
      : (DOM.solutionText ? DOM.solutionText.value.trim() : "");

    if (!textContent) {
      toast.warning("Vui lòng nhập nội dung bài giải!");
      return false;
    }
    if (textContent.length > 20000) {
      toast.warning("Nội dung bài giải quá dài (tối đa 20.000 ký tự)!");
      return false;
    }
  }

  return true;
}

// ==========================================
// MAIN SUBMIT HANDLER
// ==========================================
async function handleSubmit(e) {
  e.preventDefault();

  if (!validate()) {
    return;
  }

  showLoading("Đang xử lý bài làm...");

  try {
    let uploadedImages = [];
    let textContent = "";

    // Tải ảnh lên Cloudinary qua hàm uploadImages đã import
    if (selectedMode === "image") {
      showLoading("Đang tải hình ảnh lên Cloudinary...");
      const rawUploadResults = await uploadImages(selectedFiles);
      
      // Chuẩn hóa định dạng danh sách ảnh gửi Worker & Firestore
      uploadedImages = rawUploadResults.map((res) => ({
        url: res.secure_url || res.url || "",
        publicId: res.public_id || "",
        width: res.width ?? 0,
        height: res.height ?? 0,
        bytes: res.bytes ?? 0
      }));
    } else {
      textContent = solutionEditor 
        ? (solutionEditor.getCleanLatex() || solutionEditor.getText())
        : (DOM.solutionText ? DOM.solutionText.value.trim() : "");
    }

    // LẤY RUBRIC CỦA BÀI TẬP HIỆN TẠI VÀ CHUẨN BỊ PAYLOAD
    const rubricData = (Array.isArray(currentProblem.rubric) && currentProblem.rubric.length > 0)
      ? currentProblem.rubric
      : [
          {
            id: "r1",
            title: "Lời giải & Kết quả toán học",
            description: "Học sinh lập luận đúng và tìm ra kết quả toán học tương đương",
            maxScore: 10
          }
        ];
    const sampleSolutions = Array.isArray(currentProblem.solutions) && currentProblem.solutions.length > 0
      ? currentProblem.solutions
      : [currentProblem.solution].filter(Boolean);

    const payload = {
      problem: {
        id: currentProblem.id,
        title: currentProblem.title,
        content: currentProblem.content || "",
        solution: currentProblem.solution || "",
        solutions: sampleSolutions
      },
      rubric: rubricData, // Gửi Rubric bài toán cho AI chấm (dù tự tạo hay AI sinh)
      type: selectedMode,
      solution: textContent,
      images: uploadedImages
    };

    showLoading("Giáo viên AI đang đọc và chấm bài theo Rubric...");
    const aiResult = await gradeSubmission(payload);

    // Kiểm tra nếu Worker parse JSON thất bại
    if (aiResult && aiResult.success === false) {
      throw new Error("AI trả về dữ liệu không hợp lệ. Vui lòng thử lại!");
    }
const userSnap = await getDoc(doc(db, "users", currentUser.uid));

const userData = userSnap.exists()
    ? userSnap.data()
    : {};
    showLoading("Đang lưu kết quả...");
    const rawSubmissionData = {
      problemId: currentProblem.id || "",
      problemTitle: currentProblem.title || "Bài tập không có tiêu đề",
      userId: currentUser.uid,
      authorId: currentUser.uid,
      authorName:
        userData.displayName ||
        userData.username ||
        currentUser.displayName ||
        "Ẩn danh",
      type: selectedMode || "image",
      grade: currentProblem.grade ?? null,
      text: selectedMode === "text" ? textContent : "",
      images: uploadedImages || [],
      score: aiResult.score ?? 0,
      criteria: aiResult.criteria || [],
      feedback: aiResult.feedback || "",
      mistakes: aiResult.mistakes || [],
      knowledge: aiResult.knowledge || [],
      strengths: aiResult.strengths || [],
      suggestion: aiResult.suggestion || "",
      correctAnswer: aiResult.correctAnswer || "",
      confidence: aiResult.confidence ?? 1.0,
      confidence_reason: aiResult.confidence_reason || "",
      detectedMethod: aiResult.detectedMethod || "unclear",
      status: "completed",
      createdAt: serverTimestamp()
    };

    // Đề xuất bài viết ôn tập theo Phương án 3 (Pre-linked) & Phương án 1 (AI tag query)
    try {
      const recs = await fetchRecommendedKnowledgeArticles(currentProblem, aiResult);
      rawSubmissionData.recommendedArticles = recs.map(a => ({
        id: a.id,
        title: a.title || "Bài giảng",
        summary: a.summary || "",
        reason: a.reason || ""
      }));
    } catch (e) {
      console.warn("Lỗi tạo danh sách đề xuất bài viết:", e);
    }

    // 🟢 LÀM SẠCH TOÀN BỘ OBJECT CON TRƯỚC KHI PUSH FIREBASE
    const submissionData = cleanUndefined(rawSubmissionData);

    submissionData.createdAt = serverTimestamp();

    const docRef = await addDoc(
      collection(db, "submissions"),
      submissionData
    );
    showLoading("Đang cập nhật điểm tích lũy...");
    await updateUserBestScore(
      currentUser.uid,
      currentProblem.id,
      aiResult.score ?? 0
    );
    toast.success("Nộp bài thành công!");

    // Chuyển hướng kèm đầy đủ id nộp bài và id bài tập
    setTimeout(() => {
      window.location.href = `submit-detail.html?id=${docRef.id}&problem=${currentProblem.id}`;
    }, 1500);

  } catch (error) {
    console.error("Lỗi quy trình nộp bài:", error);
    toast.error(error.message || "Đã xảy ra lỗi trong quá trình nộp bài!");
  } finally {
    hideLoading();
  }
}

async function updateUserBestScore(userId, problemId, newScore) {
  console.group("[updateUserBestScore]");

  console.log("Input:", {
    userId,
    problemId,
    newScore,
    type: typeof newScore
  });

  if (!userId || !problemId || typeof newScore !== "number") {
    console.error("❌ Dữ liệu đầu vào không hợp lệ");
    console.groupEnd();
    return;
  }

  const userProblemDocId = `${userId}_${problemId}`;
  const userProblemRef = doc(db, "user_problems", userProblemDocId);
  const userRef = doc(db, "users", userId);


  try {

    const docSnap = await getDoc(userProblemRef);

    if (!docSnap.exists()) {

      const createData = {
        userId,
        problemId,
        bestScore: newScore,
        updatedAt: serverTimestamp()
      };

      await setDoc(userProblemRef, createData);

      await updateDoc(userRef, {
        totalScore: increment(newScore)
      });

    } else {

      const data = docSnap.data();

      const oldBestScore = data.bestScore || 0;
      if (newScore > oldBestScore) {
        const delta = newScore - oldBestScore;

        await updateDoc(userProblemRef, {
          bestScore: newScore,
          updatedAt: serverTimestamp()
        });

        await updateDoc(userRef, {
          totalScore: increment(delta)
        });
      }
    }

  } catch (error) {
    console.error("===== FIREBASE ERROR =====");
    console.error("code =", error.code);
    console.error("message =", error.message);
    console.error(error);
  }

  console.groupEnd();
}

// ==========================================
// UI LOADING HELPERS
// ==========================================
function showLoading(message = "Đang xử lý...") {
  if (DOM.submitBtn) {
    DOM.submitBtn.disabled = true;
  }
  
  const formInputs = document.querySelectorAll(
    '#submissionForm input, #submissionForm textarea, #submissionForm button, input[name="submitMode"]'
  );
  formInputs.forEach((el) => (el.disabled = true));

  if (DOM.loadingStatus) {
    DOM.loadingStatus.textContent = message;
    DOM.loadingStatus.classList.remove("hidden");
  }
}

function hideLoading() {
  if (DOM.submitBtn) {
    DOM.submitBtn.disabled = false;
  }

  const formInputs = document.querySelectorAll(
    '#submissionForm input, #submissionForm textarea, #submissionForm button, input[name="submitMode"]'
  );
  formInputs.forEach((el) => (el.disabled = false));

  if (DOM.loadingStatus) {
    DOM.loadingStatus.textContent = "";
    DOM.loadingStatus.classList.add("hidden");
  }
}
// Hàm đệ quy làm sạch dữ liệu, biến tất cả undefined thành null
function cleanUndefined(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(cleanUndefined);

  const cleaned = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      cleaned[key] = val === undefined ? null : cleanUndefined(val);
    }
  }
  return cleaned;
}
// ==========================================
// UTILS
// ==========================================
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// Khởi chạy khi DOM sẵn sàng
document.addEventListener("DOMContentLoaded", init);