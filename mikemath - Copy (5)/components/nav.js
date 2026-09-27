// js/components/navbar.js

import { auth, db } from "/js/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import toast from "./toast.js";

// ======================
// Elements
// ======================
const navLogo = document.getElementById("navLogo");

const guestActions = document.getElementById("guestActions");
const userActions = document.getElementById("userActions");

const navUsername = document.getElementById("navUsername");
const navAvatar = document.getElementById("navAvatar");

const userMenuButton = document.getElementById("userMenuButton");
const userDropdown = document.getElementById("userDropdown");

const adminMenu = document.getElementById("adminMenu");
const logoutBtn = document.getElementById("logoutBtn");

// ======================
// UI State Handlers
// ======================
function showGuest() {
  guestActions?.classList.remove("hidden");
  userActions?.classList.add("hidden");

  if (navLogo) {
    navLogo.href = "/index.html";
  }

  // Reset admin menu & avatar về mặc định
  adminMenu?.classList.add("hidden");
  if (navAvatar) navAvatar.src = "assets/images/non.png";
  if (navUsername) navUsername.textContent = "";
  
  closeDropdown();
}

function showUser() {
  guestActions?.classList.add("hidden");
  userActions?.classList.remove("hidden");

  if (navLogo) {
    navLogo.href = "/dashboard.html";
  }
}

// ======================
// Load User Profile
// ======================
async function loadProfile(uid) {
  const snapshot = await getDoc(doc(db, "users", uid));

  if (!snapshot.exists()) return;

  const data = snapshot.data();

  if (navUsername) {
    navUsername.textContent =
      data.displayName ||
      data.username ||
      data.email ||
      "User";
  }

  if (data.avatar && navAvatar) {
    navAvatar.src = data.avatar;
  }

  if (data.role === "admin") {
    adminMenu?.classList.remove("hidden");
  } else {
    adminMenu?.classList.add("hidden");
  }
}

// ======================
// Dropdown Logic (Tối ưu cho Animation CSS)
// ======================
function closeDropdown() {
  if (!userDropdown) return;
  userDropdown.classList.remove("show");
  userMenuButton?.classList.remove("show");
}

function initDropdown() {
  if (!userMenuButton || !userDropdown) return;

  userMenuButton.addEventListener("click", (e) => {
    e.stopPropagation();
    
    // Bật/tắt class 'show' để chạy CSS Animation & xoay mũi tên
    const isOpen = userDropdown.classList.toggle("show");
    userMenuButton.classList.toggle("show", isOpen);
  });

  userDropdown.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // Click ra ngoài màn hình thì đóng dropdown
  document.addEventListener("click", () => {
    closeDropdown();
  });
}

// ======================
// Logout Logic
// ======================
function initLogout() {
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      closeDropdown();
      toast.success("Đã đăng xuất.");

      window.location.href = "/index.html";
    } catch (error) {
      console.error(error);
      toast.error("Không thể đăng xuất.");
    }
  });
}

// ======================
// Auth Observer
// ======================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showGuest();
    return;
  }

  showUser();

  try {
    await loadProfile(user.uid);
  } catch (error) {
    console.error(error);
    toast.error("Không thể tải thông tin người dùng.");
  }
});

// Highlighting active nav link based on URL
function highlightActiveNavLink() {
  const currentPath = window.location.pathname.toLowerCase();
  document.querySelectorAll(".nav-links a").forEach(link => {
    const href = (link.getAttribute("href") || "").toLowerCase();
    if (href && (currentPath.endsWith(href) || (href.includes("courses.html") && currentPath.includes("learning.html")))) {
      link.classList.add("active");
      link.style.fontWeight = "800";
      link.style.color = "var(--primary, #1d4ed8)";
    }
  });
}

// Init Event Listeners
initDropdown();
initLogout();
highlightActiveNavLink();