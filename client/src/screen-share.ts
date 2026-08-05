import type { ClientMsg } from "../../shared/types";

function getRtcConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const runtimeEnv = (typeof window !== "undefined" && (window as any).__ENV__) || {};
  const turnServer = runtimeEnv.VITE_TURN_SERVER ?? import.meta.env.VITE_TURN_SERVER;
  const turnUser = runtimeEnv.VITE_TURN_USERNAME ?? import.meta.env.VITE_TURN_USERNAME;
  const turnCred = runtimeEnv.VITE_TURN_CREDENTIAL ?? import.meta.env.VITE_TURN_CREDENTIAL;
  if (turnServer) {
    iceServers.push({
      urls: turnServer,
      username: turnUser || undefined,
      credential: turnCred || undefined,
    });
  }
  return { iceServers };
}

interface SharePeer {
  userId: string;
  name: string;
  pc: RTCPeerConnection;
  connected: boolean;
}

/**
 * Manages WebRTC screen sharing between players.
 *
 * The sharer captures their screen via `getDisplayMedia()` and sends the
 * stream to all peers in the room.  Viewers receive the stream and display
 * it on the projector screen via a `<video>` element overlay.
 *
 * Signalling (offer / answer / ICE) is relayed through the game server
 * using the same pattern as VoiceManager.
 */
export class ScreenShareManager {
  private screenStream: MediaStream | null = null;
  private peers = new Map<string, SharePeer>();
  private myUserId: string;
  private sendFn: (msg: ClientMsg) => void;
  private _sharing = false;

  /** Called by viewers when a remote stream arrives — used to attach to video element. */
  onRemoteStream: ((stream: MediaStream, userId: string) => void) | null = null;

  /** Called when the sharer's stream ends (user stops sharing via browser UI). */
  onStreamEnded: (() => void) | null = null;

  constructor(myUserId: string, sendFn: (msg: ClientMsg) => void) {
    this.myUserId = myUserId;
    this.sendFn = sendFn;
  }

  get sharing(): boolean { return this._sharing; }

  /** Returns the local screen stream (null if not sharing). */
  get localStream(): MediaStream | null { return this.screenStream; }

  /** Start sharing your screen to all peers in the room. */
  async startSharing(): Promise<void> {
    if (this._sharing) return;
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
    } catch (err) {
      console.error("[screen-share] getDisplayMedia failed:", err);
      throw err;
    }

    // Detect when user stops sharing via browser's native "Stop sharing" button
    const videoTrack = this.screenStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        this.stopSharing();
      };
    }

    this._sharing = true;
    this.sendFn({ type: "screen_share_start" });
  }

  /** Stop sharing your screen. */
  stopSharing(): void {
    if (!this._sharing) return;
    this._sharing = false;

    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }

    // Close all peer connections
    for (const [id] of this.peers) {
      this.closePeer(id);
    }
    this.peers.clear();

    this.sendFn({ type: "screen_share_stop" });
    this.onStreamEnded?.();
  }

  // ── Viewer side: a sharer appeared ──────────────────────────────────

  onSharerPeer(userId: string, name: string): void {
    if (userId === this.myUserId) return;
    console.log(`[screen-share] sharer peer appeared: ${userId} (${name})`);
    if (this.peers.has(userId)) {
      const existing = this.peers.get(userId)!;
      existing.name = name;
      return;
    }
    this.createViewerPeer(userId, name);
    // Viewer always initiates the offer — the sharer only responds to offers
    void this.initiateOffer(userId);
  }

  private createViewerPeer(userId: string, name: string): SharePeer {
    const pc = new RTCPeerConnection(getRtcConfig());

    // We are the viewer — we want to receive tracks
    pc.ontrack = (ev) => {
      const remoteStream = ev.streams[0];
      if (remoteStream && this.onRemoteStream) {
        this.onRemoteStream(remoteStream, userId);
      }
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendFn({ type: "screen_share_ice", targetUserId: userId, candidate: JSON.stringify({ candidate: ev.candidate.candidate, sdpMid: ev.candidate.sdpMid, sdpMLineIndex: ev.candidate.sdpMLineIndex }) });
      }
    };

    pc.onconnectionstatechange = () => {
      const peer = this.peers.get(userId);
      if (peer) {
        peer.connected = pc.connectionState === "connected";
      }
    };

    const peer: SharePeer = { userId, name, pc, connected: false };
    this.peers.set(userId, peer);
    return peer;
  }

  private async initiateOffer(userId: string): Promise<void> {
    const peer = this.peers.get(userId);
    if (!peer) return;
    try {
      // Request to receive video/audio
      peer.pc.addTransceiver("video", { direction: "recvonly" });
      peer.pc.addTransceiver("audio", { direction: "recvonly" });
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      console.log(`[screen-share] sending offer to ${userId}`);
      this.sendFn({ type: "screen_share_offer", targetUserId: userId, sdp: offer.sdp! });
    } catch (err) {
      console.error(`[screen-share] failed to create offer for ${userId}:`, err);
    }
  }

  // ── Sharer side: a viewer sent us an offer ──────────────────────────

  async onOffer(fromUserId: string, sdp: string): Promise<void> {
    if (!this._sharing || !this.screenStream) return;
    console.log(`[screen-share] received offer from ${fromUserId}`);
    let peer = this.peers.get(fromUserId);
    if (!peer) {
      peer = this.createSharerPeer(fromUserId, "Unknown");
    }
    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }));
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      this.sendFn({ type: "screen_share_answer", targetUserId: fromUserId, sdp: answer.sdp! });
    } catch (err) {
      console.error(`[screen-share] failed to handle offer from ${fromUserId}:`, err);
    }
  }

  private createSharerPeer(userId: string, name: string): SharePeer {
    const pc = new RTCPeerConnection(getRtcConfig());

    // Add screen share tracks
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => {
        pc.addTrack(track, this.screenStream!);
      });
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendFn({ type: "screen_share_ice", targetUserId: userId, candidate: JSON.stringify({ candidate: ev.candidate.candidate, sdpMid: ev.candidate.sdpMid, sdpMLineIndex: ev.candidate.sdpMLineIndex }) });
      }
    };

    pc.onconnectionstatechange = () => {
      const peer = this.peers.get(userId);
      if (peer) {
        peer.connected = pc.connectionState === "connected";
      }
    };

    const peer: SharePeer = { userId, name, pc, connected: false };
    this.peers.set(userId, peer);
    return peer;
  }

  async onAnswer(fromUserId: string, sdp: string): Promise<void> {
    const peer = this.peers.get(fromUserId);
    if (!peer) return;
    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
    } catch (err) {
      console.error(`[screen-share] failed to handle answer from ${fromUserId}:`, err);
    }
  }

  async onIce(fromUserId: string, candidate: string): Promise<void> {
    const peer = this.peers.get(fromUserId);
    if (!peer) return;
    try {
      const init = JSON.parse(candidate) as RTCIceCandidateInit;
      await peer.pc.addIceCandidate(new RTCIceCandidate(init));
    } catch (err) {
      console.error(`[screen-share] failed to add ICE candidate from ${fromUserId}:`, err);
    }
  }

  onPeerLeft(userId: string): void {
    this.closePeer(userId);
    this.peers.delete(userId);
  }

  private closePeer(userId: string): void {
    const peer = this.peers.get(userId);
    if (!peer) return;
    peer.pc.close();
  }

  destroy(): void {
    this.stopSharing();
  }
}
