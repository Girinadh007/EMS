import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyCyvFUuWoKTPjwhMmKp3AJPE_8yv9uO2j0",
    authDomain: "hmsys-c4011.firebaseapp.com",
    projectId: "hmsys-c4011",
    storageBucket: "hmsys-c4011.firebasestorage.app",
    messagingSenderId: "1049288502422",
    appId: "1:1049288502422:web:e59be5e663d4d7318726b7",
    measurementId: "G-C5NR0HC60F"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
