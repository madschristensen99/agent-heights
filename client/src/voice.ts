import type { ClientMsg } from "../../shared/types";
import { RnnoiseWorkletNode, loadRnnoise } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";

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
  private processedStream: MediaStream | null = null;
  private rnnoiseNode: RnnoiseWorkletNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private peers = new Map<string, VoicePeer>();
  private myUserId: string;
  private sendFn: (msg: ClientMsg) => void;
  private _active = false;
  private _listening = false;
  private _micMuted = false;
  private _outputMuted = false;
  private _lastGainLog = 0;
  private speakingData: Uint8Array<ArrayBuffer> | null = null;
  private rnnoiseLoaded = false;

  constructor(myUserId: string, sendFn: (msg: ClientMsg) => void) {
    this.myUserId = myUserId;
    this.sendFn = sendFn;
  }

  get active(): boolean { return this._active; }
  get listening(): boolean { return this._listening; }
  get micMuted(): boolean { return this._micMuted; }
  get outputMuted(): boolean { return this._outputMuted; }
  get muted(): boolean { return this._micMuted; }

  private async ensureAudioContext(): Promise<AudioContext> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 48000 });
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    return this.audioContext;
  }

  private async ensureRnnoise(ctx: AudioContext): Promise<void> {
    if (this.rnnoiseLoaded) return;
    try {
      const wasmBinary = await loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseSimdWasmPath });
      await ctx.audioWorklet.addModule(rnnoiseWorkletPath);
      this.rnnoiseNode = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 });
      this.rnnoiseLoaded = true;
      console.log("[voice] RNNoise loaded successfully");
    } catch (err) {
      console.warn("[voice] RNNoise failed to load, falling back to browser DSP:", err);
      this.rnnoiseNode = null;
      this.rnnoiseLoaded = true;
    }
  }

  async startListenOnly(): Promise<void> {
    if (this._listening || this._active) return;
    await this.ensureAudioContext();
    this._listening = true;
    console.log("[voice] listen-only started, userId=", this.myUserId);
    this.sendFn({ type: "voice_listen" });
  }

  stopListenOnly(): void {
    if (!this._listening || this._active) return;
    this._listening = false;
    for (const [id] of this.peers) {
      this.closePeer(id);
    }
    this.peers.clear();
    this.sendFn({ type: "voice_listen_stop" });
    if (!this._active && this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  async start(): Promise<void> {
    if (this._active) return;
    const ctx = await this.ensureAudioContext();

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
          sampleSize: 16,
        },
        video: false,
      });
    } catch (err) {
      console.error("[voice] getUserMedia failed:", err);
      throw err;
    }
    this.micTrack = this.micStream.getAudioTracks()[0] ?? null;

    await this.ensureRnnoise(ctx);

    const source = ctx.createMediaStreamSource(this.micStream);
    const destination = ctx.createMediaStreamDestination();

    if (this.rnnoiseNode) {
      this.highpassFilter = ctx.createBiquadFilter();
      this.highpassFilter.type = "highpass";
      this.highpassFilter.frequency.value = 80;
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -35;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 3;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;

      source.connect(this.rnnoiseNode);
      this.rnnoiseNode.connect(this.highpassFilter);
      this.highpassFilter.connect(this.compressor);
      this.compressor.connect(destination);
      console.log("[voice] audio pipeline: mic → RNNoise → highpass(80Hz) → compressor → WebRTC");
    } else {
      this.highpassFilter = ctx.createBiquadFilter();
      this.highpassFilter.type = "highpass";
      this.highpassFilter.frequency.value = 80;
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -35;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 3;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;

      source.connect(this.highpassFilter);
      this.highpassFilter.connect(this.compressor);
      this.compressor.connect(destination);
      console.log("[voice] audio pipeline: mic → highpass(80Hz) → compressor → WebRTC (no RNNoise)");
    }

    this.processedStream = destination.stream;

    const wasListening = this._listening;
    this._active = true;
    this._listening = true;
    this._micMuted = false;
    console.log("[voice] started, sending voice_start, userId=", this.myUserId);
    this.sendFn({ type: "voice_start" });

    if (wasListening) {
      this.recreatePeersWithMicTrack();
    }
  }

  private recreatePeersWithMicTrack(): void {
    for (const [userId, peer] of this.peers) {
      const name = peer.name;
      this.closePeer(userId);
      this.peers.delete(userId);
      this.createPeer(userId, name);
      if (this.myUserId < userId) {
        void this.initiateOffer(userId);
      }
    }
  }

  stop(): void {
    if (!this._active) return;
    this._active = false;
    this._listening = false;
    this._micMuted = false;
    for (const [id] of this.peers) {
      this.closePeer(id);
    }
    this.peers.clear();
    if (this.rnnoiseNode) {
      try { this.rnnoiseNode.disconnect(); } catch {}
      this.rnnoiseNode = null;
    }
    if (this.highpassFilter) {
      try { this.highpassFilter.disconnect(); } catch {}
      this.highpassFilter = null;
    }
    if (this.compressor) {
      try { this.compressor.disconnect(); } catch {}
      this.compressor = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    this.micTrack = null;
    this.processedStream = null;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.rnnoiseLoaded = false;
    this.sendFn({ type: "voice_stop" });
  }

  setMuted(muted: boolean): void {
    this._micMuted = muted;
    if (this.micTrack) this.micTrack.enabled = !muted;
  }

  setOutputMuted(muted: boolean): void {
    this._outputMuted = muted;
  }

  onPeer(userId: string, name: string): void {
    console.log("[voice] onPeer:", userId, name, "active=", this._active, "listening=", this._listening, "self=", userId === this.myUserId);
    if ((!this._active && !this._listening) || userId === this.myUserId) return;
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

    // Add local mic track — use processed stream if available (RNNoise + filter), else raw mic
    const sendStream = this.processedStream ?? this.micStream;
    const sendTrack = sendStream?.getAudioTracks()[0] ?? null;
    if (sendTrack && sendStream) {
      pc.addTrack(sendTrack, sendStream);
      console.log("[voice] added local track to peer", userId, "processed=", !!this.processedStream, "enabled=", sendTrack.enabled, "readyState=", sendTrack.readyState);
    } else if (this._active) {
      console.warn("[voice] no mic track to add for peer", userId, "micTrack=", !!this.micTrack, "micStream=", !!this.micStream);
    } else {
      console.log("[voice] listen-only mode — no local track for peer", userId);
    }

    // Handle incoming remote track
    pc.ontrack = (ev) => {
      console.log("[voice] ontrack from", userId, "streams=", ev.streams.length, "audioCtx state=", this.audioContext?.state);
      const remoteStream = ev.streams[0];
      if (!remoteStream) {
        console.warn("[voice] no remote stream in ontrack");
        return;
      }
      // Log track details for debugging
      const tracks = remoteStream.getAudioTracks();
      console.log("[voice] remote audio tracks:", tracks.length, tracks.map(t => `kind=${t.kind} enabled=${t.enabled} readyState=${t.readyState} muted=${t.muted}`));
      // Ensure audioContext is running (may have been suspended by browser)
      if (this.audioContext && this.audioContext.state === "suspended") {
        void this.audioContext.resume();
      }
      const source = this.audioContext!.createMediaStreamSource(remoteStream);
      source.connect(gainNode);
      console.log("[voice] remote stream connected to gain node for", userId);
      // Also create a hidden audio element as fallback — some browsers need this
      // to actually decode/play the remote WebRTC audio stream.
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.srcObject = remoteStream;
      audioEl.style.display = "none";
      document.body.appendChild(audioEl);
      console.log("[voice] created fallback audio element for", userId);
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
    if (peer.pc.signalingState !== "stable") return;
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
    console.log("[voice] onOffer from", fromUserId, "active=", this._active, "listening=", this._listening);
    if (!this._active && !this._listening) return;
    let peer = this.peers.get(fromUserId);
    if (!peer) {
      peer = this.createPeer(fromUserId, "Unknown");
    }
    // Guard: ignore if already processing or connected (duplicate message)
    if (peer.pc.signalingState !== "stable" || peer.connected) {
      console.log("[voice] onOffer ignored — signalingState=", peer.pc.signalingState, "connected=", peer.connected);
      return;
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
    // Guard: ignore if not in have-local-offer state (duplicate or stale answer)
    if (peer.pc.signalingState !== "have-local-offer") {
      console.log("[voice] onAnswer ignored — signalingState=", peer.pc.signalingState);
      return;
    }
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
      peer.gainNode.gain.value = this._outputMuted ? 0 : gain;
      if (shouldLog) {
        // Check if remote audio data is actually flowing
        if (!this.speakingData) this.speakingData = new Uint8Array(new ArrayBuffer(256));
        peer.analyser.getByteFrequencyData(this.speakingData);
        let sum = 0;
        for (let i = 0; i < this.speakingData.length; i++) sum += this.speakingData[i];
        const avgLevel = sum / this.speakingData.length / 255;
        console.log(`[voice] gain for ${userId}: ${gain.toFixed(3)} (dist=${dist.toFixed(0)}, max=${maxDist}, outputMuted=${this._outputMuted}, audioLevel=${avgLevel.toFixed(3)})`);
      }
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
