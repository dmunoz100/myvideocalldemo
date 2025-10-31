import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface VideoCallProps {
  roomId: string;
}

interface SignalData {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  sender?: string;
}

const socket: Socket = io('https://myvideocalldemo-api.onrender.com/');

export const VideoCall: React.FC<VideoCallProps> = ({ roomId }) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
     if (remoteVideoRef.current) {
      remoteVideoRef.current.volume = 0.9; // Volumen al 30%
    }
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    pcRef.current = pc;

    let localStream: MediaStream | null = null;
    let isUnmounted = false;

    const setupMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (isUnmounted || !pcRef.current) return;

        localStream = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Agregar tracks solo si la conexión sigue abierta
        if (pcRef.current.signalingState !== 'closed') {
          stream.getTracks().forEach((track) => pcRef.current?.addTrack(track, stream));
        }
      } catch (err) {
        console.error('Error al acceder a la cámara/micrófono:', err);
      }
    };

    setupMedia();

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { room: roomId, candidate: event.candidate });
      }
    };

    // Stream remoto
    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Señalización
    socket.on('user-joined', async () => {
      if (!pcRef.current) return;
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      socket.emit('offer', { room: roomId, sdp: offer });
    });

    // Estado	Qué significa
    // "stable"	No hay negociación pendiente. Estado normal.
    // "have-local-offer"	Ya creaste una offer local y esperas respuesta.
    // "have-remote-offer"	Ya recibiste una offer remota y aún no creaste ni aplicaste una answer.

    socket.on('offer', async (data: SignalData) => {
      if (!pcRef.current || !data.sdp) return;
       // Evita errores por ofertas repetidas
    if (pcRef.current.signalingState !== 'stable') {
        console.log('Ignoring offer because signalingState =', pcRef.current.signalingState);
        console.log("Signaling not stable, rolling back...");
        await Promise.all([
          pc.setLocalDescription({ type: "rollback" }), //rollback cancela la oferta anterior si llega una nueva antes de terminar.
          pc.setRemoteDescription(new RTCSessionDescription(data.sdp)),
        ]);
        return;
    }else {
    await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
    }
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      socket.emit('answer', { room: roomId, sdp: answer });
    });

    //Evitar que se cree doble listener
    socket.on('answer', async (data: SignalData) => {
      if (!pcRef.current || !data.sdp) return;
       if (pcRef.current.signalingState !== 'have-local-offer') {
    console.log('Ignorando answer, signalingState actual:', pcRef.current.signalingState);
    return;
  }
   try {
    await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));      
    console.log("✅ Remote answer aplicada correctamente");
  } catch (err) {
    console.log("❌ Error aplicando remote answer:", err);
  }
  
    });

    socket.on('ice-candidate', async (data: SignalData) => {
      if (!pcRef.current || !data.candidate) return;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.warn('Error agregando ICE candidate:', e);
      }
    });

    socket.emit('join', roomId);
    setJoined(true);

    // 🔹 Cleanup seguro
    return () => {
      isUnmounted = true;
      //limpiamos al desmontar el componente 
      socket.off('user-joined');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');

      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }

      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div>
      <video ref={localVideoRef} controls  autoPlay muted playsInline style={{ width: '300px' }} />
      <video ref={remoteVideoRef} controls  autoPlay playsInline style={{ width: '300px' }} />
      {joined && <p>Conectado a la sala {roomId}</p>}
    </div>
  );
};
