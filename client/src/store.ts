import type { AgentInfo, AgentSchedule, CharAppearance, FiredAgent, GameSettings, LogEntry, PlayerInfo, PlayerPresence, RailwayData, ServerMsg, TaskCard, MCPServerConfig, ClientMsg, RoomType, RoomAccessLevel, Organization, OrgMember, SavedOutfit, PlatformEvent, PlatformConnectionState, VacationedAgent, SubscriptionTier, WorldDeployment, WorldTemplate, OfficeMCPServer, AssetUpgradeStatus } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { achievements } from "./game/achievements";

type Listener = () => void;

export interface HelicopterDelivery {
  name: string;
  systemPrompt: string;
  model: string;
  provider: string;
  sprite?: number;
  appearance?: CharAppearance;
  mcpServers?: MCPServerConfig[];
  cdpSolana?: boolean;
  crossmintWallet?: boolean;
  isPremium?: boolean;
  circleServices?: import("../../shared/types").CircleServiceConfig[];
  skills?: import("../../shared/types").TaskCategory[];
  alreadyHired?: boolean;
}

export interface FeedItem {
  agentId: string;
  name: string;
  accent: string;
  entry: LogEntry;
  /** Monotonic id so the HUD can append only what's new. */
  seq: number;
}

const FEED_MAX = 300;

export interface PendingInvite {
  roomId: string;
  roomName: string;
  fromUserId: string;
  fromName: string;
  role: "member" | "guest";
  accessLevel?: RoomAccessLevel;
}

/** Client-side mirror of server state; HUD and the Phaser scene subscribe. */
export class Store {
  /** Set by main.ts so the store can send WS messages (e.g. for OAuth). */
  sendFn: ((msg: ClientMsg) => void) | null = null;
  agents = new Map<string, AgentInfo>();
  logs = new Map<string, LogEntry[]>();
  board = new Map<string, TaskCard>();
  schedules = new Map<string, AgentSchedule>();
  firedAgents = new Map<string, FiredAgent>();
  vacationedAgents = new Map<string, VacationedAgent>();
  worldSeed = 0;
  chunkOverrides: Record<string, Record<number, number>> = {};
  /** Every agent's messages merged chronologically, for the office feed. */
  feed: FeedItem[] = [];
  /** Bumped when the feed is rebuilt or items vanish mid-list (not appended). */
  feedVersion = 0;
  private feedSeq = 0;
  player: PlayerInfo | null = null;
  settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
  selectedId: string | null = null;
  connected = false;
  serverRestarting = false;
  boardOpen = false;
  ganttOpen = false;
  vmodelOpen = false;
  /** Card dependencies for Gantt chart rendering: { from, to, type }. */
  cardDependencies: { from: string; to: string; type: string }[] = [];
  /** Listener array for Gantt updates. */
  ganttListeners: (() => void)[] = [];
  /** Listener array for phase gate notifications. */
  phaseGateListeners: ((cardId: string, phase: string, approved: boolean, reviewerName: string) => void)[] = [];
  /** Listener array for capability gap reports. */
  capabilityGapListeners: ((gaps: { skill: string; requiredBy: string; suggestion: string }[]) => void)[] = [];
  achievementsOpen = false;
  hallOfFameOpen = false;
  railwayPanelOpen = false;
  wardrobeOpen = false;
  outfits: SavedOutfit[] = [];
  wardrobeEditable = true;
  railwayData: RailwayData | null = null;
  railwayError: string | null = null;
  railwayStatus: { ok: boolean; message: string } | null = null;
  githubStatus: { connected: boolean; login: string | null; error: string | null } | null = null;
  githubData: { branches: { name: string; sha: string }[]; fork: { owner: string; name: string; fullName: string; cloneUrl: string; branch: string } | null; error: string | null } | null = null;
  githubPanelOpen = false;
  deployments: WorldDeployment[] = [];
  deployingBranch: string | null = null;
  codeEditorOpen = false;
  codeEditorBranch: string | null = null;
  codeEditorPath: string = "";
  codeEditorDir: { path: string; type: "file" | "dir"; size: number }[] = [];
  codeEditorFile: { path: string; content: string; sha: string } | null = null;
  codeEditorDirty = false;
  currentWorld: { branchName: string; host: string; url: string } | null = null;
  worldTransitioning = false;
  portalTarget: { branchName: string; url: string } | null = null;
  worldsPanelOpen = false;
  worldTemplates: WorldTemplate[] = [];
  worldGenerating: { worldName: string; stage: string; message: string } | null = null;
  hasApiKey = false;
  /** Listeners called when server responds with MCP key status batch. */
  mcpKeysStatusListeners: ((results: { serverUrl: string; hasKey: boolean }[]) => void)[] = [];
  /** Listeners called when server responds with CDP wallet status. */
  cdpWalletListeners: ((msg: { agentId: string; address: string | null; balances: { symbol: string; amount: string; usdValue?: string }[] | null; error?: string }) => void)[] = [];
  /** Listeners called when server responds with CDP policy status. */
  cdpPolicyListeners: ((msg: { agentId: string; policyId: string | null; maxSolPerTransfer: number | null; allowedRecipients: string[] | null; blockedRecipients: string[] | null; allowedTokenMints: string[] | null; blockedTokenMints: string[] | null; network: string; error?: string }) => void)[] = [];
  /** Listeners called when server responds with CDP tx history. */
  cdpTxHistoryListeners: ((msg: { agentId: string; transactions: { signature: string; slot: number; blockTime: number | null; err: boolean | null; memo: string | null }[] | null; error?: string }) => void)[] = [];
  cdpOnrampListeners: ((msg: { agentId: string; url: string | null; error?: string }) => void)[] = [];
  /** Listeners called when server responds with Crossmint wallet status. */
  crossmintWalletListeners: ((msg: { agentId: string; address: string | null; chain: string | null; balances: { symbol: string; amount: string; usdValue?: string }[] | null; error?: string }) => void)[] = [];
  /** Listeners called when server responds with Crossmint policy status. */
  crossmintPolicyListeners: ((msg: { agentId: string; chain: string | null; spendingLimitUsd: number | null; allowedRecipients: string[] | null; blockedRecipients: string[] | null; description: string | null; error?: string }) => void)[] = [];
  /** Listeners called when server responds with Crossmint tx history. */
  crossmintTxHistoryListeners: ((msg: { agentId: string; transactions: any[] | null; error?: string }) => void)[] = [];
  crossmintFundListeners: ((msg: { agentId: string; success: boolean; message: string }) => void)[] = [];
  crossmintOnrampListeners: ((msg: { agentId: string; url: string | null; error?: string }) => void)[] = [];
  subscriptionActive = true;
  subscriptionStatus = "none";
  subscriptionTier: SubscriptionTier | null = null;
  agentLimit = 0;
  usageCap = 0;
  currentPeriodEnd: number | null = null;
  freeTrialExpiresAt: number | null = null;
  nextTrialAt: number | null = null;
  paymentRequired: { reason: "subscription" | "agent_limit" | "usage_cap"; message: string; tier?: SubscriptionTier | null; agentLimit?: number; monthlySpend?: number; usageCap?: number } | null = null;
  scheduledDeletionAt: number | null = null;
  /** Asset upgrade state for the current portal world. */
  assetUpgradeStatus: AssetUpgradeStatus = "none";
  assetUpgradeProgress: { stage: string; percent: number; label: string } | null = null;
  assetUpgradeDeploymentId: string | null = null;
  /** Listeners called when asset upgrade status changes. */
  assetUpgradeListeners: (() => void)[] = [];
  roomId: string | null = null;
  roomName: string = "";
  roomPlayers = new Map<string, PlayerPresence>();
  projectorChannel: string = "off";
  /** HTML broadcast URL for the projector (relative path, client appends token). */
  agentBroadcastHtmlUrl: string | null = null;
  /** Access level for the current room: no_access, tour, talk, or manage. */
  accessLevel: RoomAccessLevel = "no_access";
  /** Room type from the most recent room_state — available immediately, no rooms_list race. */
  roomType: RoomType | null = null;
  pendingInvite: PendingInvite | null = null;
  privateOfficeId: string | null = null;
  roomsList: { roomId: string; name: string; isPrivate: boolean; roomType: RoomType; orgId?: string }[] = [];
  /** Organizations the user can see. */
  orgsList: (Organization & { memberCount: number; isMember: boolean; role?: "admin" | "member" })[] = [];
  /** Members of the currently viewed org. */
  orgMembers: { orgId: string; members: OrgMember[] } | null = null;

