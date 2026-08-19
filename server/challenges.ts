import type { Challenge, ChallengeAgent, ChallengeAssignment, ChallengeResult, ChallengeTask } from "../shared/types";

// ── Challenge Templates ──────────────────────────────────────────────────────

interface ChallengeTemplate {
  title: string;
  description: string;
  categories: string[];
  taskCount: number;
  dependencyPattern: "chain" | "parallel_pairs" | "mixed";
}

const TEMPLATES: ChallengeTemplate[] = [
  {
    title: "Content Pipeline",
    description: "Research topics, write drafts, and review content. Assign tasks to optimize throughput.",
    categories: ["research", "writing", "review"],
    taskCount: 6,
    dependencyPattern: "parallel_pairs",
  },
  {
    title: "Software Sprint",
    description: "Design, implement, test, and deploy features. Match skills to minimize completion time.",
    categories: ["design", "coding", "testing", "review"],
    taskCount: 8,
    dependencyPattern: "mixed",
  },
  {
    title: "Data Analysis Pipeline",
    description: "Gather data, clean it, analyze, and report findings. Specialists finish faster.",
    categories: ["research", "coding", "writing", "review"],
    taskCount: 5,
    dependencyPattern: "chain",
  },
  {
    title: "Product Launch",
    description: "Plan, build, test, document, and announce. Dependencies make this tricky to parallelize.",
    categories: ["design", "coding", "testing", "writing", "review"],
    taskCount: 7,
    dependencyPattern: "mixed",
  },
];

const AGENT_NAMES = ["Aria", "Bolt", "Cipher", "Delta", "Echo", "Flux", "Gale", "Halo"];
const TASK_TITLES: Record<string, string[]> = {
  research: ["Research competitors", "Gather requirements", "Analyze market data", "Survey users"],
  writing: ["Write blog post", "Draft documentation", "Compose announcement", "Create report"],
  coding: ["Implement feature", "Build API endpoint", "Fix critical bug", "Optimize query"],
  design: ["Design UI mockup", "Create wireframes", "Plan architecture", "Design database schema"],
  testing: ["Write unit tests", "Run integration tests", "Perform QA review", "Load test"],
  review: ["Code review", "Content review", "Security audit", "Final approval"],
};

function pick<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

// ── Challenge Generation ─────────────────────────────────────────────────────

export function generateChallenge(): Challenge {
  const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  const categories = template.categories;
  const taskCount = template.taskCount;

  // Generate tasks
  const tasks: ChallengeTask[] = [];
  for (let i = 0; i < taskCount; i++) {
    const category = categories[i % categories.length];
    const titles = TASK_TITLES[category] ?? ["Generic task"];
    const title = titles[Math.floor(Math.random() * titles.length)];
    tasks.push({
      id: `t${i}`,
      title: `${title}`,
      baseDurationMin: 10 + Math.floor(Math.random() * 6) * 5, // 10-35 min
      category,
      dependsOn: [],
    });
  }

  // Generate dependencies based on pattern
  if (template.dependencyPattern === "chain") {
    for (let i = 1; i < tasks.length; i++) {
      tasks[i].dependsOn = [tasks[i - 1].id];
    }
  } else if (template.dependencyPattern === "parallel_pairs") {
    for (let i = 2; i < tasks.length; i += 2) {
      tasks[i].dependsOn = [tasks[i - 2].id];
      if (i + 1 < tasks.length) {
        tasks[i + 1].dependsOn = [tasks[i - 1].id];
      }
    }
  } else if (template.dependencyPattern === "mixed") {
    // First half: chain, second half: depend on first half
    for (let i = 1; i < Math.ceil(tasks.length / 2); i++) {
      tasks[i].dependsOn = [tasks[i - 1].id];
    }
    const midIdx = Math.ceil(tasks.length / 2);
    for (let i = midIdx; i < tasks.length; i++) {
      const depIdx = (i - midIdx) % midIdx;
      tasks[i].dependsOn = [tasks[depIdx].id];
    }
  }

  // Generate agents — each specializes in 1-2 categories
  const agentCount = Math.min(4, Math.max(2, Math.ceil(taskCount / 2)));
  const agents: ChallengeAgent[] = [];
  const usedNames = pick(AGENT_NAMES, agentCount);
  for (let i = 0; i < agentCount; i++) {
    const specCount = Math.random() < 0.5 ? 1 : 2;
    const specs = pick(categories, specCount);
    agents.push({
      id: `a${i}`,
      name: usedNames[i],
      specialties: specs,
      nonspecialtyMultiplier: 1.5,
    });
  }

  // Compute optimal time
  const optimalTimeMin = computeOptimalTime(tasks, agents);

  return {
    id: randomId(),
    title: template.title,
    description: template.description,
    tasks,
    agents,
    optimalTimeMin,
    createdAt: Date.now(),
  };
}

