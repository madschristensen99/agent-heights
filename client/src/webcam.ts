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

interface WebcamPeer {
  userId: string;
  name: string;
  pc: RTCPeerConnection;
  connected: boolean;
}

/**
 * Manages WebRTC webcam broadcasting from the phone booth.
 *
 * The broadcaster captures camera + mic via `getUserMedia()` and sends the
 * stream to all peers in the room.  Viewers receive the stream and display
 * it on the projector screen (webcam half) via a `<video>` element.
 *
 * Signalling (offer / answer / ICE) is relayed through the game server
 * using the same pattern as ScreenShareManager and VoiceManager.
 */
export class WebcamManager {
  private camStream: MediaStream | null = null;
  private peers = new Map<string, WebcamPeer>();
  private myUserId: string;
  private sendFn: (msg: ClientMsg) => void;
  private _broadcasting = false;

  /** Called by viewers when a remote stream arrives — used to attach to video element. */
  onRemoteStream: ((stream: MediaStream, userId: string) => void) | null = null;

  /** Called when the broadcaster's stream ends (user stops via browser UI or track ended). */
  onStreamEnded: (() => void) | null = null;

  /** Called when webcam state changes (start/stop). */
  onStateChange: ((broadcasting: boolean) => void) | null = null;

  constructor(myUserId: string, sendFn: (msg: ClientMsg) => void) {
    this.myUserId = myUserId;
    this.sendFn = sendFn;
  }

  get broadcasting(): boolean { return this._broadcasting; }

  /** Returns the local camera+mic stream (null if not broadcasting). */
  get localStream(): MediaStream | null { return this.camStream; }

  /** Start broadcasting webcam + mic to all peers in the room. */
  async startBroadcasting(): Promise<void> {
    if (this._broadcasting) return;
    try {
      this.camStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15, max: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      console.error("[webcam] getUserMedia failed:", err);
      throw err;
    }

    const videoTrack = this.camStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        this.stopBroadcasting();
      };
    }

    this._broadcasting = true;
    this.sendFn({ type: "webcam_start" });
    this.onStateChange?.(true);
  }

  /** Stop broadcasting webcam. */
  stopBroadcasting(): void {
    if (!this._broadcasting) return;
    this._broadcasting = false;

    if (this.camStream) {
      this.camStream.getTracks().forEach(t => t.stop());
      this.camStream = null;
    }

    for (const [id] of this.peers) {
      this.closePeer(id);
    }
    this.peers.clear();

    this.sendFn({ type: "webcam_stop" });
    this.onStreamEnded?.();
    this.onStateChange?.(false);
  }

  // ── Viewer side: a broadcaster appeared ─────────────────────────────

  onBroadcasterPeer(userId: string, name: string): void {
    if (userId === this.myUserId) return;
    if (this.peers.has(userId)) {
      const existing = this.peers.get(userId)!;
      existing.name = name;
      return;
    }
    this.createViewerPeer(userId, name);
    // Viewer always initiates the offer — broadcaster only responds to offers
    void this.initiateOffer(userId);
  }

  private createViewerPeer(userId: string, name: string): WebcamPeer {
    const pc = new RTCPeerConnection(getRtcConfig());

    pc.ontrack = (ev) => {
      const remoteStream = ev.streams[0];
      if (remoteStream && this.onRemoteStream) {
        this.onRemoteStream(remoteStream, userId);
      }
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendFn({ type: "webcam_ice", targetUserId: userId, candidate: ev.candidate.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      const peer = this.peers.get(userId);
      if (peer) {
        peer.connected = pc.connectionState === "connected";
      }
    };

    const peer: WebcamPeer = { userId, name, pc, connected: false };
    this.peers.set(userId, peer);
    return peer;
  }

  private async initiateOffer(userId: string): Promise<void> {
    const peer = this.peers.get(userId);
    if (!peer) return;
    try {
      peer.pc.addTransceiver("video", { direction: "recvonly" });
      peer.pc.addTransceiver("audio", { direction: "recvonly" });
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.sendFn({ type: "webcam_offer", targetUserId: userId, sdp: offer.sdp! });
    } catch (err) {
      console.error(`[webcam] failed to create offer for ${userId}:`, err);
    }
  }

  // ── Broadcaster side: a viewer sent us an offer ─────────────────────

  async onOffer(fromUserId: string, sdp: string): Promise<void> {
    if (!this._broadcasting || !this.camStream) return;
    let peer = this.peers.get(fromUserId);
    if (!peer) {
      peer = this.createBroadcasterPeer(fromUserId, "Unknown");
    }
    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }));
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      this.sendFn({ type: "webcam_answer", targetUserId: fromUserId, sdp: answer.sdp! });
    } catch (err) {
      console.error(`[webcam] failed to handle offer from ${fromUserId}:`, err);
    }
  }

  private createBroadcasterPeer(userId: string, name: string): WebcamPeer {
    const pc = new RTCPeerConnection(getRtcConfig());

    if (this.camStream) {
      this.camStream.getTracks().forEach(track => {
        pc.addTrack(track, this.camStream!);
      });
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendFn({ type: "webcam_ice", targetUserId: userId, candidate: ev.candidate.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      const peer = this.peers.get(userId);
      if (peer) {
        peer.connected = pc.connectionState === "connected";
      }
    };

    const peer: WebcamPeer = { userId, name, pc, connected: false };
    this.peers.set(userId, peer);
    return peer;
  }

  async onAnswer(fromUserId: string, sdp: string): Promise<void> {
    const peer = this.peers.get(fromUserId);
    if (!peer) return;
    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
    } catch (err) {
      console.error(`[webcam] failed to handle answer from ${fromUserId}:`, err);
    }
  }

  async onIce(fromUserId: string, candidate: string): Promise<void> {
    const peer = this.peers.get(fromUserId);
    if (!peer) return;
    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate({ candidate }));
    } catch (err) {
      console.error(`[webcam] failed to add ICE candidate from ${fromUserId}:`, err);
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
    this.stopBroadcasting();
  }
}
