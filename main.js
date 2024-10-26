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
let remoteStream = new MediaStream(); // Create a new MediaStream for remote

// HTML elements
const webcamVideo = document.getElementById('webcamVideo');
const remoteVideo = document.getElementById('remoteVideo'); // New remote video element
const callButton = document.getElementById('callButton');

// 1. Setup media sources and create call
callButton.onclick = async () => {
    // Start the webcam when the call button is clicked
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    webcamVideo.srcObject = localStream;

    const callsRef = database.ref('calls');

    // Check the current number of participants
    const snapshot = await callsRef.once('value');
    const activeCalls = snapshot.val() || {};
    const participantCount = Object.keys(activeCalls).length;

    // Allow creating a call only if less than 2 participants
    if (participantCount >= 2) {
        alert('Maximum of 2 participants already in the call. Please try again later.');
        return;
    }

    // Reference Firestore collections for signaling
    const callDoc = firestore.collection('calls').doc();
    const offerCandidates = callDoc.collection('offerCandidates');

    // Create offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
    };

    // Save offer to Firestore
    await callDoc.set({ offer });

    // Register the call offer in Firebase Realtime Database
    await database.ref('calls/' + callDoc.id).set({ offer });

    // Get call ID
    console.log("Call ID:", callDoc.id);

    // Get candidates for caller, save to db
    pc.onicecandidate = (event) => {
        event.candidate && offerCandidates.add(event.candidate.toJSON());
    };

    // Listen for remote answer
    callDoc.onSnapshot((snapshot) => {
        const data = snapshot.data();
        if (!pc.currentRemoteDescription && data?.answer) {
            const answerDescription = new RTCSessionDescription(data.answer);
            pc.setRemoteDescription(answerDescription);
        }
    });

    // Pull tracks from remote stream, add to video stream
    pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track);
        });
        remoteVideo.srcObject = remoteStream; // Set the remote video stream
    };

    // Handle incoming ICE candidates
    offerCandidates.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc.addIceCandidate(candidate);
            }
        });
    });
};