// ── Optimal Solution Computation ─────────────────────────────────────────────

function getTaskDuration(task: ChallengeTask, agent: ChallengeAgent): number {
  const isSpecialty = agent.specialties.includes(task.category);
  return isSpecialty ? task.baseDurationMin : Math.round(task.baseDurationMin * agent.nonspecialtyMultiplier);
}

/**
 * Compute the optimal total completion time using a greedy + critical path approach.
 * For each task, assign the agent that minimizes the critical path.
 * This is a heuristic — true optimal is NP-hard (job-shop scheduling).
 */
function computeOptimalTime(tasks: ChallengeTask[], agents: ChallengeAgent[]): number {
  // Try all possible assignments greedily: for each task, pick the fastest agent.
  // Then compute critical path with those durations.
  // This gives a lower bound that's usually close to optimal for small instances.

  const bestAssignment = findOptimalAssignment(tasks, agents);
  return computeCriticalPath(tasks, bestAssignment, agents);
}

/** Find the assignment that minimizes total critical path time. */
function findOptimalAssignment(
  tasks: ChallengeTask[],
  agents: ChallengeAgent[],
): Map<string, string> {
  // Greedy: for each task (in topological order), assign the agent that minimizes
  // the task's finish time (earliest start + duration).
  // Agent availability = when they finish their last assigned task.

  const sorted = topologicalSort(tasks);
  const assignment = new Map<string, string>();
  const agentAvailableAt = new Map<string, number>();
  const taskCompletion = new Map<string, number>();
  for (const a of agents) agentAvailableAt.set(a.id, 0);

  for (const taskId of sorted) {
    const task = tasks.find((t) => t.id === taskId)!;
    // Compute earliest start based on dependency completion times
    let earliestStart = 0;
    for (const depId of task.dependsOn) {
      earliestStart = Math.max(earliestStart, taskCompletion.get(depId) ?? 0);
    }

    // Pick the agent that finishes earliest
    let bestAgent = agents[0];
    let bestFinishTime = Infinity;
    for (const agent of agents) {
      const availAt = agentAvailableAt.get(agent.id)!;
      const startTime = Math.max(availAt, earliestStart);
      const duration = getTaskDuration(task, agent);
      const finishTime = startTime + duration;
      if (finishTime < bestFinishTime) {
        bestFinishTime = finishTime;
        bestAgent = agent;
      }
    }

    assignment.set(taskId, bestAgent.id);
    agentAvailableAt.set(bestAgent.id, bestFinishTime);
    taskCompletion.set(taskId, bestFinishTime);
  }

  return assignment;
}

/** Topological sort of tasks based on dependencies. */
function topologicalSort(tasks: ChallengeTask[]): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const task = taskMap.get(id);
    if (task) {
      for (const dep of task.dependsOn) visit(dep);
    }
    result.push(id);
  };

  for (const t of tasks) visit(t.id);
  return result;
}

/**
 * Compute the critical path length given an assignment.
 * Returns the total project duration in minutes.
 */
