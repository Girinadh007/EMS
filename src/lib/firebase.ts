import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyCP77jqGjFI2ivzC4YQMorMm2kD6Fe9HnM",
    authDomain: "emsys-286d7.firebaseapp.com",
    projectId: "emsys-286d7",
    storageBucket: "emsys-286d7.firebasestorage.app",
    messagingSenderId: "117749207156",
    appId: "1:117749207156:web:2276303d154e3a30998121",
    measurementId: "G-SDSLFSV18N"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
