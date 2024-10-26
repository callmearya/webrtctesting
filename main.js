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

const pc = new RTCPeerConnection(servers);
let localStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');

// Function to start webcam and create room
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  webcamVideo.srcObject = localStream;
  callButton.disabled = false;
  webcamButton.disabled = true;
};

// Function to create call offer and store room details in Firestore and Realtime Database
callButton.onclick = async () => {
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');

  callInput.value = callDoc.id;

  // Save offer candidates
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create and store offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = { sdp: offerDescription.sdp, type: offerDescription.type };
  await callDoc.set({ offer, participants: 1 });

  // Store room details in Firebase Realtime Database
  realtimeDatabase.ref('rooms/' + callDoc.id).set({
    id: callDoc.id,
    participants: 1,
    limit: 2,
  });
};

// Listener to check for joining requests (adjusted for participant limit)
firestore.collection('calls').onSnapshot((snapshot) => {
  snapshot.forEach((doc) => {
    const room = doc.data();
    if (room.participants >= 2) {
      realtimeDatabase.ref('rooms/' + doc.id).update({ full: true });
    }
  });
});
