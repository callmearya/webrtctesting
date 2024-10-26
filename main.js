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
const database = firebase.database();

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
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// Function to get the room ID from the URL
function getRoomIdFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('roomId');
}

// Start webcam on page load
async function startWebcam() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    remoteStream = new MediaStream();

    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Set local video
    const webcamVideo = document.getElementById('webcamVideo');
    webcamVideo.srcObject = localStream;

    // Check for room ID and answer if available
    const roomId = getRoomIdFromURL();
    if (roomId) {
      callInput.value = roomId; // Set the call input to the room ID
      hangupButton.disabled = false; // Enable hangup button
      await answerCall(roomId); // Automatically answer the call
    }

  } catch (error) {
    console.error("Error starting webcam:", error);
  }
}

// Answer the call with the unique ID
async function answerCall(callId) {
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

  // Update participant count in Realtime Database
  await database.ref('rooms/' + callId).transaction((currentData) => {
    return {
      ...currentData,
      participants: (currentData.participants || 0) + 1 // Increment participant count
    };
  });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
};

// Hangup function
hangupButton.onclick = async () => {
  const callId = callInput.value;

  // Remove the room from the Realtime Database
  await database.ref('rooms/' + callId).remove().catch(error => {
    console.error("Error removing room:", error);
  });

  // Reset local and remote streams
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  // Close the peer connection
  pc.close();
  
  // Reset the state
  callInput.value = '';
  hangupButton.disabled = true; // Disable hangup button again
};

// Cleanup when the user leaves
window.onbeforeunload = async () => {
  const callId = callInput.value;
  if (callId) {
    // Decrement participant count
    await database.ref('rooms/' + callId).transaction((currentData) => {
      if (currentData) {
        return {
          ...currentData,
          participants: currentData.participants > 0 ? currentData.participants - 1 : 0
        };
      }
    });
  }
};

// Start the webcam when the page loads
window.onload = startWebcam;
