document.addEventListener("DOMContentLoaded", () => {
  import firebase from 'firebase/app';
  import 'firebase/firestore';
  import 'firebase/database';

  // Initialize Firebase
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

  // ICE Servers for WebRTC
  const servers = {
    iceServers: [
      {
        urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
      },
    ],
    iceCandidatePoolSize: 10,
  };

  const pc = new RTCPeerConnection(servers);
  let remoteStream = new MediaStream();

  // HTML elements
  const callInput = document.getElementById('callInput');
  const answerButton = document.getElementById('answerButton');
  const remoteVideo = document.getElementById('remoteVideo');
  const hangupButton = document.getElementById('hangupButton');

  // Set remote stream to video element
  remoteVideo.srcObject = remoteStream;

  // Parse room ID from URL parameters (auto-fill if available)
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('roomId');
  if (roomId) {
    callInput.value = roomId;
    answerButton.click();
  }

  // Answer button: Join the call
  answerButton.onclick = async () => {
    const callId = callInput.value;
    const callDoc = firestore.collection('calls').doc(callId);
    const answerCandidates = callDoc.collection('answerCandidates');
    const offerCandidates = callDoc.collection('offerCandidates');

    // Listen for remote ICE candidates and add to peer connection
    pc.onicecandidate = (event) => {
      event.candidate && answerCandidates.add(event.candidate.toJSON());
    };

    // Fetch call offer and set it as remote description
    const callData = (await callDoc.get()).data();
    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    // Create answer and set it as local description
    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await callDoc.update({ answer });

    // Listen for incoming ICE candidates in the offerCandidates collection
    offerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });

    // Display the remote stream
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    };

    hangupButton.disabled = false;
    answerButton.disabled = true;
  };

  // Hangup button: End the call and delete from Firestore and Realtime Database
  hangupButton.onclick = async () => {
    const callId = callInput.value;

    // Delete Firestore document for the call
    try {
      await firestore.collection('calls').doc(callId).delete();
      console.log(`Firestore document for call ${callId} deleted successfully.`);
    } catch (error) {
      console.error(`Error deleting Firestore document: ${error}`);
    }

    // Remove room entry from Firebase Realtime Database
    try {
      await realtimeDatabase.ref('rooms/' + callId).remove();
      console.log(`Realtime Database entry for call ${callId} removed successfully.`);
    } catch (error) {
      console.error(`Error removing room from Realtime Database: ${error}`);
    }

    // Close the peer connection
    pc.close();
    hangupButton.disabled = true;
    callInput.value = '';
  };
});
