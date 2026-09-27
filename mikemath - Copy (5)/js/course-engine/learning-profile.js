/**
 * MIKE MATH - LEARNING PROFILE SERVICE
 * Đọc / Ghi nhận năng lực học sinh (userKnowledge)
 * File: js/course-engine/learning-profile.js
 */

import { db } from "../firebase.js";
import { 
    doc, 
    getDoc, 
    setDoc, 
    collection, 
    query, 
    where, 
    getDocs, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { getMasteryLevel, calculateWeightedMastery } from "./mastery-engine.js";

/**
 * Đọc thông tin thành thạo của User đối với 1 kiến thức cụ thể
 */
export async function getUserKnowledgeItem(userId, knowledgeId) {
    if (!userId || !knowledgeId) return null;
    try {
        const docRef = doc(db, "userKnowledge", `${userId}_${knowledgeId}`);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            return { id: snap.id, ...snap.data() };
        }
        return {
            userId,
            knowledgeId,
            mastery: 0,
            status: "learning",
            attempts: 0,
            correctAttempts: 0,
            wrongAttempts: 0,
            errorTypes: [],
            lastAttemptAt: null
        };
    } catch (err) {
        console.error("Lỗi khi đọc userKnowledge:", err);
        return null;
    }
}

/**
 * Đọc toàn bộ hồ sơ năng lực kiến thức của User
 */
export async function getAllUserKnowledgeProfile(userId) {
    if (!userId) return [];
    try {
        const q = query(collection(db, "userKnowledge"), where("userId", "==", userId));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error("Lỗi khi đọc toàn bộ userKnowledge profile:", err);
        return [];
    }
}

/**
 * Cập nhật userKnowledge sau mỗi lượt làm bài (Course hoặc Luyện tự do)
 */
export async function recordKnowledgeAttempt(userId, knowledgeId, isCorrect, errorType = null, source = "course") {
    if (!userId || !knowledgeId) return;

    try {
        const current = await getUserKnowledgeItem(userId, knowledgeId);
        const attempts = (current.attempts || 0) + 1;
        const correctAttempts = (current.correctAttempts || 0) + (isCorrect ? 1 : 0);
        const wrongAttempts = (current.wrongAttempts || 0) + (isCorrect ? 0 : 1);

        const newMastery = calculateWeightedMastery(current.mastery || 0, isCorrect, attempts);
        const levelObj = getMasteryLevel(newMastery);

        const errorTypes = [...(current.errorTypes || [])];
        if (errorType && !isCorrect && !errorTypes.includes(errorType)) {
            errorTypes.push(errorType);
        }

        const sources = Array.isArray(current.source) ? [...current.source] : [];
        if (!sources.includes(source)) sources.push(source);

        const payload = {
            userId,
            knowledgeId,
            mastery: newMastery,
            status: levelObj.key,
            attempts,
            correctAttempts,
            wrongAttempts,
            errorTypes,
            source: sources,
            lastAttemptAt: serverTimestamp()
        };

        if (isCorrect && newMastery >= 90) {
            payload.lastMasteredAt = serverTimestamp();
        } else if (!isCorrect) {
            payload.lastWrongAt = serverTimestamp();
        }

        await setDoc(doc(db, "userKnowledge", `${userId}_${knowledgeId}`), payload, { merge: true });
        return payload;
    } catch (err) {
        console.error("Lỗi khi ghi nhận lượt làm bài userKnowledge:", err);
    }
}

/**
 * Đề xuất các bài viết kiến thức để học sinh xem lại
 * Kết hợp Phương án 3 (Kiến thức gắn sẵn với bài tập) & Phương án 1 (AI nhận diện từ khóa lỗi sai ➔ Query Firestore)
 */
export async function fetchRecommendedKnowledgeArticles(problem, aiResult) {
    const recommendedArticles = [];
    const articleIdSet = new Set();

    // 1. Phương án 3: Lấy kiến thức được liên kết sẵn từ Bài tập
    const directKnowledgeIds = [];
    if (problem) {
        if (Array.isArray(problem.knowledgeIds)) directKnowledgeIds.push(...problem.knowledgeIds);
        if (Array.isArray(problem.relatedKnowledge)) directKnowledgeIds.push(...problem.relatedKnowledge);
        if (problem.knowledgeId) directKnowledgeIds.push(problem.knowledgeId);
    }

    for (const kId of directKnowledgeIds) {
        if (!kId || articleIdSet.has(kId)) continue;
        articleIdSet.add(kId);
        try {
            let snap = await getDoc(doc(db, "knowledgeArticles", kId));
            if (!snap.exists()) {
                snap = await getDoc(doc(db, "knowledge", kId));
            }
            if (snap.exists()) {
                recommendedArticles.push({
                    id: snap.id,
                    ...snap.data(),
                    reason: "Bài giảng trọng tâm của bài tập này"
                });
            }
        } catch (e) {
            console.warn(`Lỗi nạp bài viết liên kết ${kId}:`, e);
        }
    }

    // 2. Phương án 1: Query Firestore theo các từ khóa / tags bài học mà AI vừa nhận diện được
    const aiKnowledgeTags = Array.isArray(aiResult?.knowledge) ? aiResult.knowledge.filter(Boolean) : [];
    if (aiKnowledgeTags.length > 0 && recommendedArticles.length < 4) {
        try {
            const q = query(
                collection(db, "knowledgeArticles"),
                where("tags", "array-contains-any", aiKnowledgeTags.slice(0, 10))
            );
            const querySnap = await getDocs(q);
            querySnap.docs.forEach(docSnap => {
                if (!articleIdSet.has(docSnap.id) && recommendedArticles.length < 4) {
                    articleIdSet.add(docSnap.id);
                    recommendedArticles.push({
                        id: docSnap.id,
                        ...docSnap.data(),
                        reason: `AI phát hiện lỗi liên quan chủ đề: ${aiKnowledgeTags.join(', ')}`
                    });
                }
            });
        } catch (err) {
            console.warn("Lỗi query bài viết kiến thức theo AI tags:", err);
        }
    }

    return recommendedArticles;
}
