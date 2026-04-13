import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDINFv6GGzqirobPOQkKp-caxC--PH4u6Q",
  authDomain: "split-app-8d8c6.firebaseapp.com",
  projectId: "split-app-8d8c6",
  storageBucket: "split-app-8d8c6.firebasestorage.app",
  messagingSenderId: "393690021166",
  appId: "1:393690021166:web:8f0225274270d62d2f0ebf",
  measurementId: "G-V4RDTTMCQL"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
