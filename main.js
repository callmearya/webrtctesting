import './style.css';
import firebase from 'firebase/app';
import 'firebase/firestore';
import 'firebase/database';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD1b7InCyJf03f82MBrFCXNd_1lir3nWrQ",
  authDomain: "lil-testing.firebaseapp.com",
  databaseURL: "https://lil-testing-default-rtdb.firebaseio.com",
  projectId: "lil-testing",
  storageBucket: "lil-testing.appspot.com",
  messagingSenderId: "309006701748",
  appId: "1:309006701748:web:2cfa73093e14fbcc2af3e1"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const firestore = firebase.firestore();
const database = firebase.database();

// RTC Configuration
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global state
const pc = new RTCPeerConnection(servers);
let localStream = null;

// HTML elements
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');
const webcamVideo = document.getElementById('webcamVideo');

// Start the webcam automatically on page load
async function startWebcam() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    webcamVideo.srcObject = localStream;
  } catch (error) {
    console.error("Error accessing webcam:", error);
  }
}

// Function to get query parameters from the URL
function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    roomId: params.get('roomId'),
  };
}

// Call this function to populate the input field and enable the answer button
function initializeFromQuery() {
  const { roomId } = getQueryParams();
  if (roomId) {
    callInput.value = roomId; // Set the room ID in the input field
    answerButton.disabled = false; // Enable the answer button
  }
}

// Call this function on page load
initializeFromQuery();

// Call Button - Create a Call Offer
callButton.onclick = async () => {
  try {
    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Create a call document in Firestore
    const callDoc = firestore.collection('calls').doc();
    const offerCandidates = callDoc.collection('offerCandidates');
    const answerCandidates = callDoc.collection('answerCandidates');

    // Set the call input to the new room ID
    callInput.value = callDoc.id;

    // Save the room code to Realtime Database
    await database.ref('rooms/' + callDoc.id).set({
      roomId: callDoc.id,
      participants: 1 // Initialize with 1 participant
    });

    console.log("Room ID successfully saved to database:", callDoc.id);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        offerCandidates.add(event.candidate.toJSON());
      }
    };

    // Create offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };

    await callDoc.set({ offer });

    // Listen for remote answer
    callDoc.onSnapshot((snapshot) => {
      const data = snapshot.data();
      if (data?.answer && !pc.currentRemoteDescription) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
      }
    });

    // Listen for answer candidates
    answerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    // Disable the call button to prevent multiple calls
    callButton.disabled = true;
    answerButton.disabled = true; // Keep answer button disabled until a room is filled
    hangupButton.disabled = false; // Enable hangup button

  } catch (error) {
    console.error("Error in creating call:", error);
  }
};

// Answer Button - Answer the Call
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      answerCandidates.add(event.candidate.toJSON());
    }
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
  await database.ref('rooms/' + callId).update({
    participants: firebase.database.ServerValue.increment(1)
  });

  // Enable the hangup button after answering the call
  hangupButton.disabled = false;
};

// Hangup Button - Hangup the Call
hangupButton.onclick = async () => {
  pc.close();
  hangupButton.disabled = true;
  callButton.disabled = false;
  answerButton.disabled = true; // Keep answer button disabled after hangup
  callInput.value = ''; // Clear the call input field

  const callId = callInput.value;
  await database.ref('rooms/' + callId).remove(); // Remove room from Realtime Database
};

// Start the webcam on load
startWebcam();
