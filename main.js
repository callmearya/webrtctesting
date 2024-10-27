import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';
import 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyD1b7InCyJf03f82MBrFCXNd_1lir3nWrQ",
  authDomain: "lil-testing.firebaseapp.com",
  databaseURL: "https://lil-testing-default-rtdb.firebaseio.com",
  projectId: "lil-testing",
  storageBucket: "lil-testing.appspot.com",
  messagingSenderId: "309006701748",
  appId: "1:309006701748:web:2cfa73093e14fbcc2af3e1"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();
const realtimeDatabase = firebase.database();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// Automatically fill room code from URL and start webcam
document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const roomCode = urlParams.get('roomCode');

  if (roomCode) {
    callInput.value = roomCode;
    webcamButton.click(); // Simulate click to start webcam automatically
  }
});

// 1. Setup media sources
webcamButton.onclick = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    remoteStream = new MediaStream();

    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Pull tracks from remote stream, add to video stream
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track); // Ensure audio tracks are added
      });
    };

    webcamVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;

    callButton.disabled = false;
    answerButton.disabled = false;
    webcamButton.disabled = true;
    hangupButton.disabled = true; // Initially disable hangup button
  } catch (error) {
    console.error('Error accessing media devices.', error);
  }
};

// Function to monitor room deletion and redirect
const monitorRoomDeletion = async (callId) => {
  const callRef = realtimeDatabase.ref(`calls/${callId}`);

  callRef.on('value', (snapshot) => {
    if (!snapshot.exists()) {
      // Room has been deleted; redirect the user
      window.location.href = "https://sihtesting.netlify.app";
    }
  });
};

// 2. Create an offer
callButton.onclick = async () => {
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callDoc.id;

  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  const callRef = realtimeDatabase.ref(`calls/${callDoc.id}`);
  await callRef.set({
    offer,
    participantCount: 1,
  });

  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  // Start monitoring room deletion
  monitorRoomDeletion(callDoc.id);

  hangupButton.disabled = true; // Disable hangup for the caller
  answerButton.disabled = true;
  callInput.disabled = true;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  const callRef = realtimeDatabase.ref(`calls/${callId}`);
  await callRef.update({
    participantCount: 2,
  });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });

    hangupButton.disabled = false; // Enable hangup for the answerer
  });

  // Start monitoring room deletion
  monitorRoomDeletion(callId);
};

// 4. Hangup the call
hangupButton.onclick = async () => {
  const callId = callInput.value;

  // Stop and disconnect all media streams
  localStream.getTracks().forEach(track => track.stop());
  remoteStream.getTracks().forEach(track => track.stop());

  // Disconnect the peer connection
  pc.close();

  // Remove the room from Firestore and Realtime Database
  await firestore.collection('calls').doc(callId).delete();
  await realtimeDatabase.ref(`calls/${callId}`).remove();

  // Redirect to the specified URL for the user who pressed hangup
  window.location.href = "https://doctortestinglil.netlify.app";
};
