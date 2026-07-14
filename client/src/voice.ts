import type { ClientMsg } from "../../shared/types";

const MAX_VOICE_DISTANCE_INDOOR = 600;
const MAX_VOICE_DISTANCE_OUTDOOR = 1000;
const SPEAKING_THRESHOLD = 0.02;

interface VoicePeer {
  userId: string;
  name: string;
  pc: RTCPeerConnection;
  gainNode: GainNode;
  analyser: AnalyserNode;
  connected: boolean;
  speaking: boolean;
}

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

function distanceToGain(dist: number, maxDist: number): number {
  const t = Math.max(0, 1 - dist / maxDist);
  return t * t;
}

export class VoiceManager {
  private audioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micTrack: MediaStreamTrack | null = null;
  private peers = new Map<string, VoicePeer>();
  private myUserId: string;
  private sendFn: (msg: ClientMsg) => void;
  private _active = false;
  private _muted = false;
  private _lastGainLog = 0;
  private speakingData: Uint8Array<ArrayBuffer> | null = null;

  constructor(myUserId: string, sendFn: (msg: ClientMsg) => void) {
    this.myUserId = myUserId;
    this.sendFn = sendFn;
  }

  get active(): boolean { return this._active; }
  get muted(): boolean { return this._muted; }

  async start(): Promise<void> {
    if (this._active) return;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (err) {
      console.error("[voice] getUserMedia failed:", err);
      throw err;
    }
    this.micTrack = this.micStream.getAudioTracks()[0] ?? null;
    this.audioContext = new AudioContext();
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    this._active = true;
    this._muted = false;
    console.log("[voice] started, sending voice_start, userId=", this.myUserId);
    this.sendFn({ type: "voice_start" });
  }

  stop(): void {
    if (!this._active) return;
    this._active = false;
    this._muted = false;
    for (const [id] of this.peers) {
      this.closePeer(id);
    }
    this.peers.clear();
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    this.micTrack = null;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.sendFn({ type: "voice_stop" });
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    if (this.micTrack) this.micTrack.enabled = !muted;
  }

  onPeer(userId: string, name: string): void {
    console.log("[voice] onPeer:", userId, name, "active=", this._active, "self=", userId === this.myUserId);
    if (!this._active || userId === this.myUserId) return;
    if (this.peers.has(userId)) {
      const existing = this.peers.get(userId)!;
      existing.name = name;
      return;
    }
    this.createPeer(userId, name);
    // Deterministic initiator: lower userId creates the offer
    if (this.myUserId < userId) {
      console.log("[voice] initiating offer to", userId, "(we are lower)");
      void this.initiateOffer(userId);
    } else {
      console.log("[voice] waiting for offer from", userId, "(they are lower)");
    }
  }

