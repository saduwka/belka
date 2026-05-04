import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDYsp3YH-6zwinwntuNHBxqG1Ga40lNMnU",
  authDomain: "belka-77172.firebaseapp.com",
  databaseURL: "https://belka-77172-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "belka-77172",
  storageBucket: "belka-77172.firebasestorage.app",
  messagingSenderId: "615335983793",
  appId: "1:615335983793:web:8fe289841bf41c331e4090"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);