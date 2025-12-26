// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyD3ovbIrPvvJ4og3fu5fLk02DuGjULGAUQ",
  authDomain: "devocionalbatista-fe24c.firebaseapp.com",
  projectId: "devocionalbatista-fe24c",
  storageBucket: "devocionalbatista-fe24c.firebasestorage.app",
  messagingSenderId: "415752348536",
  appId: "1:415752348536:web:071a995951bbb819f81e8d",
  measurementId: "G-16VHY8EDVG"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Preparamos o Banco de Dados e a Autenticação para usar nos outros arquivos
const db = getFirestore(app);
const auth = getAuth(app);

// Exportamos para poder usar no arquivo principal
export { db, auth };