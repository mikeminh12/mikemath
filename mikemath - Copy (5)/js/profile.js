/**
 * profile.js - MikeMath Profile & Account Center Handler
 * Runtime: ES Module / Browser
 */

import { db, auth } from "./firebase.js";
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import toast from "/components/toast.js";
import { uploadImages } from "./cloudinary.js";

// DOM Elements
const DOM = {
  headerAvatar: document.getElementById("headerAvatar"),
  headerDisplayName: document.getElementById("headerDisplayName"),
  headerUsername: document.getElementById("headerUsername"),
  headerLevel: document.getElementById("headerLevel"),
  headerXpText: document.getElementById("headerXpText"),
  headerXpBar: document.getElementById("headerXpBar"),

  statTotalScore: document.getElementById("statTotalScore"),
  statHighestScore: document.getElementById("statHighestScore"),
  statSubmissions: document.getElementById("statSubmissions"),
  statStreak: document.getElementById("statStreak"),

  infoUsername: document.getElementById("infoUsername"),
  infoEmail: document.getElementById("infoEmail"),
  infoJoinedDate: document.getElementById("infoJoinedDate"),
  infoRole: document.getElementById("infoRole"),

  profileForm: document.getElementById("profileForm"),
  inputDisplayName: document.getElementById("inputDisplayName"),
  avatarDropzone: document.getElementById("avatarDropzone"),
  avatarFileInput: document.getElementById("avatarFileInput"),
  previewContainer: document.getElementById("previewContainer"),
  oldAvatarPreview: document.getElementById("oldAvatarPreview"),
  newAvatarPreview: document.getElementById("newAvatarPreview"),
  saveProfileBtn: document.getElementById("saveProfileBtn")
};

let currentUser = null;
let currentUserData = null;
let selectedAvatarFile = null;

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      await loadUserProfile(user.uid);
      await loadUserStatistics(user.uid);
      bindEvents();
    } else {
      toast.warning("Vui lòng đăng nhập để xem hồ sơ!");
      setTimeout(() => {
        window.location.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
      }, 1200);
    }
  });
});

// ==========================================
// LOAD USER DATA & RENDER
// ==========================================
async function loadUserProfile(uid) {
  try {
    const userRef = doc(db, "users", uid);
    const docSnap = await getDoc(userRef);

    if (!docSnap.exists()) {
      toast.error("Không tìm thấy thông tin tài khoản!");
      return;
    }

    currentUserData = docSnap.data();

    // 1. Render Cột trái (Header & XP)
    const displayName = currentUserData.displayName || currentUserData.username || "Người dùng";
    const username = currentUserData.username || "mikeminh";
    const avatarUrl = currentUserData.avatar || currentUserData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

    DOM.headerDisplayName.textContent = displayName;
    DOM.headerUsername.textContent = `@${username}`;
    DOM.headerAvatar.src = avatarUrl;
    DOM.oldAvatarPreview.src = avatarUrl;

    // Tính toán Level & XP (Quy ước: Mỗi 100 XP lên 1 Level)
    const exp = currentUserData.exp || 0;
    const level = currentUserData.level || Math.floor(exp / 100) + 1;
    const currentLevelXp = exp % 100;

    DOM.headerLevel.innerHTML = `<i class="fa-solid fa-bolt" style="color: var(--gold);"></i> Cấp ${level}`;
    DOM.headerXpText.textContent = `${currentLevelXp} / 100 XP`;
    DOM.headerXpBar.style.width = `${Math.min(currentLevelXp, 100)}%`;

    // 2. Render Card 2: Thông tin tài khoản
    DOM.infoUsername.value = `@${username}`;
    DOM.infoEmail.value = currentUserData.email || currentUser.email || "N/A";
    DOM.infoRole.value = currentUserData.role || "user";

    if (currentUserData.createdAt) {
      const date = currentUserData.createdAt.toDate ? currentUserData.createdAt.toDate() : new Date(currentUserData.createdAt);
      DOM.infoJoinedDate.value = date.toLocaleDateString("vi-VN");
    } else {
      DOM.infoJoinedDate.value = "Chưa rõ";
    }

    // 3. Render Card 3: Form Chỉnh sửa
    DOM.inputDisplayName.value = displayName;

  } catch (error) {
    console.error("Lỗi tải thông tin profile:", error);
    toast.error("Lỗi kết nối khi tải hồ sơ!");
  }
}

/**
 * Tải các chỉ số thống kê thực tế từ Firestore Submissions & User_problems
 */
