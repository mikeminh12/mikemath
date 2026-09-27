// js/login.js
import toast from "/components/toast.js";
import { login, register } from "/api/auth.js";

// ======================
// Elements
// ======================

const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const indicator = document.querySelector(".tab-indicator");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loading = document.getElementById("loading");

// ======================
// Helpers
// ======================

function showLoading(show = true) {
  loading.classList.toggle("hidden", !show);
}

function switchTab(isLogin) {
  if (isLogin) {
    loginTab.classList.add("active");
    registerTab.classList.remove("active");

    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");

    if (indicator) {
      indicator.classList.remove("slide-register");
      indicator.style.left = "";
    }
  } else {
    registerTab.classList.add("active");
    loginTab.classList.remove("active");

    registerForm.classList.remove("hidden");
    loginForm.classList.add("hidden");

    if (indicator) {
      indicator.classList.add("slide-register");
      indicator.style.left = "";
    }
  }
}

// ======================
// Tab Events
// ======================

loginTab.addEventListener("click", () => switchTab(true));
registerTab.addEventListener("click", () => switchTab(false));

// ======================
// Login
// ======================

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const identifier = document.getElementById("loginIdentifier").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!identifier || !password) {
    toast.error("Vui lòng nhập đầy đủ thông tin.");
    return;
  }

  try {
    showLoading(true);

    await login(identifier, password);

    toast.success("Đăng nhập thành công! Đang chuyển hướng...");
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 1000);
  } catch (err) {
    toast.error(err.message || "Đăng nhập thất bại. Vui lòng thử lại!");
  } finally {
    showLoading(false);
  }
});

// ======================
// Register
// ======================

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("registerUsername").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;
  const confirm = document.getElementById("registerConfirmPassword").value;

  if (!username || !email || !password || !confirm) {
    toast.error("Vui lòng nhập đầy đủ thông tin.");
    return;
  }

  if (password.length < 6) {
    toast.error("Mật khẩu phải có ít nhất 6 ký tự.");
    return;
  }

  if (password !== confirm) {
    toast.error("Mật khẩu nhập lại không khớp.");
    return;
  }

  try {
    showLoading(true);

    await register({
      username,
      email,
      password,
    });

    toast.success("Đăng ký tài khoản thành công! Vui lòng đăng nhập.");

    switchTab(true);
    registerForm.reset();
  } catch (err) {
    toast.error(err.message || "Đăng ký thất bại. Vui lòng thử lại!");
  } finally {
    showLoading(false);
  }
});

// ======================
// Default
// ======================

switchTab(true);