  /** True if the current room is an organization room (uses the agentHeights theme). */
  get isOrgRoom(): boolean {
    if (!this.roomId) return false;
    if (this.roomType) return this.roomType === "organization";
    return this.roomsList.some(r => r.roomId === this.roomId && r.roomType === "organization");
  }

  /** True once the server has delivered all initial data (snapshot, room_state, rooms_list). */
  initialDataReady = false;
  /** Reference to the OfficeScene — set during create() so the HUD can access VoiceManager. */
  sceneRef: { voice: { active: boolean; listening: boolean; muted: boolean; outputMuted: boolean; start: () => Promise<void>; stop: () => void; setMuted: (m: boolean) => void; setOutputMuted: (m: boolean) => void; startListenOnly: () => Promise<void>; stopListenOnly: () => void } } | null = null;
  private initialDataCallbacks = new Set<() => void>();

  private listeners = new Set<Listener>();
  agentsDirty = false;
  private toastListeners = new Set<(text: string) => void>();
  private huddleListeners = new Set<(agentIds: string[]) => void>();
  private heliListeners = new Set<(agent: HelicopterDelivery) => void>();
  private paymentRequiredListeners = new Set<(reason: string, message: string) => void>();
  private assemblyListeners = new Set<(agentIds: string[]) => void>();
  private npcStateListeners = new Set<(npcId: string, x: number, y: number, dir: import("../../shared/types").Dir, state: string) => void>();
  private tileUpdatedListeners = new Set<(cx: number, cy: number, tileIndex: number, tile: number) => void>();
  private emoteListeners = new Set<(agentId: string, emote: string) => void>();
  private fuseEffectListeners = new Set<(agentAId: string, agentBId: string, fusedId: string) => void>();
  private agentChatListeners = new Set<(fromId: string, toId: string, fromName: string, toName: string, text: string) => void>();
  private voicePeerListeners = new Set<(userId: string, name: string) => void>();
  private voiceOfferListeners = new Set<(fromUserId: string, sdp: string) => void>();
  private voiceAnswerListeners = new Set<(fromUserId: string, sdp: string) => void>();
  private voiceIceListeners = new Set<(fromUserId: string, candidate: string) => void>();
  private voicePeerLeftListeners = new Set<(userId: string) => void>();
  private screenSharePeerListeners = new Set<(userId: string, name: string) => void>();
  private screenShareOfferListeners = new Set<(fromUserId: string, sdp: string) => void>();
  private screenShareAnswerListeners = new Set<(fromUserId: string, sdp: string) => void>();
  private screenShareIceListeners = new Set<(fromUserId: string, candidate: string) => void>();
  private screenSharePeerLeftListeners = new Set<(userId: string) => void>();
  private webcamStateListeners = new Set<(presenterId: string | null, presenterName: string | null) => void>();
  private webcamPeerListeners = new Set<(userId: string, name: string) => void>();
  private webcamOfferListeners = new Set<(fromUserId: string, sdp: string) => void>();
  private webcamAnswerListeners = new Set<(fromUserId: string, sdp: string) => void>();
  private webcamIceListeners = new Set<(fromUserId: string, candidate: string) => void>();
  private webcamPeerLeftListeners = new Set<(userId: string) => void>();
  private agentFrameListeners = new Set<(agentId: string, frame: string) => void>();
  private agentBroadcastStateListeners = new Set<(agentId: string | null) => void>();
  private agentBroadcastHtmlListeners = new Set<(agentId: string | null, url: string | null) => void>();
  private agentFsListingListeners = new Set<(agentId: string, path: string, entries: { name: string; isDir: boolean; size: number; mtime: number }[]) => void>();
  private agentFsContentListeners = new Set<(agentId: string, path: string, content: string, error?: string) => void>();
  private agentFsResultListeners = new Set<(agentId: string, path: string, action: "write" | "delete" | "upload", success: boolean, error?: string) => void>();
  private agentLogListeners = new Set<(agentId: string, entry: LogEntry) => void>();
  private agentLogHistoryListeners = new Set<(agentId: string, entries: LogEntry[]) => void>();
  private agentTaskInfoListeners = new Set<(agentId: string, currentTask: string | null, queue: { task: string; handoffTo: string | null }[], history: { task: string; success: boolean; ts: number; durationMs: number }[]) => void>();
  private agentMemoryListeners = new Set<(agentId: string, messages: { role: string; content: string }[]) => void>();
  private mailboxUpdateListeners = new Set<(platform: string, flagUp: boolean, pendingCount: number, lastMessage: string, assignedAgentId: string | null) => void>();
  private mailboxMessagesListeners = new Set<(platform: string, events: PlatformEvent[]) => void>();
  private mailDigestListeners = new Set<(digest: { totalUnread: number; byPlatform: { platform: string; unread: number; lastMessage: string }[]; queued: number }) => void>();
  private platformConnectionListeners = new Set<(states: PlatformConnectionState[]) => void>();
  private platformConfigResultListeners = new Set<(platform: string, success: boolean, error?: string) => void>();
  /** MCP Forge: self-built servers created by agents. */
  forgeServers: OfficeMCPServer[] = [];
  forgePanelOpen = false;
  private forgeUpdateListeners = new Set<() => void>();
  private forgeBuildLogListeners = new Set<(serverId: string, line: string, stream: "stdout" | "stderr") => void>();

  /** Platform connection states from Hermes Agent gateway */
  platformStates: PlatformConnectionState[] = [];

  /** Platform mailbox state: platform -> { flagUp, pendingCount, lastMessage, assignedAgentId } */
  platformMailboxes = new Map<string, { flagUp: boolean; pendingCount: number; lastMessage: string; assignedAgentId: string | null }>();