function computeCriticalPath(
  tasks: ChallengeTask[],
  assignment: Map<string, string>,
  agents: ChallengeAgent[],
): number {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const completionTime = new Map<string, number>();

  const computeCompletion = (taskId: string): number => {
    if (completionTime.has(taskId)) return completionTime.get(taskId)!;
    const task = taskMap.get(taskId);
    if (!task) return 0;

    const agentId = assignment.get(taskId);
    const agent = agents.find((a) => a.id === agentId);
    const duration = agent ? getTaskDuration(task, agent) : task.baseDurationMin;

    let maxDepCompletion = 0;
    for (const depId of task.dependsOn) {
      maxDepCompletion = Math.max(maxDepCompletion, computeCompletion(depId));
    }

    const completion = maxDepCompletion + duration;
    completionTime.set(taskId, completion);
    return completion;
  };

  let maxTime = 0;
  for (const t of tasks) {
    maxTime = Math.max(maxTime, computeCompletion(t.id));
  }
  return maxTime;
}

/** Find the critical path (sequence of task IDs) for a given assignment. */
function findCriticalPath(
  tasks: ChallengeTask[],
  assignment: Map<string, string>,
  agents: ChallengeAgent[],
): string[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const completionTime = new Map<string, number>();

  const computeCompletion = (taskId: string): number => {
    if (completionTime.has(taskId)) return completionTime.get(taskId)!;
    const task = taskMap.get(taskId);
    if (!task) return 0;

    const agentId = assignment.get(taskId);
    const agent = agents.find((a) => a.id === agentId);
    const duration = agent ? getTaskDuration(task, agent) : task.baseDurationMin;

    let maxDepCompletion = 0;
    for (const depId of task.dependsOn) {
      const depComp = computeCompletion(depId);
      if (depComp > maxDepCompletion) {
        maxDepCompletion = depComp;
      }
    }

    const completion = maxDepCompletion + duration;
    completionTime.set(taskId, completion);
    return completion;
  };

  // Find the task with the highest completion time
  let endTaskId = tasks[0]?.id ?? "";
  let maxTime = 0;
  for (const t of tasks) {
    const comp = computeCompletion(t.id);
    if (comp > maxTime) {
      maxTime = comp;
      endTaskId = t.id;
    }
  }

  // Trace back the critical path
  const path: string[] = [endTaskId];
  let current = endTaskId;
  while (true) {
    const task = taskMap.get(current);
    if (!task || task.dependsOn.length === 0) break;
    let maxDepId = task.dependsOn[0];
    let maxDepTime = 0;
    for (const depId of task.dependsOn) {
      const depTime = completionTime.get(depId) ?? 0;
      if (depTime > maxDepTime) {
        maxDepTime = depTime;
        maxDepId = depId;
      }
    }
    path.unshift(maxDepId);
    current = maxDepId;
  }

  return path;
}

// ── Challenge Scoring ────────────────────────────────────────────────────────

export function scoreChallenge(
  challenge: Challenge,
  assignments: ChallengeAssignment[],
): ChallengeResult {
  const assignmentMap = new Map<string, string>();
  for (const a of assignments) {
    assignmentMap.set(a.taskId, a.agentId);
  }

  const userTime = computeCriticalPath(challenge.tasks, assignmentMap, challenge.agents);
  const criticalPath = findCriticalPath(challenge.tasks, assignmentMap, challenge.agents);

  // Build breakdown
  const breakdown = challenge.tasks.map((task) => {
    const agentId = assignmentMap.get(task.id);
    const agent = challenge.agents.find((a) => a.id === agentId);
    const isSpecialty = agent ? agent.specialties.includes(task.category) : false;
    const duration = agent ? getTaskDuration(task, agent) : task.baseDurationMin;
    return {
      taskId: task.id,
      taskTitle: task.title,
      agentName: agent?.name ?? "Unassigned",
      durationMin: duration,
      isSpecialty,
    };
  });

  const score = Math.round((challenge.optimalTimeMin / Math.max(userTime, 1)) * 100);

  return {
    challengeId: challenge.id,
    assignments,
    userTimeMin: userTime,
    optimalTimeMin: challenge.optimalTimeMin,
    score: Math.min(score, 100),
    breakdown,
    criticalPath,
  };
}