  private createPeer(userId: string, name: string): VoicePeer {
    const pc = new RTCPeerConnection(getRtcConfig());
    const gainNode = this.audioContext!.createGain();
    gainNode.gain.value = 0;
    const analyser = this.audioContext!.createAnalyser();
    analyser.fftSize = 256;
    gainNode.connect(analyser);
    analyser.connect(this.audioContext!.destination);

    // Add local mic track
    if (this.micTrack && this.micStream) {
      pc.addTrack(this.micTrack, this.micStream);
    }

    // Handle incoming remote track
    pc.ontrack = (ev) => {
      console.log("[voice] ontrack from", userId, "streams=", ev.streams.length);
      const remoteStream = ev.streams[0];
      if (!remoteStream) {
        console.warn("[voice] no remote stream in ontrack");
        return;
      }
      const source = this.audioContext!.createMediaStreamSource(remoteStream);
      source.connect(gainNode);
    };

    // ICE candidates → relay to peer via server (send full candidate init)
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        const candidateInit = JSON.stringify({
          candidate: ev.candidate.candidate,
          sdpMid: ev.candidate.sdpMid,
          sdpMLineIndex: ev.candidate.sdpMLineIndex,
        });
        console.log("[voice] ICE candidate for", userId, "sdpMid=", ev.candidate.sdpMid, "mLineIdx=", ev.candidate.sdpMLineIndex);
        this.sendFn({ type: "voice_ice", targetUserId: userId, candidate: candidateInit });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[voice] peer", userId, "state:", pc.connectionState);
      if (pc.connectionState === "connected") {
        const peer = this.peers.get(userId);
        if (peer) peer.connected = true;
      } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        const peer = this.peers.get(userId);
        if (peer) peer.connected = false;
      }
    };

    const peer: VoicePeer = { userId, name, pc, gainNode, analyser, connected: false, speaking: false };
    this.peers.set(userId, peer);
    return peer;
  }

  private async initiateOffer(userId: string): Promise<void> {
    const peer = this.peers.get(userId);
    if (!peer) return;
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      console.log("[voice] sending offer to", userId);
      this.sendFn({ type: "voice_offer", targetUserId: userId, sdp: offer.sdp! });
    } catch (err) {
      console.error(`[voice] failed to create offer for ${userId}:`, err);
    }
  }

  async onOffer(fromUserId: string, sdp: string): Promise<void> {
    console.log("[voice] onOffer from", fromUserId, "active=", this._active);
    if (!this._active) return;
    let peer = this.peers.get(fromUserId);
    if (!peer) {
      peer = this.createPeer(fromUserId, "Unknown");
    }
    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }));
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      console.log("[voice] sending answer to", fromUserId);
      this.sendFn({ type: "voice_answer", targetUserId: fromUserId, sdp: answer.sdp! });
    } catch (err) {
      console.error(`[voice] failed to handle offer from ${fromUserId}:`, err);
    }
  }

  async onAnswer(fromUserId: string, sdp: string): Promise<void> {
    console.log("[voice] onAnswer from", fromUserId);
    const peer = this.peers.get(fromUserId);
    if (!peer) return;
    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
      console.log("[voice] remote description set for", fromUserId);
    } catch (err) {
      console.error(`[voice] failed to handle answer from ${fromUserId}:`, err);
    }
  }

  async onIce(fromUserId: string, candidate: string): Promise<void> {
    const peer = this.peers.get(fromUserId);
    if (!peer) {
      console.warn("[voice] ICE from unknown peer", fromUserId);
      return;
    }
    try {
      const init = JSON.parse(candidate) as RTCIceCandidateInit;
      await peer.pc.addIceCandidate(new RTCIceCandidate(init));
    } catch (err) {
      console.error(`[voice] failed to add ICE candidate from ${fromUserId}:`, err);
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
    try { peer.gainNode.disconnect(); } catch {}
    try { peer.analyser.disconnect(); } catch {}
  }

  updateVolumes(myX: number, myY: number, players: Map<string, { x: number; y: number }>, isOutdoor: boolean): void {
    const maxDist = isOutdoor ? MAX_VOICE_DISTANCE_OUTDOOR : MAX_VOICE_DISTANCE_INDOOR;
    const now = Date.now();
    const shouldLog = now - this._lastGainLog > 1000;
    if (shouldLog) this._lastGainLog = now;
    for (const [userId, peer] of this.peers) {
      const p = players.get(userId);
      if (!p) {
        peer.gainNode.gain.value = 0;
        if (shouldLog) console.log(`[voice] gain for ${userId}: 0 (not in roomPlayers)`);
        continue;
      }
      const dx = myX - p.x;
      const dy = myY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const gain = distanceToGain(dist, maxDist);
      peer.gainNode.gain.value = this._muted ? 0 : gain;
      if (shouldLog) console.log(`[voice] gain for ${userId}: ${gain.toFixed(3)} (dist=${dist.toFixed(0)}, max=${maxDist}, muted=${this._muted})`);
    }
  }

  getSpeakingPeers(): Set<string> {
    const speaking = new Set<string>();
    if (!this.speakingData) {
      this.speakingData = new Uint8Array(new ArrayBuffer(256));
    }
    for (const [userId, peer] of this.peers) {
      if (!peer.connected) continue;
      peer.analyser.getByteFrequencyData(this.speakingData);
      let sum = 0;
      for (let i = 0; i < this.speakingData.length; i++) {
        sum += this.speakingData[i];
      }
      const avg = sum / this.speakingData.length / 255;
      peer.speaking = avg > SPEAKING_THRESHOLD;
      if (peer.speaking) speaking.add(userId);
    }
    return speaking;
  }

  getPeerList(): { userId: string; name: string; connected: boolean }[] {
    return Array.from(this.peers.values()).map(p => ({ userId: p.userId, name: p.name, connected: p.connected }));
  }
}