  /** Clear all user-specific state — called when switching accounts. */
  reset(): void {
    this.agents.clear();
    this.logs.clear();
    this.board.clear();
    this.schedules.clear();
    this.firedAgents.clear();
    this.vacationedAgents.clear();
    this.feed = [];
    this.feedVersion++;
    this.player = null;
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.selectedId = null;
    this.roomId = null;
    this.roomName = "";
    this.roomPlayers.clear();
    this.pendingInvite = null;
    this.privateOfficeId = null;
    this.roomType = null;
    this.roomsList = [];
    this.orgsList = [];
    this.orgMembers = null;
    this.hasApiKey = false;
    this.subscriptionActive = true;
    this.subscriptionStatus = "none";
    this.subscriptionTier = null;
    this.agentLimit = 0;
    this.usageCap = 0;
    this.currentPeriodEnd = null;
    this.freeTrialExpiresAt = null;
    this.paymentRequired = null;
    this.railwayData = null;
    this.railwayError = null;
    this.railwayStatus = null;
    this.githubStatus = null;
    this.githubData = null;
    this.githubPanelOpen = false;
    this.deployments = [];
    this.deployingBranch = null;
    this.codeEditorOpen = false;
    this.codeEditorBranch = null;
    this.codeEditorPath = "";
    this.codeEditorDir = [];
    this.codeEditorFile = null;
    this.codeEditorDirty = false;
    this.currentWorld = null;
    this.worldTransitioning = false;
    this.portalTarget = null;
    this.worldsPanelOpen = false;
    this.worldTemplates = [];
    this.worldGenerating = null;
    this.worldSeed = 0;
    this.chunkOverrides = {};
    this.platformStates = [];
    this.platformMailboxes.clear();
    this.initialDataReady = false;
    this.emit();
  }

  subscribe(fn: Listener): void {
    this.listeners.add(fn);
  }

  onToast(fn: (text: string) => void): void {
    this.toastListeners.add(fn);
  }

  onHuddle(fn: (agentIds: string[]) => void): void {
    this.huddleListeners.add(fn);
  }

  onHelicopter(fn: (agent: HelicopterDelivery) => void): void {
    this.heliListeners.add(fn);
  }

  onPaymentRequired(fn: (reason: string, message: string) => void): void {
    this.paymentRequiredListeners.add(fn);
  }

  onAssembly(fn: (agentIds: string[]) => void): void {
    this.assemblyListeners.add(fn);
  }

  onNpcState(fn: (npcId: string, x: number, y: number, dir: import("../../shared/types").Dir, state: string) => void): void {
    this.npcStateListeners.add(fn);
  }

  onTileUpdated(fn: (cx: number, cy: number, tileIndex: number, tile: number) => void): void {
    this.tileUpdatedListeners.add(fn);
  }

  onEmote(fn: (agentId: string, emote: string) => void): void {
    this.emoteListeners.add(fn);
  }

  onFuseEffect(fn: (agentAId: string, agentBId: string, fusedId: string) => void): void {
    this.fuseEffectListeners.add(fn);
  }

  onAgentChat(fn: (fromId: string, toId: string, fromName: string, toName: string, text: string) => void): void {
    this.agentChatListeners.add(fn);
  }

  onVoicePeer(fn: (userId: string, name: string) => void): void {
    this.voicePeerListeners.add(fn);
  }

  onVoiceOffer(fn: (fromUserId: string, sdp: string) => void): void {
    this.voiceOfferListeners.add(fn);
  }

  onVoiceAnswer(fn: (fromUserId: string, sdp: string) => void): void {
    this.voiceAnswerListeners.add(fn);
  }

  onVoiceIce(fn: (fromUserId: string, candidate: string) => void): void {
    this.voiceIceListeners.add(fn);
  }

  onVoicePeerLeft(fn: (userId: string) => void): void {
    this.voicePeerLeftListeners.add(fn);
  }

  clearVoiceListeners(): void {
    this.voicePeerListeners.clear();
    this.voiceOfferListeners.clear();
    this.voiceAnswerListeners.clear();
    this.voiceIceListeners.clear();
    this.voicePeerLeftListeners.clear();
  }

  onScreenSharePeer(fn: (userId: string, name: string) => void): void {
    this.screenSharePeerListeners.add(fn);
  }

  onScreenShareOffer(fn: (fromUserId: string, sdp: string) => void): void {
    this.screenShareOfferListeners.add(fn);
  }

  onScreenShareAnswer(fn: (fromUserId: string, sdp: string) => void): void {
    this.screenShareAnswerListeners.add(fn);
  }

  onScreenShareIce(fn: (fromUserId: string, candidate: string) => void): void {
    this.screenShareIceListeners.add(fn);
  }

  onScreenSharePeerLeft(fn: (userId: string) => void): void {
    this.screenSharePeerLeftListeners.add(fn);
  }

  onWebcamState(fn: (presenterId: string | null, presenterName: string | null) => void): void {
    this.webcamStateListeners.add(fn);
  }

  onWebcamPeer(fn: (userId: string, name: string) => void): void {
    this.webcamPeerListeners.add(fn);
  }

  onWebcamOffer(fn: (fromUserId: string, sdp: string) => void): void {
    this.webcamOfferListeners.add(fn);
  }

  onWebcamAnswer(fn: (fromUserId: string, sdp: string) => void): void {
    this.webcamAnswerListeners.add(fn);
  }

  onWebcamIce(fn: (fromUserId: string, candidate: string) => void): void {
    this.webcamIceListeners.add(fn);
  }

  onWebcamPeerLeft(fn: (userId: string) => void): void {
    this.webcamPeerLeftListeners.add(fn);
  }

  onAgentFrame(fn: (agentId: string, frame: string) => void): void {
    this.agentFrameListeners.add(fn);
  }

  onAgentBroadcastState(fn: (agentId: string | null) => void): void {
    this.agentBroadcastStateListeners.add(fn);
  }

  onAgentBroadcastHtml(fn: (agentId: string | null, url: string | null) => void): void {
    this.agentBroadcastHtmlListeners.add(fn);
  }

  onAgentFsListing(fn: (agentId: string, path: string, entries: { name: string; isDir: boolean; size: number; mtime: number }[]) => void): void {
    this.agentFsListingListeners.add(fn);
  }

  onAgentFsContent(fn: (agentId: string, path: string, content: string, error?: string) => void): void {
    this.agentFsContentListeners.add(fn);
  }

  onAgentFsResult(fn: (agentId: string, path: string, action: "write" | "delete" | "upload", success: boolean, error?: string) => void): void {
    this.agentFsResultListeners.add(fn);
  }

  onAgentLog(fn: (agentId: string, entry: LogEntry) => void): void {
    this.agentLogListeners.add(fn);
  }

  onAgentLogHistory(fn: (agentId: string, entries: LogEntry[]) => void): void {
    this.agentLogHistoryListeners.add(fn);
  }

  offAgentFsListing(fn: (agentId: string, path: string, entries: { name: string; isDir: boolean; size: number; mtime: number }[]) => void): void {
    this.agentFsListingListeners.delete(fn);
  }

  offAgentFsContent(fn: (agentId: string, path: string, content: string, error?: string) => void): void {
    this.agentFsContentListeners.delete(fn);
  }

  offAgentFsResult(fn: (agentId: string, path: string, action: "write" | "delete" | "upload", success: boolean, error?: string) => void): void {
    this.agentFsResultListeners.delete(fn);
  }

  offAgentLog(fn: (agentId: string, entry: LogEntry) => void): void {
    this.agentLogListeners.delete(fn);
  }

  offAgentLogHistory(fn: (agentId: string, entries: LogEntry[]) => void): void {
    this.agentLogHistoryListeners.delete(fn);
  }

  onAgentTaskInfo(fn: (agentId: string, currentTask: string | null, queue: { task: string; handoffTo: string | null }[], history: { task: string; success: boolean; ts: number; durationMs: number }[]) => void): void {
    this.agentTaskInfoListeners.add(fn);
  }

