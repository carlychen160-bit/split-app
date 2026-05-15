import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

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

// 啟用離線持久化
// 網路不穩或短暫斷線時，寫入會排隊，重連後自動補送到 Firebase
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    // 同時開多個分頁時會發生，可以忽略
    console.warn('Offline persistence unavailable: multiple tabs open');
  } else if (err.code === 'unimplemented') {
    // 瀏覽器不支援 IndexedDB
    console.warn('Offline persistence not supported in this browser');
  }
});
