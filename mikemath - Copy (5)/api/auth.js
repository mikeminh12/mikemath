// js/api/auth.js

import { auth, db } from "/js/firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
    collection,
    query,
    where,
    getDocs,
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


// ===========================
// Register
// ===========================

export async function register({
    username,
    email,
    password
}) {

    username = username.trim().toLowerCase();
    email = email.trim().toLowerCase();

    // Kiểm tra username đã tồn tại

    const usernameQuery = query(
        collection(db, "users"),
        where("username", "==", username)
    );

    const usernameSnapshot = await getDocs(usernameQuery);

    if (!usernameSnapshot.empty) {
        throw new Error("Tên đăng nhập đã tồn tại.");
    }

    // Tạo tài khoản Auth

    const credential =
        await createUserWithEmailAndPassword(
            auth,
            email,
            password
        );

    const user = credential.user;

    // Lưu Firestore
await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,

    username,
    email,

    role: "student",

    avatar: "",

    level: 1,
    exp: 0,

    score: 0,
    totalScore: 0,
    streak: 0,

    createdAt: serverTimestamp()
});

}


// ===========================
// Login
// ===========================

export async function login(identifier, password) {

    identifier = identifier.trim();

    let email = identifier;

    // Nếu không phải email
    if (!identifier.includes("@")) {

        const username = identifier.toLowerCase();

        const q = query(
            collection(db, "users"),
            where("username", "==", username)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            throw new Error("Không tìm thấy tài khoản.");
        }

        email = snapshot.docs[0].data().email;
    }

    await signInWithEmailAndPassword(
        auth,
        email,
        password
    );

}


// ===========================
// Logout
// ===========================

export async function logout() {

    await signOut(auth);

}


// ===========================
// Current User
// ===========================

export function getCurrentUser() {

    return auth.currentUser;

}