  offAgentTaskInfo(fn: (agentId: string, currentTask: string | null, queue: { task: string; handoffTo: string | null }[], history: { task: string; success: boolean; ts: number; durationMs: number }[]) => void): void {
    this.agentTaskInfoListeners.delete(fn);
  }

  onAgentMemory(fn: (agentId: string, messages: { role: string; content: string }[]) => void): void {
    this.agentMemoryListeners.add(fn);
  }

  offAgentMemory(fn: (agentId: string, messages: { role: string; content: string }[]) => void): void {
    this.agentMemoryListeners.delete(fn);
  }

  onMailboxUpdate(fn: (platform: string, flagUp: boolean, pendingCount: number, lastMessage: string, assignedAgentId: string | null) => void): void {
    this.mailboxUpdateListeners.add(fn);
  }

  onMailboxMessages(fn: (platform: string, events: PlatformEvent[]) => void): void {
    this.mailboxMessagesListeners.add(fn);
  }

  offMailboxMessages(fn: (platform: string, events: PlatformEvent[]) => void): void {
    this.mailboxMessagesListeners.delete(fn);
  }

  onMailDigest(fn: (digest: { totalUnread: number; byPlatform: { platform: string; unread: number; lastMessage: string }[]; queued: number }) => void): void {
    this.mailDigestListeners.add(fn);
  }

  offMailDigest(fn: (digest: { totalUnread: number; byPlatform: { platform: string; unread: number; lastMessage: string }[]; queued: number }) => void): void {
    this.mailDigestListeners.delete(fn);
  }

  onPlatformConnection(fn: (states: PlatformConnectionState[]) => void): void {
    this.platformConnectionListeners.add(fn);
  }

  offPlatformConnection(fn: (states: PlatformConnectionState[]) => void): void {
    this.platformConnectionListeners.delete(fn);
  }

  onPlatformConfigResult(fn: (platform: string, success: boolean, error?: string) => void): void {
    this.platformConfigResultListeners.add(fn);
  }

  offPlatformConfigResult(fn: (platform: string, success: boolean, error?: string) => void): void {
    this.platformConfigResultListeners.delete(fn);
  }

  onForgeUpdate(fn: () => void): void {
    this.forgeUpdateListeners.add(fn);
  }

  offForgeUpdate(fn: () => void): void {
    this.forgeUpdateListeners.delete(fn);
  }

  onForgeBuildLog(fn: (serverId: string, line: string, stream: "stdout" | "stderr") => void): void {
    this.forgeBuildLogListeners.add(fn);
  }

  offForgeBuildLog(fn: (serverId: string, line: string, stream: "stdout" | "stderr") => void): void {
    this.forgeBuildLogListeners.delete(fn);
  }

  /** Toggle the MCP Forge panel open/closed. */
  toggleForgePanel(open?: boolean): void {
    this.forgePanelOpen = open ?? !this.forgePanelOpen;
    this.emit();
  }

  /** Request the current forge server list from the server. */
  requestForgeList(): void {
    this.sendFn?.({ type: "list_office_mcp" });
  }

  /** Unregister a forge server. */
  unregisterForgeServer(serverId: string): void {
    this.sendFn?.({ type: "unregister_mcp_server", serverId });
  }

  /** Check if a platform is connected via Hermes Agent gateway */
  isPlatformConnected(platform: string): boolean {
    const state = this.platformStates.find((s) => s.platform === platform);
    return state?.connected ?? false;
  }

  triggerHelicopter(agent: HelicopterDelivery): void {
    for (const fn of this.heliListeners) fn(agent);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.emit();
  }

  toggleBoard(open?: boolean): void {
    this.boardOpen = open ?? !this.boardOpen;
    this.emit();
  }

  toggleGantt(open?: boolean): void {
    this.ganttOpen = open ?? !this.ganttOpen;
    this.emit();
  }

  toggleVModel(open?: boolean): void {
    this.vmodelOpen = open ?? !this.vmodelOpen;
    this.emit();
  }

  toggleAchievements(open?: boolean): void {
    this.achievementsOpen = open ?? !this.achievementsOpen;
    this.emit();
  }

  toggleHallOfFame(open?: boolean): void {
    this.hallOfFameOpen = open ?? !this.hallOfFameOpen;
    this.emit();
  }

  toggleRailwayPanel(open?: boolean): void {
    this.railwayPanelOpen = open ?? !this.railwayPanelOpen;
    this.emit();
  }

  toggleGitHubPanel(open?: boolean): void {
    this.githubPanelOpen = open ?? !this.githubPanelOpen;
    this.emit();
  }

  toggleCodeEditor(open?: boolean): void {
    this.codeEditorOpen = open ?? !this.codeEditorOpen;
    this.emit();
  }

  toggleWorldsPanel(open?: boolean): void {
    this.worldsPanelOpen = open ?? !this.worldsPanelOpen;
    if (this.worldsPanelOpen) {
      this.sendFn?.({ type: "railway_list_deployments" });
      this.sendFn?.({ type: "list_world_templates" });
    }
    this.emit();
  }

  toggleWardrobe(open?: boolean): void {
    this.wardrobeOpen = open ?? !this.wardrobeOpen;
    this.emit();
  }

  toast(text: string): void {
    for (const fn of this.toastListeners) fn(text);
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
    if (connected) this.serverRestarting = false;
    if (!connected) this.initialDataReady = false;
    this.emit();
  }

  /** Register a one-shot callback fired when initial server data has arrived. */
  onInitialData(cb: () => void): void {
    if (this.initialDataReady) { cb(); return; }
    this.initialDataCallbacks.add(cb);
  }

  selected(): AgentInfo | null {
    return this.selectedId ? (this.agents.get(this.selectedId) ?? null) : null;
  }

