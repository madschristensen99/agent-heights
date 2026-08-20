/**
 * Efficiency Scoring & Badges — scores pipeline/schedule efficiency
 * based on throughput, success rate, autonomy, and chain complexity.
 */

import type { AgentSchedule } from "../shared/types.js";

export interface EfficiencyResult {
  throughput: number;
  successRate: number;
  autonomyRate: number;
  chainCount: number;
  badge: string;
  badgeColor: string;
  suggestions: string[];
}

export function computeEfficiency(
  schedules: AgentSchedule[],
  taskHistory: { success: boolean; durationMs: number; ts: number; taskType: string }[],
  totalTasks: number,
  scheduledTaskCount: number,
): EfficiencyResult {
  const now = Date.now();
  const oneHourAgo = now - 3_600_000;
  const recentTasks = taskHistory.filter((t) => t.ts > oneHourAgo);
  const throughput = recentTasks.length; // tasks per hour
  const successCount = recentTasks.filter((t) => t.success).length;
  const successRate = recentTasks.length > 0 ? successCount / recentTasks.length : 0;
  const autonomyRate = totalTasks > 0 ? scheduledTaskCount / totalTasks : 0;
  const chainCount = schedules.filter((s) => s.chainTo).length;

  const suggestions: string[] = [];
  let score = 0;

  // Throughput scoring (0-30 points)
  if (throughput >= 10) score += 30;
  else if (throughput >= 5) score += 20;
  else if (throughput >= 2) score += 10;
  else if (throughput >= 1) score += 5;
  if (throughput < 2) suggestions.push("Add more schedules or agents to increase throughput");

  // Success rate scoring (0-30 points)
  if (successRate >= 0.9) score += 30;
  else if (successRate >= 0.75) score += 20;
  else if (successRate >= 0.5) score += 10;
  if (successRate < 0.75 && recentTasks.length > 0) suggestions.push("Review failing tasks — success rate is below 75%");

  // Autonomy scoring (0-25 points)
  if (autonomyRate >= 0.8) score += 25;
  else if (autonomyRate >= 0.5) score += 15;
  else if (autonomyRate >= 0.25) score += 8;
  if (autonomyRate < 0.5) suggestions.push("Schedule more tasks to increase autonomy — less manual assignment needed");

  // Chain complexity scoring (0-15 points)
  if (chainCount >= 3) score += 15;
  else if (chainCount >= 1) score += 8;
  if (chainCount === 0 && schedules.length >= 2) suggestions.push("Link schedules into chains for compound automation");

  // Badge assignment
  let badge: string;
  let badgeColor: string;
  if (score >= 80) { badge = "🏆 Pipeline Master"; badgeColor = "#fbbf24"; }
  else if (score >= 60) { badge = "⚙️ Automation Engineer"; badgeColor = "#58c866"; }
  else if (score >= 40) { badge = "🔧 Assembler"; badgeColor = "#3b82f6"; }
  else if (score >= 20) { badge = "🛠️ Tinkerer"; badgeColor = "#a855f7"; }
  else { badge = "🌱 Beginner"; badgeColor = "#9aa0b0"; }

  if (suggestions.length === 0) {
    suggestions.push("Excellent pipeline efficiency — keep optimizing!");
  }

  return { throughput, successRate, autonomyRate, chainCount, badge, badgeColor, suggestions };
}
