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

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const firestore = firebase.firestore();
const realtimeDatabase = firebase.database();

const servers = {
  iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }],
};

const pc = new RTCPeerConnection(servers);
let localStream = null, remoteStream = new MediaStream();

const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const answerButton = document.getElementById('answerButton');
const hangupButton = document.getElementById('hangupButton');
const callInput = document.getElementById('callInput');
const remoteVideo = document.getElementById('remoteVideo');
const mainContent = document.getElementById('mainContent');

// Toggle visibility after starting webcam
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;
  webcamButton.classList.add('hidden');
  mainContent.classList.remove('hidden');
  callButton.disabled = answerButton.disabled = false;
};

callButton.onclick = async () => {
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  callInput.value = callDoc.id;

  pc.onicecandidate = e => e.candidate && offerCandidates.add(e.candidate.toJSON());

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  await callDoc.set({ offer: { type: offerDescription.type, sdp: offerDescription.sdp } });

  callDoc.onSnapshot(snapshot => {
    const data = snapshot.data();
    if (data.answer) pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  });
};

answerButton.onclick = async () => {
  const callDoc = firestore.collection('calls').doc(callInput.value);
  const callData = (await callDoc.get()).data();

  await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  await callDoc.update({ answer: { type: answerDescription.type, sdp: answerDescription.sdp } });
};

hangupButton.onclick = () => {
  localStream.getTracks().forEach(track => track.stop());
  pc.close();
  remoteStream.getTracks().forEach(track => track.stop());
  firestore.collection('calls').doc(callInput.value).delete();
  webcamVideo.srcObject = remoteVideo.srcObject = null;
  callButton.disabled = answerButton.disabled = true;
};