  apply(msg: ServerMsg): void {
    switch (msg.type) {
      case "snapshot": {
        this.agents = new Map(msg.agents.map((a) => [a.id, a]));
        this.logs = new Map(Object.entries(msg.logs));
        this.board = new Map(msg.board.map((c) => [c.id, c]));
        this.schedules = new Map((msg.schedules ?? []).map((s) => [s.id, s]));
        this.player = msg.player;
        this.settings = msg.settings;
        if (msg.world) {
          this.worldSeed = msg.world.seed;
          this.chunkOverrides = msg.world.chunkOverrides ?? {};
          this.firedAgents = new Map(msg.world.firedAgents.map((fa) => [fa.id, fa]));
        } else {
          this.firedAgents.clear();
        }
        if (this.selectedId && !this.agents.has(this.selectedId)) this.selectedId = null;
        // rebuild the feed from the per-agent logs
        this.feed = [];
        for (const [agentId, entries] of this.logs) {
          const a = this.agents.get(agentId);
          for (const entry of entries) {
            this.feed.push({
              agentId,
              name: a?.name ?? "?",
              accent: a?.accent ?? "#9aa0b0",
              entry,
              seq: 0,
            });
          }
        }
        this.feed.sort((a, b) => a.entry.ts - b.entry.ts);
        if (this.feed.length > FEED_MAX) this.feed.splice(0, this.feed.length - FEED_MAX);
        for (const f of this.feed) f.seq = this.feedSeq++;
        this.feedVersion++;
        break;
      }
      case "player":
        this.player = msg.player;
        break;
      case "server_restarting":
        this.serverRestarting = true;
        break;
      case "settings":
        this.settings = msg.settings;
        this.emit();
        break;
      case "agent": {
        const prev = this.agents.get(msg.agent.id);
        const isNew = !prev;
        this.agents.set(msg.agent.id, msg.agent);
        this.agentsDirty = true;
        if (isNew) {
          const count = this.agents.size;
          if (count >= 1) achievements.unlock("first_hire");
          if (count >= 8) achievements.unlock("full_office");
          if (count >= 9) achievements.unlock("overflow");
          if (msg.agent.role === "manager") achievements.unlock("hire_manager");
          if (msg.agent.role === "devops") achievements.unlock("hire_devops");
          achievements.addToSet("models", msg.agent.model);
          if (achievements.getSetSize("models") >= 3) achievements.unlock("both_providers");
          achievements.addToSet("models", msg.agent.model);
          if (achievements.getSetSize("models") >= 9) achievements.unlock("all_models");
          if (msg.agent.personality) {
            const p = msg.agent.personality;
            const sig = `${Math.round(p.openness * 5)}${Math.round(p.conscientiousness * 5)}${Math.round(p.extraversion * 5)}${Math.round(p.agreeableness * 5)}${Math.round(p.neuroticism * 5)}`;
            achievements.addToSet("personalities", sig);
            if (achievements.getSetSize("personalities") >= 5) achievements.unlock("personality_variety");
          }
        }
        if (prev && msg.agent.tasksDone > prev.tasksDone) {
          const diff = msg.agent.tasksDone - prev.tasksDone;
          const total = achievements.incStat("tasksDone", diff);
          achievements.unlock("first_done");
          if (total >= 10) achievements.unlock("ten_tasks");
          if (total >= 50) achievements.unlock("fifty_tasks");
          if (total >= 100) achievements.unlock("hundred_tasks");
          if (msg.agent.tasksDone >= 25) achievements.unlock("star_employee");
        }
        break;
      }
      case "agent_removed":
        this.agents.delete(msg.agentId);
        this.logs.delete(msg.agentId);
        this.agentsDirty = true;
        if (this.selectedId === msg.agentId) this.selectedId = null;
        // Remove any schedules belonging to the fired agent
        for (const s of [...this.schedules.values()]) {
          if (s.agentId === msg.agentId) this.schedules.delete(s.id);
        }
        break;
      case "chat_cleared":
        this.logs.set(msg.agentId, []);
        this.feed = this.feed.filter((f) => f.agentId !== msg.agentId);
        this.feedVersion++;
        achievements.unlock("clear_memory");
        break;
      case "log": {
        const list = this.logs.get(msg.agentId) ?? [];
        list.push(msg.entry);
        if (list.length > 500) list.splice(0, list.length - 500);
        this.logs.set(msg.agentId, list);
        const a = this.agents.get(msg.agentId);
        this.feed.push({
          agentId: msg.agentId,
          name: a?.name ?? "?",
          accent: a?.accent ?? "#9aa0b0",
          entry: msg.entry,
          seq: this.feedSeq++,
        });
        if (this.feed.length > FEED_MAX) this.feed.splice(0, this.feed.length - FEED_MAX);
        break;
      }
      case "toast":
        for (const fn of this.toastListeners) fn(msg.text);
        return;
      case "card": {
        const prevCard = this.board.get(msg.card.id);
        this.board.set(msg.card.id, msg.card);
        if (msg.card.status === "done" && (!prevCard || prevCard.status !== "done")) {
          if (achievements.incStat("boardCardsDone") >= 20) achievements.unlock("board_master");
        }
        break;
      }
      case "card_removed":
        this.board.delete(msg.cardId);
        break;
      case "gantt_update": {
        // Update board cards from the gantt_update payload
        for (const c of msg.cards) this.board.set(c.id, c);
        this.cardDependencies = msg.dependencies;
        for (const fn of this.ganttListeners) fn();
        break;
      }
      case "phase_gate": {
        for (const fn of this.phaseGateListeners) fn(msg.cardId, msg.phase, msg.approved, msg.reviewerName);
        break;
      }
      case "capability_gap": {
        for (const fn of this.capabilityGapListeners) fn(msg.gaps);
        break;
      }
      case "schedules":
        this.schedules = new Map(msg.schedules.map((s) => [s.id, s]));
        break;
      case "schedule":
        this.schedules.set(msg.schedule.id, msg.schedule);
        break;
      case "schedule_removed":
        this.schedules.delete(msg.scheduleId);
        break;
      case "world":
        this.worldSeed = msg.world.seed;
        this.chunkOverrides = msg.world.chunkOverrides ?? {};
        this.firedAgents = new Map(msg.world.firedAgents.map((fa) => [fa.id, fa]));
        this.vacationedAgents = new Map((msg.world.vacationedAgents ?? []).map((va) => [va.id, va]));
        break;
      case "fired_agent":
        this.firedAgents.set(msg.agent.id, msg.agent);
        this.feed.push({
          agentId: msg.agent.id,
          name: msg.agent.name,
          accent: msg.agent.accent,
          entry: { ts: Date.now(), kind: "status", text: "was fired and wandered into the Labyrinth. Use the office feed to re-hire them." },
          seq: this.feedSeq++,
        });
        if (this.feed.length > FEED_MAX) this.feed.splice(0, this.feed.length - FEED_MAX);
        achievements.unlock("first_fire");
        break;
      case "fired_agent_removed":
        this.firedAgents.delete(msg.agentId);
        achievements.unlock("first_recruit");
        if (achievements.incStat("recruited") >= 5) achievements.unlock("recruit_five");
        break;
      case "vacationed_agent":
        this.vacationedAgents.set(msg.agent.id, msg.agent);
        this.feed.push({
          agentId: msg.agent.id,
          name: msg.agent.name,
          accent: msg.agent.accent,
          entry: { ts: Date.now(), kind: "status", text: "went on vacation. Restore them anytime from the roster." },
          seq: this.feedSeq++,
        });
        if (this.feed.length > FEED_MAX) this.feed.splice(0, this.feed.length - FEED_MAX);
        break;
      case "vacationed_agent_removed":
        this.vacationedAgents.delete(msg.agentId);
        break;
      case "huddle":
        for (const fn of this.huddleListeners) fn(msg.agentIds);
        return;
      case "assembly":
        for (const fn of this.assemblyListeners) fn(msg.agentIds);
        return;
      case "helicopter_delivery":
        this.triggerHelicopter({
          name: msg.name,
          model: msg.model,
          provider: msg.provider,
          systemPrompt: msg.systemPrompt,
          appearance: msg.appearance,
          mcpServers: msg.mcpServers,
          alreadyHired: msg.alreadyHired,
        });
        return;
      case "railway_status":
        this.railwayStatus = { ok: msg.ok, message: msg.message };
        this.toast(msg.message);
        return;
      case "railway_data":
        this.railwayData = msg.data;
        this.railwayError = msg.error;
        break;
      case "github_status":
        this.githubStatus = { connected: msg.connected, login: msg.login, error: msg.error };
        if (msg.error) this.toast(msg.error);
        break;
      case "github_data":
        this.githubData = { branches: msg.branches, fork: msg.fork, error: msg.error };
        this.toggleGitHubPanel(true);
        return;
      case "github_fork_created":
        this.toast(`World fork created: ${msg.branchName}`);
        // Refresh branch list
        this.sendFn?.({ type: "github_list_branches" });
        break;
      case "github_error":
        this.toast(`GitHub: ${msg.error}`);
        break;
      case "railway_deployments":
        this.deployments = msg.deployments;
        if (msg.error) this.toast(`Railway: ${msg.error}`);
        break;
      case "world_templates":
        this.worldTemplates = msg.templates;
        break;
      case "world_generating":
        this.worldGenerating = { worldName: msg.worldName, stage: msg.stage, message: msg.message };
        this.toast(msg.message);
        break;
      case "world_generated":
        this.worldGenerating = null;
        this.toast(`World generated: ${msg.deployment.branchName}`);
        if (msg.deployment.railwayServiceUrl) {
          this.toast(`Live at: ${msg.deployment.railwayServiceUrl}`);
        }
        break;
      case "world_gen_error":
        this.worldGenerating = null;
        this.toast(`World generation failed: ${msg.error}`);
        break;
      case "railway_deploy_started":
        this.deployingBranch = msg.branchName;
        this.toast(msg.message);
        break;
      case "railway_deploy_result":
        this.deployingBranch = null;
        if (msg.error) {
          this.toast(`Deploy failed: ${msg.error}`);
        } else {
          this.toast(`World deployed: ${msg.deployment.branchName}`);
          if (msg.deployment.railwayServiceUrl) {
            this.toast(`Live at: ${msg.deployment.railwayServiceUrl}`);
          }
          // Refresh deployments list
          this.sendFn?.({ type: "railway_list_deployments" });
          // If we're inside the world that was redeployed, reload the scene
          if (this.currentWorld && this.currentWorld.branchName === msg.deployment.branchName && this.sceneRef) {
            this.toast("World rebuilt — reloading...");
            const scene = this.sceneRef as any;
            if (scene?.cameras) {
              scene.cameras.main.fadeOut(600, 10, 10, 30);
              scene.cameras.main.once("camerafadeoutcomplete", () => {
                this.reset();
                scene.scene.restart();
                scene.cameras.main.fadeIn(600, 10, 10, 30);
              });
            }
          }
        }
        break;
      case "github_dir":
        if (msg.error) {
          this.toast(`GitHub: ${msg.error}`);
        } else {
          this.codeEditorDir = msg.entries;
          this.codeEditorPath = msg.path;
        }
        break;
      case "github_file":
        if (msg.error) {
          this.toast(`GitHub: ${msg.error}`);
        } else {
          this.codeEditorFile = { path: msg.path, content: msg.content, sha: msg.sha };
          this.codeEditorDirty = false;
        }
        break;
      case "github_file_saved":
        this.toast(`Saved: ${msg.path}`);
        this.codeEditorDirty = false;
        // Re-read to get updated SHA
        if (this.codeEditorBranch) {
          this.sendFn?.({ type: "github_read_file", branchName: this.codeEditorBranch, path: msg.path });
        }
        break;
      case "github_file_deleted":
        this.toast(`Deleted: ${msg.path}`);
        this.codeEditorFile = null;
        // Refresh directory listing
        if (this.codeEditorBranch) {
          this.sendFn?.({ type: "github_list_dir", branchName: this.codeEditorBranch, path: this.codeEditorPath });
        }
        break;
      case "api_key_status":
        this.hasApiKey = msg.hasKey;
        break;
      case "outfits":
        this.outfits = msg.outfits;
        this.wardrobeEditable = msg.editable;
        break;
      case "mcp_key_status":
        // MCP key status is handled via toast — no persistent UI state needed
        return;
      case "mcp_keys_status":
        for (const fn of this.mcpKeysStatusListeners) fn(msg.results);
        return;
      case "mcp_oauth_required":
      case "mcp_oauth_code_needed": {
        console.log(`[mcp-oauth] received ${msg.type}, redirectMode=${msg.redirectMode ?? "manual"}`, msg);
        const svcName = msg.serverUrl ? new URL(msg.serverUrl).hostname.replace(/^mcp\./, '').replace(/^www\./, '').replace(/\.[^.]+$/, '').replace(/^./, c => c.toUpperCase()) : 'MCP Server';
        const isAuto = msg.redirectMode === "auto";

        // Auto mode: server has a public callback URL, OAuth redirect will be handled automatically
        if (isAuto) {
          // Open the OAuth login page in a popup
          const _w = 600, _h = 700;
          const _l = Math.round((window.screenLeft ?? window.screenX) + (window.outerWidth - _w) / 2);
          const _t = Math.round((window.screenTop ?? window.screenY) + (window.outerHeight - _h) / 2);
          window.open(msg.authUrl, "mcp-oauth-popup", `width=${_w},height=${_h},left=${_l},top=${_t},scrollbars=yes`);
          // Show a small waiting toast — the popup will redirect to /oauth/callback,
          // the server will exchange the code and send mcp_oauth_complete via WS
          this.toast(`Opening ${svcName} login... Complete authorization in the popup.`);
          break;
        }

        // Manual mode: no public URL, user needs to copy-paste the redirect URL
        const modal = document.createElement("div");
        modal.id = "mcp-oauth-modal";
        modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;";
        modal.innerHTML = `
          <div style="background:#111;border:1px solid #333;border-radius:0.75rem;max-width:480px;width:90vw;padding:1.5rem;color:#e0e0e0;font-family:system-ui,sans-serif;">
            <h3 style="margin:0 0 0.5rem;font-size:1rem;">Connect to ${svcName}</h3>
            <div id="mcp-oauth-hint" style="font-size:0.8rem;color:#888;margin:0 0 1rem;">
              1. Click "Open ${svcName} Login" below<br>
              2. Log in and authorize access<br>
              3. You'll be redirected to a localhost URL that won't load — that's OK<br>
              4. Copy the full URL from that page's address bar<br>
              5. Paste it below and click "Submit Code"
            </div>
            <button id="mcp-oauth-open" style="display:block;width:100%;text-align:center;padding:0.6rem;border:none;border-radius:0.5rem;background:#2a4a6a;color:#e0e0e0;font-size:0.85rem;font-weight:600;margin-bottom:1rem;cursor:pointer;">
              🔗 Open ${svcName} Login
            </button>
            <input id="mcp-oauth-input" type="text" placeholder="Paste the localhost URL here..."
              style="width:100%;padding:0.5rem;border-radius:0.375rem;border:1px solid #333;background:#1a1a1a;color:#e0e0e0;font-size:0.8rem;margin-bottom:0.5rem;box-sizing:border-box;" />
            <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;">
              <button id="mcp-oauth-paste" style="padding:0.4rem 0.8rem;border:1px solid #333;border-radius:0.375rem;background:#1a1a1a;color:#888;font-size:0.75rem;cursor:pointer;">📋 Paste</button>
            </div>
            <div style="display:flex;gap:0.5rem;">
              <button id="mcp-oauth-submit" style="flex:1;padding:0.5rem;border:none;border-radius:0.5rem;background:#e0e0e0;color:#0d0d0d;font-size:0.85rem;font-weight:600;cursor:pointer;">Submit Code</button>
              <button id="mcp-oauth-cancel" style="padding:0.5rem 1rem;border:1px solid #222;border-radius:0.5rem;background:#1a1a1a;color:#888;font-size:0.85rem;cursor:pointer;">Cancel</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        const openBtn = modal.querySelector("#mcp-oauth-open") as HTMLButtonElement;
        const input = modal.querySelector("#mcp-oauth-input") as HTMLInputElement;
        const submitBtn = modal.querySelector("#mcp-oauth-submit") as HTMLButtonElement;
        const cancelBtn = modal.querySelector("#mcp-oauth-cancel") as HTMLButtonElement;
        const pasteBtn = modal.querySelector("#mcp-oauth-paste") as HTMLButtonElement;
        const close = () => modal.remove();

        cancelBtn.addEventListener("click", close);
        modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

        openBtn.addEventListener("click", () => {
          const _w = 600, _h = 700;
          const _l = Math.round((window.screenLeft ?? window.screenX) + (window.outerWidth - _w) / 2);
          const _t = Math.round((window.screenTop ?? window.screenY) + (window.outerHeight - _h) / 2);
          window.open(msg.authUrl, "mcp-oauth-popup", `width=${_w},height=${_h},left=${_l},top=${_t},scrollbars=yes`);
        });

        pasteBtn.addEventListener("click", async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (text) { input.value = text.trim(); input.focus(); }
          } catch { input.focus(); }
        });

        input.addEventListener("focus", async () => {
          if (!input.value) {
            try {
              const text = await navigator.clipboard.readText();
              if (text && text.includes("code=")) { input.value = text.trim(); }
            } catch { /* clipboard blocked — user pastes manually */ }
          }
        });

        submitBtn.addEventListener("click", () => {
          const url = input.value.trim();
          if (!url) { input.focus(); return; }
          this.sendFn?.({ type: "submit_mcp_oauth_code", serverUrl: msg.serverUrl, callbackUrl: url });
          submitBtn.textContent = "Exchanging...";
          submitBtn.disabled = true;
        });
        break;
      }
      case "mcp_oauth_complete":
        // Close OAuth modal if open
        document.getElementById("mcp-oauth-modal")?.remove();
        if (msg.success) {
          this.toast("MCP server connected! You can now hire this agent.");
        } else {
          this.toast(`OAuth failed: ${msg.error ?? "Unknown error"}`);
        }
        // Notify any listeners (marketplace/detail panel) so they can update UI
        for (const fn of this.mcpKeysStatusListeners) fn([{ serverUrl: msg.serverUrl, hasKey: msg.success }]);
        break;
      case "cdp_wallet_status":
        for (const fn of this.cdpWalletListeners) fn(msg);
        break;
      case "cdp_policy_status":
        for (const fn of this.cdpPolicyListeners) fn(msg);
        break;
      case "cdp_tx_history":
        for (const fn of this.cdpTxHistoryListeners) fn(msg);
        break;
      case "cdp_onramp_url":
        for (const fn of this.cdpOnrampListeners) fn(msg);
        break;
      case "crossmint_wallet_status":
        for (const fn of this.crossmintWalletListeners) fn(msg);
        break;
      case "crossmint_policy_status":
        for (const fn of this.crossmintPolicyListeners) fn(msg);
        break;
      case "crossmint_tx_history":
        for (const fn of this.crossmintTxHistoryListeners) fn(msg);
        break;
      case "crossmint_fund_result":
        for (const fn of this.crossmintFundListeners) fn(msg);
        break;
      case "crossmint_onramp_url":
        for (const fn of this.crossmintOnrampListeners) fn(msg);
        break;
      case "payment_status":
        this.subscriptionActive = msg.subscriptionActive;
        this.subscriptionStatus = msg.subscriptionStatus;
        this.subscriptionTier = msg.subscriptionTier;
        this.agentLimit = msg.agentLimit;
        this.usageCap = msg.usageCap;
        this.currentPeriodEnd = msg.currentPeriodEnd;
        this.freeTrialExpiresAt = msg.freeTrialExpiresAt;
        this.nextTrialAt = msg.nextTrialAt;
        break;
      case "payment_required":
        this.paymentRequired = { reason: msg.reason, message: msg.message, tier: msg.tier, agentLimit: msg.agentLimit, monthlySpend: msg.monthlySpend, usageCap: msg.usageCap };
        this.toast(msg.message);
        for (const fn of this.paymentRequiredListeners) fn(msg.reason, msg.message);
        break;
      case "deletion_scheduled":
        this.scheduledDeletionAt = msg.scheduledDeletionAt;
        break;
      case "deletion_cancelled":
        this.scheduledDeletionAt = null;
        break;
      case "asset_upgrade_started":
        this.assetUpgradeStatus = "generating";
        this.assetUpgradeDeploymentId = msg.deploymentId;
        this.assetUpgradeProgress = { stage: "init", percent: 0, label: "Starting…" };
        for (const fn of this.assetUpgradeListeners) fn();
        break;
      case "asset_upgrade_progress":
        this.assetUpgradeStatus = "generating";
        this.assetUpgradeProgress = { stage: msg.stage, percent: msg.percent, label: msg.label };
        for (const fn of this.assetUpgradeListeners) fn();
        break;
      case "asset_upgrade_ready":
        this.assetUpgradeStatus = "ready";
        this.assetUpgradeProgress = { stage: "complete", percent: 100, label: "Upgrade complete!" };
        for (const fn of this.assetUpgradeListeners) fn();
        break;
      case "asset_upgrade_failed":
        this.assetUpgradeStatus = "failed";
        this.assetUpgradeProgress = null;
        this.toast(`Asset upgrade failed: ${msg.error}`);
        for (const fn of this.assetUpgradeListeners) fn();
        break;
      case "room_state":
        this.roomId = msg.roomId;
        this.roomName = msg.name;
        if (msg.privateOfficeId) this.privateOfficeId = msg.privateOfficeId;
        this.projectorChannel = msg.projectorChannel ?? "off";
        this.accessLevel = msg.accessLevel ?? "no_access";
        this.roomType = msg.roomType ?? null;
        this.roomPlayers.clear();
        for (const p of msg.players) {
          this.roomPlayers.set(p.userId, p);
        }
        break;
      case "player_joined":
        this.roomPlayers.set(msg.player.userId, msg.player);
        this.toast(`${msg.player.name} joined the room`);
        break;
      case "player_left":
        const left = this.roomPlayers.get(msg.userId);
        if (left) {
          this.roomPlayers.delete(msg.userId);
          this.toast(`${left.name} left the room`);
        }
        break;
      case "player_moved": {
        const existing = this.roomPlayers.get(msg.userId);
        if (existing) {
          existing.x = msg.x;
          existing.y = msg.y;
          existing.dir = msg.dir;
        }
        break;
      }
      case "players_moved": {
        for (const u of msg.updates) {
          const existing = this.roomPlayers.get(u.userId);
          if (existing) {
            existing.x = u.x;
            existing.y = u.y;
            existing.dir = u.dir;
          }
        }
        break;
      }
      case "room_invite": {
        this.pendingInvite = {
          roomId: msg.roomId,
          roomName: msg.roomName,
          fromUserId: msg.fromUserId,
          fromName: msg.fromName,
          role: msg.role,
          accessLevel: msg.accessLevel,
        };
        this.toast(`${msg.fromName} invited you to ${msg.roomName}`);
        break;
      }
      case "invite_response": {
        if (msg.accepted) {
          this.toast(`${msg.byName} accepted your invite!`);
        } else {
          this.toast(`${msg.byName} declined your invite.`);
        }
        break;
      }
      case "player_appearance": {
        const existing = this.roomPlayers.get(msg.userId);
        if (existing) {
          existing.appearance = msg.appearance;
        }
        break;
      }
      case "npc_state": {
        for (const fn of this.npcStateListeners) fn(msg.npcId, msg.x, msg.y, msg.dir, msg.state);
        break;
      }
      case "tile_updated": {
        for (const fn of this.tileUpdatedListeners) fn(msg.cx, msg.cy, msg.tileIndex, msg.tile);
        break;
      }
      case "rooms_list": {
        this.roomsList = msg.rooms;
        if (!this.initialDataReady) {
          this.initialDataReady = true;
          for (const cb of this.initialDataCallbacks) cb();
          this.initialDataCallbacks.clear();
        }
        break;
      }
      case "orgs_list": {
        this.orgsList = msg.orgs;
        break;
      }
      case "org_members": {
        this.orgMembers = { orgId: msg.orgId, members: msg.members };
        break;
      }
      case "org_created": {
        // Trigger a toast and mark for refresh
        for (const fn of this.toastListeners) fn(`Organization "${msg.org.name}" created!`);
        return;
      }
      case "org_error": {
        for (const fn of this.toastListeners) fn(msg.message);
        return;
      }
      case "emote": {
        for (const fn of this.emoteListeners) fn(msg.agentId, msg.emote);
        return;
      }
      case "fuse_effect": {
        for (const fn of this.fuseEffectListeners) fn(msg.agentAId, msg.agentBId, msg.fusedId);
        return;
      }
      case "agent_chat": {
        for (const fn of this.agentChatListeners) fn(msg.fromId, msg.toId, msg.fromName, msg.toName, msg.text);
        return;
      }
      case "projector_state":
        this.projectorChannel = msg.channel;
        break;
      case "voice_peer": {
        for (const fn of this.voicePeerListeners) fn(msg.userId, msg.name);
        return;
      }
      case "voice_offer": {
        for (const fn of this.voiceOfferListeners) fn(msg.fromUserId, msg.sdp);
        return;
      }
      case "voice_answer": {
        for (const fn of this.voiceAnswerListeners) fn(msg.fromUserId, msg.sdp);
        return;
      }
      case "voice_ice": {
        for (const fn of this.voiceIceListeners) fn(msg.fromUserId, msg.candidate);
        return;
      }
      case "voice_peer_left": {
        for (const fn of this.voicePeerLeftListeners) fn(msg.userId);
        return;
      }
      case "screen_share_peer": {
        for (const fn of this.screenSharePeerListeners) fn(msg.userId, msg.name);
        return;
      }
      case "screen_share_offer": {
        for (const fn of this.screenShareOfferListeners) fn(msg.fromUserId, msg.sdp);
        return;
      }
      case "screen_share_answer": {
        for (const fn of this.screenShareAnswerListeners) fn(msg.fromUserId, msg.sdp);
        return;
      }
      case "screen_share_ice": {
        for (const fn of this.screenShareIceListeners) fn(msg.fromUserId, msg.candidate);
        return;
      }
      case "screen_share_peer_left": {
        for (const fn of this.screenSharePeerLeftListeners) fn(msg.userId);
        return;
      }
      case "webcam_state": {
        for (const fn of this.webcamStateListeners) fn(msg.presenterId, msg.presenterName);
        return;
      }
      case "webcam_peer": {
        for (const fn of this.webcamPeerListeners) fn(msg.userId, msg.name);
        return;
      }
      case "webcam_offer": {
        for (const fn of this.webcamOfferListeners) fn(msg.fromUserId, msg.sdp);
        return;
      }
      case "webcam_answer": {
        for (const fn of this.webcamAnswerListeners) fn(msg.fromUserId, msg.sdp);
        return;
      }
      case "webcam_ice": {
        for (const fn of this.webcamIceListeners) fn(msg.fromUserId, msg.candidate);
        return;
      }
      case "webcam_peer_left": {
        for (const fn of this.webcamPeerLeftListeners) fn(msg.userId);
        return;
      }
      case "agent_frame": {
        for (const fn of this.agentFrameListeners) fn(msg.agentId, msg.frame);
        return;
      }
      case "agent_broadcast_state": {
        for (const fn of this.agentBroadcastStateListeners) fn(msg.agentId);
        return;
      }
      case "agent_broadcast_html_state": {
        this.agentBroadcastHtmlUrl = msg.url;
        for (const fn of this.agentBroadcastHtmlListeners) fn(msg.agentId, msg.url);
        return;
      }
      case "agent_fs_listing": {
        for (const fn of this.agentFsListingListeners) fn(msg.agentId, msg.path, msg.entries);
        return;
      }
      case "agent_fs_content": {
        for (const fn of this.agentFsContentListeners) fn(msg.agentId, msg.path, msg.content, msg.error);
        return;
      }
      case "agent_fs_result": {
        for (const fn of this.agentFsResultListeners) fn(msg.agentId, msg.path, msg.action, msg.success, msg.error);
        return;
      }
      case "agent_log": {
        for (const fn of this.agentLogListeners) fn(msg.agentId, msg.entry);
        return;
      }
      case "agent_log_history": {
        for (const fn of this.agentLogHistoryListeners) fn(msg.agentId, msg.entries);
        return;
      }
      case "agent_task_info": {
        for (const fn of this.agentTaskInfoListeners) fn(msg.agentId, msg.currentTask, msg.queue, msg.history);
        return;
      }
      case "agent_memory": {
        for (const fn of this.agentMemoryListeners) fn(msg.agentId, msg.messages);
        return;
      }
      case "mailbox_update": {
        this.platformMailboxes.set(msg.platform, {
          flagUp: msg.flagUp,
          pendingCount: msg.pendingCount,
          lastMessage: msg.lastMessage,
          assignedAgentId: msg.assignedAgentId ?? null,
        });
        for (const fn of this.mailboxUpdateListeners) fn(msg.platform, msg.flagUp, msg.pendingCount, msg.lastMessage, msg.assignedAgentId ?? null);
        return;
      }
      case "mailbox_messages": {
        for (const fn of this.mailboxMessagesListeners) fn(msg.platform, msg.events);
        return;
      }
      case "mail_digest": {
        for (const fn of this.mailDigestListeners) fn({ totalUnread: msg.totalUnread, byPlatform: msg.byPlatform, queued: msg.queued });
        return;
      }
      case "platform_connection": {
        this.platformStates = msg.states;
        for (const fn of this.platformConnectionListeners) fn(msg.states);
        return;
      }
      case "platform_config_result": {
        for (const fn of this.platformConfigResultListeners) fn(msg.platform, msg.success, msg.error);
        return;
      }
      case "office_mcp_list": {
        this.forgeServers = msg.servers;
        for (const fn of this.forgeUpdateListeners) fn();
        return;
      }
      case "office_mcp_update": {
        const idx = this.forgeServers.findIndex((s) => s.id === msg.server.id);
        if (idx >= 0) {
          this.forgeServers[idx] = msg.server;
        } else {
          this.forgeServers.push(msg.server);
        }
        for (const fn of this.forgeUpdateListeners) fn();
        return;
      }
      case "office_mcp_removed": {
        this.forgeServers = this.forgeServers.filter((s) => s.id !== msg.serverId);
        for (const fn of this.forgeUpdateListeners) fn();
        return;
      }
      case "mcp_build_log": {
        for (const fn of this.forgeBuildLogListeners) fn(msg.serverId, msg.line, msg.stream);
        return;
      }
    }
    this.emit();
  }
}
