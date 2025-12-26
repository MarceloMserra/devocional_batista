import { db, auth } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, query, orderBy, onSnapshot, updateDoc, doc, arrayUnion, arrayRemove, setDoc, getDoc } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIGURAÇÃO ---
const OPENAI_API_KEY = "SUA_CHAVE_AQUI";
let usuarioAtual = null;
let modoCadastro = false;
let audioPlayer = null;

// ======================================================
// 1. CARREGAR CONTEÚDO (HERO & LEITURA)
// ======================================================

async function carregarDevocional() {
    try {
        // Simulação de Fetch (Use seu arquivo real ou essa lista simulada)
        const resposta = await fetch('devocionais.json'); 
        const dados = await resposta.json();
        
        const hoje = new Date().toISOString().split('T')[0];
        const dev = dados.find(d => d.data === hoje) || dados.find(d => d.data === 'default');

        // Preencher o Hero (Destaque Principal)
        document.getElementById('hero-titulo').innerText = dev.titulo;
        document.getElementById('hero-versiculo').innerText = `"${dev.versiculo}"`;
        
        // Preencher o Modal de Leitura
        document.getElementById('modal-titulo-texto').innerText = dev.titulo;
        document.getElementById('modal-ref').innerText = dev.referencia;
        document.getElementById('modal-corpo-texto').innerHTML = `<p>${dev.texto}</p>`;

    } catch (e) {
        console.error("Erro carregando json", e);
    }
}
carregarDevocional();

// ======================================================
// 2. CRONOGRAMA DE LEITURA (CARROSSEL)
// ======================================================

function gerarCarrosselLeitura() {
    const container = document.getElementById('carousel-leitura');
    container.innerHTML = "";

    // Gera 30 dias de exemplo
    for(let i=1; i<=30; i++) {
        const card = document.createElement('div');
        card.className = 'card-leitura';
        card.dataset.dia = i;
        card.innerHTML = `
            <span style="font-size:0.8rem; color:#aaa">DIA</span>
            <span style="font-size:1.5rem; font-weight:bold">${i}</span>
        `;
        
        card.addEventListener('click', () => toggleLeitura(i, card));
        container.appendChild(card);
    }
}
gerarCarrosselLeitura();

async function toggleLeitura(dia, elemento) {
    if(!usuarioAtual) { abrirLogin(); return; }
    
    elemento.classList.toggle('lido');
    
    // Salvar no Firebase
    const userRef = doc(db, "usuarios", usuarioAtual.uid);
    if(elemento.classList.contains('lido')) {
        await updateDoc(userRef, { leituraProgresso: arrayUnion(dia) });
    } else {
        await updateDoc(userRef, { leituraProgresso: arrayRemove(dia) });
    }
}

async function carregarProgresso(uid) {
    const snap = await getDoc(doc(db, "usuarios", uid));
    if(snap.exists()) {
        const lidos = snap.data().leituraProgresso || [];
        lidos.forEach(dia => {
            const el = document.querySelector(`.card-leitura[data-dia="${dia}"]`);
            if(el) el.classList.add('lido');
        });
    }
}

// ======================================================
// 3. MURAL DE ORAÇÕES (FEED)
// ======================================================

const q = query(collection(db, "oracoes"), orderBy("data", "desc"));
onSnapshot(q, (snapshot) => {
    const container = document.getElementById('carousel-oracao');
    container.innerHTML = "";
    
    if(snapshot.empty) {
        container.innerHTML = "<div class='card-empty' style='color:#777; padding:20px'>Seja o primeiro a pedir oração.</div>";
        return;
    }

    snapshot.forEach(docSnap => {
        const d = docSnap.data();
        const id = docSnap.id;
        const total = d.oraram ? d.oraram.length : 0;
        
        const card = document.createElement('div');
        card.className = 'card-oracao';
        card.innerHTML = `
            <div class="card-top">
                <span>${d.autor}</span>
                <span>${new Date(d.data.seconds * 1000).toLocaleDateString()}</span>
            </div>
            <p style="font-size:0.9rem; line-height:1.4; color:#ddd; margin-bottom:10px">${d.texto}</p>
            <button class="btn-orar" onclick="window.orarPor('${id}')">
                🙏 Orar (${total})
            </button>
        `;
        container.appendChild(card);
    });
});

window.orarPor = async (id) => {
    if(!usuarioAtual) { abrirLogin(); return; }
    await updateDoc(doc(db, "oracoes", id), { oraram: arrayUnion(usuarioAtual.uid) });
    // Feedback visual simples
    alert("Oração registrada! Deus abençoe.");
};

