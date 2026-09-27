// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB5aaC1TuG-T1HNSTS8KB_Jx-Zx4z_VNGg",
  authDomain: "mikekiosk-adde2.firebaseapp.com",
  projectId: "mikekiosk-adde2",
  storageBucket: "mikekiosk-adde2.firebasestorage.app",
  messagingSenderId: "964634215737",
  appId: "1:964634215737:web:464d54a0062d350a6214e8",
  measurementId: "G-LCED8HS2XL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const analytics = getAnalytics(app);

const auth = getAuth(app);

const db = getFirestore(app);

export { app, auth, db };