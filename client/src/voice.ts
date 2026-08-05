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
  gainNode: GainNode | null;
  analyser: AnalyserNode | null;
  connected: boolean;
  speaking: boolean;
  remoteStream: MediaStream | null;
  audioEl: HTMLAudioElement | null;
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
  return t;
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
  private externalContext: AudioContext | null = null;

  constructor(myUserId: string, sendFn: (msg: ClientMsg) => void) {
    this.myUserId = myUserId;
    this.sendFn = sendFn;
  }

  /** Share an AudioContext from another system (e.g. AudioSystem) to avoid creating a second one. */
  setExternalContext(ctx: AudioContext): void {
    if (this.audioContext) return; // already have our own
    this.externalContext = ctx;
  }

  get active(): boolean { return this._active; }
  get listening(): boolean { return this._listening; }
  get micMuted(): boolean { return this._micMuted; }
  get outputMuted(): boolean { return this._outputMuted; }
  get muted(): boolean { return this._micMuted; }

  private async ensureAudioContext(): Promise<AudioContext> {
    // Use shared context from AudioSystem if available (avoids dual-context issues on iOS)
    if (!this.audioContext && this.externalContext) {
      this.audioContext = this.externalContext;
    }
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
    // Don't create AudioContext here — on mobile it will be suspended without
    // a user gesture and MediaStreamSource nodes created while suspended won't
    // produce audio even after resume. The AudioContext is created lazily in
    // ensureAudioContext() which is called from start() (user gesture) or
    // unlockAudio() (user gesture).
    this._listening = true;
    console.log("[voice] listen-only started, userId=", this.myUserId);
    this.sendFn({ type: "voice_listen" });
  }

  /**
   * Unlock/resume the AudioContext within a user gesture.
   * Creates the AudioContext if needed, resumes it, and wires up the Web Audio
   * graph for any peers whose remote streams arrived before the context was
   * available. Also explicitly plays any fallback <audio> elements.
   */
  async unlockAudio(): Promise<void> {
    if (!this._listening && !this._active) return;
    const ctx = await this.ensureAudioContext();
    console.log("[voice] unlockAudio — context state:", ctx.state);
    // Wire up any peers that have remote streams but no gain/analyser yet
    for (const [userId, peer] of this.peers) {
      if (!peer.gainNode || !peer.analyser) {
        peer.gainNode = ctx.createGain();
        peer.gainNode.gain.value = 0;
        peer.analyser = ctx.createAnalyser();
        peer.analyser.fftSize = 256;
        peer.gainNode.connect(peer.analyser);
        peer.analyser.connect(ctx.destination);
        console.log("[voice] unlockAudio — created gain/analyser for peer", userId);
      }
      if (peer.remoteStream && peer.gainNode) {
        // Create MediaStreamSource now that context is running
        const source = ctx.createMediaStreamSource(peer.remoteStream);
        source.connect(peer.gainNode);
        console.log("[voice] unlockAudio — connected remote stream for peer", userId);
      }
      if (peer.audioEl) {
        void peer.audioEl.play().catch(() => {});
        console.log("[voice] unlockAudio — playing fallback audio for peer", userId);
      }
    }
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
      this.addMicTrackToExistingPeers();
    }

    // Wire up any peers whose remote streams arrived before AudioContext was running
    for (const [userId, peer] of this.peers) {
      if (!peer.gainNode || !peer.analyser) {
        peer.gainNode = ctx.createGain();
        peer.gainNode.gain.value = 0;
        peer.analyser = ctx.createAnalyser();
        peer.analyser.fftSize = 256;
        peer.gainNode.connect(peer.analyser);
        peer.analyser.connect(ctx.destination);
        console.log("[voice] start — created gain/analyser for peer", userId);
      }
      if (peer.remoteStream && peer.gainNode) {
        const src = ctx.createMediaStreamSource(peer.remoteStream);
        src.connect(peer.gainNode);
        console.log("[voice] start — connected remote stream for peer", userId);
      }
      if (peer.audioEl) {
        void peer.audioEl.play().catch(() => {});
      }
    }
  }

  private addMicTrackToExistingPeers(): void {
    const sendStream = this.processedStream ?? this.micStream;
    const sendTrack = sendStream?.getAudioTracks()[0] ?? null;
    if (!sendTrack || !sendStream) return;
    for (const [userId, peer] of this.peers) {
      try {
        peer.pc.addTrack(sendTrack, sendStream);
        console.log("[voice] added mic track to existing peer", userId);
        void this.initiateOffer(userId);
      } catch (err) {
        console.warn(`[voice] failed to add mic track to peer ${userId}:`, err);
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
    const existing = this.peers.get(userId);
    if (existing) {
      console.warn("[voice] createPeer called for existing peer", userId, "— returning existing");
      return existing;
    }
    const pc = new RTCPeerConnection(getRtcConfig());

    // Create gain/analyser only if AudioContext is available and running
    let gainNode: GainNode | null = null;
    let analyser: AnalyserNode | null = null;
    if (this.audioContext && this.audioContext.state === "running") {
      gainNode = this.audioContext.createGain();
      gainNode.gain.value = 0;
      analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      gainNode.connect(analyser);
      analyser.connect(this.audioContext.destination);
      console.log("[voice] created gain/analyser for peer", userId);
    } else {
      console.log("[voice] AudioContext not running — deferring gain/analyser for peer", userId, "ctxState=", this.audioContext?.state);
    }

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
      const tracks = remoteStream.getAudioTracks();
      console.log("[voice] remote audio tracks:", tracks.length, tracks.map(t => `kind=${t.kind} enabled=${t.enabled} readyState=${t.readyState} muted=${t.muted}`));

      // Store remote stream on peer for deferred wiring
      const peer = this.peers.get(userId);
      if (peer) peer.remoteStream = remoteStream;

      // If AudioContext is running, wire up the Web Audio graph now
      if (this.audioContext && this.audioContext.state === "running" && peer?.gainNode) {
        const source = this.audioContext.createMediaStreamSource(remoteStream);
        source.connect(peer.gainNode);
        console.log("[voice] remote stream connected to gain node for", userId);
      } else {
        console.log("[voice] AudioContext not running — deferring Web Audio wiring for", userId);
      }

      // Also create a hidden audio element as fallback — some browsers need this
      // to keep the remote WebRTC stream decoded/alive, but we mute it so that
      // actual audio output flows only through the gainNode (proximity volume).
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.muted = true;
      audioEl.srcObject = remoteStream;
      audioEl.style.display = "none";
      document.body.appendChild(audioEl);
      console.log("[voice] created muted fallback audio element for", userId);
      void audioEl.play().catch((err) => {
        console.warn("[voice] fallback audio play() rejected for", userId, err);
      });
      if (peer) peer.audioEl = audioEl;
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

    const peer: VoicePeer = { userId, name, pc, gainNode, analyser, connected: false, speaking: false, remoteStream: null, audioEl: null };
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
    // Guard: ignore if not in stable state (prevents glare / duplicate offers)
    if (peer.pc.signalingState !== "stable") {
      console.log("[voice] onOffer ignored — signalingState=", peer.pc.signalingState);
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
    if (peer.gainNode) { try { peer.gainNode.disconnect(); } catch {} }
    if (peer.analyser) { try { peer.analyser.disconnect(); } catch {} }
    if (peer.audioEl) { peer.audioEl.remove(); peer.audioEl = null; }
    peer.remoteStream = null;
  }

  updateVolumes(myX: number, myY: number, players: Map<string, { x: number; y: number }>, isOutdoor: boolean): void {
    const maxDist = isOutdoor ? MAX_VOICE_DISTANCE_OUTDOOR : MAX_VOICE_DISTANCE_INDOOR;
    const now = Date.now();
    const shouldLog = now - this._lastGainLog > 1000;
    if (shouldLog) this._lastGainLog = now;
    for (const [userId, peer] of this.peers) {
      if (!peer.gainNode) continue;
      const p = players.get(userId);
      if (!p) {
        peer.gainNode.gain.setTargetAtTime(0, this.audioContext!.currentTime, 0.1);
        if (shouldLog) console.log(`[voice] gain for ${userId}: 0 (not in roomPlayers)`);
        continue;
      }
      const dx = myX - p.x;
      const dy = myY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const gain = distanceToGain(dist, maxDist);
      const targetGain = this._outputMuted ? 0 : gain;
      peer.gainNode.gain.setTargetAtTime(targetGain, this.audioContext!.currentTime, 0.1);
      if (shouldLog && peer.analyser) {
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
      if (!peer.connected || !peer.analyser) continue;
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