async function loadUserStatistics(uid) {
  try {

    DOM.statTotalScore.textContent = currentUserData.totalScore || 0;
    DOM.statStreak.textContent = `${currentUserData.streak || 0} ngày`;

    
    const subQuery = query(
      collection(db, "submissions"),
      where("userId", "==", uid)
    );

    const subSnap = await getDocs(subQuery);


    DOM.statSubmissions.textContent = subSnap.size;


    const probQuery = query(
      collection(db, "user_problems"),
      where("userId", "==", uid)
    );

    const probSnap = await getDocs(probQuery);


    let maxScore = 0;

    probSnap.forEach((doc) => {
      const data = doc.data();

      if ((data.bestScore || 0) > maxScore) {
        maxScore = data.bestScore;
      }
    });

    DOM.statHighestScore.textContent = maxScore;

  } catch (e) {
    console.error(e.code);
    console.error(e.message);
    console.error(e);
  }
}

// ==========================================
// BIND EVENTS & DRAG DROP
// ==========================================
function bindEvents() {
  // Dropzone Trigger Click
  DOM.avatarDropzone.addEventListener("click", () => DOM.avatarFileInput.click());

  // Drag over / leave
  DOM.avatarDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    DOM.avatarDropzone.style.backgroundColor = "var(--primary-light)";
  });

  DOM.avatarDropzone.addEventListener("dragleave", () => {
    DOM.avatarDropzone.style.backgroundColor = "var(--surface-subtle)";
  });

  DOM.avatarDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    DOM.avatarDropzone.style.backgroundColor = "var(--surface-subtle)";
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAvatarSelect(e.dataTransfer.files[0]);
    }
  });

  // Choose File Input
  DOM.avatarFileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleAvatarSelect(e.target.files[0]);
    }
  });

  // Submit Profile Form
  DOM.profileForm.addEventListener("submit", handleSaveProfile);
}

// Handling Selected Avatar
function handleAvatarSelect(file) {
  const validTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!validTypes.includes(file.type)) {
    toast.warning("Chỉ chấp nhận định dạng JPG, PNG hoặc WEBP!");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    toast.warning("Dung lượng ảnh tối đa là 5MB!");
    return;
  }

  selectedAvatarFile = file;

  // Render Preview
  const reader = new FileReader();
  reader.onload = (e) => {
    DOM.newAvatarPreview.src = e.target.result;
    DOM.previewContainer.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

// ==========================================
// SAVE PROFILE HANDLER
// ==========================================
async function handleSaveProfile(e) {
  e.preventDefault();

  // 1. Validate Display Name
  let rawName = DOM.inputDisplayName.value.trim();
  
  // Lọc chống XSS cơ bản
  rawName = rawName.replace(/[<>]/g, "");

  if (rawName.length < 2 || rawName.length > 30) {
    toast.warning("Tên hiển thị phải từ 2 đến 30 ký tự!");
    return;
  }

  setLoading(true, "Đang xử lý...");

  try {
    let newAvatarUrl = currentUserData.avatar || null;

    // 2. Nếu chọn ảnh đại diện mới -> Upload Cloudinary
    if (selectedAvatarFile) {
      setLoading(true, "Đang tải ảnh đại diện lên Cloudinary...");
      const uploadResults = await uploadImages([selectedAvatarFile]);

      if (uploadResults && uploadResults.length > 0) {
        newAvatarUrl = uploadResults[0].secure_url || uploadResults[0].url;
      } else {
        throw new Error("Không thể tải ảnh lên Cloudinary. Vui lòng thử lại!");
      }
    }

    // 3. Cập nhật dữ liệu vào Firestore
    setLoading(true, "Đang lưu thông tin...");
    const userRef = doc(db, "users", currentUser.uid);

    const updatePayload = {
      displayName: rawName,
      ...(newAvatarUrl ? { avatar: newAvatarUrl, photoURL: newAvatarUrl } : {})
    };

    await updateDoc(userRef, updatePayload);

    toast.success("Cập nhật hồ sơ thành công!");

    // Reset lại preview và tải lại giao diện
    selectedAvatarFile = null;
    DOM.previewContainer.classList.add("hidden");
    await loadUserProfile(currentUser.uid);

  } catch (error) {
    console.error("Lỗi khi lưu hồ sơ:", error);
    toast.error(error.message || "Đã xảy ra lỗi khi lưu thông tin!");
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading, text = "Đang lưu...") {
  DOM.saveProfileBtn.disabled = isLoading;
  if (isLoading) {
    DOM.saveProfileBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${text}`;
  } else {
    DOM.saveProfileBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Lưu thay đổi`;
  }
}