// ======================================================
// 4. AUTENTICAÇÃO (LOGIN / CADASTRO)
// ======================================================

// Toggle Login/Cadastro
document.getElementById('link-toggle').addEventListener('click', (e) => {
    e.preventDefault();
    modoCadastro = !modoCadastro;
    const campos = document.getElementById('campos-cadastro');
    const btn = document.getElementById('btn-submit-auth');
    const link = document.getElementById('link-toggle');
    const pergunta = document.getElementById('txt-pergunta');

    if(modoCadastro) {
        campos.classList.remove('hidden');
        btn.innerText = "Assinar (Criar Conta)";
        link.innerText = "Já sou membro (Entrar)";
        pergunta.innerText = "Já tem conta?";
    } else {
        campos.classList.add('hidden');
        btn.innerText = "Entrar";
        link.innerText = "Assine agora (Criar conta)";
        pergunta.innerText = "Novo por aqui?";
    }
});

// Submit Form
document.getElementById('form-auth').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email-input').value;
    const senha = document.getElementById('senha-input').value;
    
    try {
        if(modoCadastro) {
            const nome = document.getElementById('nome-input').value;
            const cred = await createUserWithEmailAndPassword(auth, email, senha);
            await updateProfile(cred.user, { displayName: nome });
            await setDoc(doc(db, "usuarios", cred.user.uid), {
                nome: nome, email: email, leituraProgresso: []
            });
            alert("Bem-vindo à família!");
        } else {
            await signInWithEmailAndPassword(auth, email, senha);
        }
        window.fecharModais();
    } catch(erro) {
        alert("Erro: " + erro.message);
    }
});

// Listener Auth
onAuthStateChanged(auth, (user) => {
    usuarioAtual = user;
    const userArea = document.getElementById('user-area');
    
    if(user) {
        const nome = user.displayName || "Membro";
        userArea.innerHTML = `
            <div class="avatar-img">${nome.charAt(0)}</div>
            ${nome.split(' ')[0]}
        `;
        userArea.onclick = () => { if(confirm("Sair?")) signOut(auth); };
        carregarProgresso(user.uid);
    } else {
        userArea.innerHTML = `<i class="fas fa-user-circle"></i> Entrar`;
        userArea.onclick = abrirLogin;
    }
});

// ======================================================
// 5. ÁUDIO & FUNÇÕES GERAIS
// ======================================================

document.getElementById('btn-ouvir-modal').addEventListener('click', async () => {
    const texto = document.getElementById('modal-corpo-texto').innerText;
    const btn = document.getElementById('btn-ouvir-modal');
    
    if(audioPlayer && !audioPlayer.paused) {
        audioPlayer.pause();
        btn.innerHTML = '<i class="fas fa-volume-up"></i> Ouvir Narração';
        return;
    }
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
    
    try {
        const resp = await fetch("https://api.openai.com/v1/audio/speech", {
            method: "POST",
            headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "tts-1", input: texto, voice: "onyx" })
        });
        const blob = await resp.blob();
        audioPlayer = new Audio(URL.createObjectURL(blob));
        audioPlayer.play();
        btn.innerHTML = '<i class="fas fa-pause"></i> Pausar';
        audioPlayer.onended = () => btn.innerHTML = '<i class="fas fa-volume-up"></i> Ouvir Narração';
    } catch(e) {
        console.error(e);
        btn.innerHTML = 'Erro no áudio';
    }
});

// Funções para Orar (Modal Pedido)
document.getElementById('btn-enviar-pedido').addEventListener('click', async () => {
    const txt = document.getElementById('texto-pedido').value;
    if(!txt) return;
    const anonimo = document.getElementById('check-anonimo').checked;
    
    if(!usuarioAtual) { abrirLogin(); return; }

    await addDoc(collection(db, "oracoes"), {
        texto: txt,
        autor: anonimo ? "Anônimo" : usuarioAtual.displayName,
        autorId: usuarioAtual.uid,
        data: new Date(),
        oraram: []
    });
    window.fecharModais();
});

// Helpers Globais
window.abrirLogin = () => document.getElementById('modal-login').classList.remove('hidden');
window.abrirNovoPedido = () => {
    if(!usuarioAtual) { abrirLogin(); return; }
    document.getElementById('modal-pedido').classList.remove('hidden');
};