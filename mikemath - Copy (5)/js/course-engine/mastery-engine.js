/**
 * MIKE MATH - MASTERY ENGINE
 * Quản lý tính toán điểm thành thạo (Mastery Score) & Ngưỡng mở khóa (Mastery Gate)
 * File: js/course-engine/mastery-engine.js
 */

export const MASTERY_GATE_THRESHOLD = 80; // Ngưỡng điểm đạt bài (80%)

export const MASTERY_LEVELS = {
  WEAK: { key: 'weak', label: 'Yếu / Cần củng cố', min: 0, max: 39, badgeClass: 'badge-danger', icon: '⚠️' },
  LEARNING: { key: 'learning', label: 'Đang học', min: 40, max: 59, badgeClass: 'badge-warning', icon: '📖' },
  RECOVERING: { key: 'recovering', label: 'Tiến bộ', min: 60, max: 79, badgeClass: 'badge-info', icon: '📈' },
  GOOD: { key: 'good', label: 'Khá', min: 80, max: 89, badgeClass: 'badge-primary', icon: '👍' },
  MASTERED: { key: 'mastered', label: 'Thành thạo', min: 90, max: 100, badgeClass: 'badge-success', icon: '👑' }
};

/**
  Xác định cấp độ thành thạo dựa trên điểm số (0-100)
 */
export function getMasteryLevel(score = 0) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s >= 90) return MASTERY_LEVELS.MASTERED;
  if (s >= 80) return MASTERY_LEVELS.GOOD;
  if (s >= 60) return MASTERY_LEVELS.RECOVERING;
  if (s >= 40) return MASTERY_LEVELS.LEARNING;
  return MASTERY_LEVELS.WEAK;
}

/**
 * Tính điểm Mastery tích lũy dựa trên lịch sử làm bài (weights: lượt mới nặng hơn)
 */
export function calculateWeightedMastery(currentScore = 0, isCorrect = false, attemptsCount = 1) {
  const delta = isCorrect ? (attemptsCount > 3 ? 15 : 25) : -20;
  const newScore = Math.max(0, Math.min(100, currentScore + delta));
  return newScore;
}
