import { db, auth } from './firebase-config.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, query, orderBy, onSnapshot, updateDoc, doc, arrayUnion, arrayRemove, setDoc, getDoc, where, deleteDoc } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ======================================================
// CONFIGURAÇÃO DO ADMINISTRADOR (ROOT)
// ======================================================
// Coloque seu email aqui dentro das aspas. Ex: "marcelo@gmail.com"
const EMAIL_ADMIN = "msmadureira@gmail.com"; // Substitua pelo seu email real se for diferente!

let usuarioAtual = null;
let modoCadastro = false;
let diaAtualLeitura = null;

// ======================================================
// 1. UTILITÁRIOS
// ======================================================
function notificar(msg, tipo = 'success') {
    const box = document.getElementById('toast-box');
    const txt = document.getElementById('toast-msg');
    const icon = document.getElementById('toast-icon');
    
    if(box && txt) {
        box.className = `toast show ${tipo}`;
        txt.innerText = msg;
        icon.innerHTML = tipo === 'success' ? '<i class="fas fa-check-circle" style="color:#46d369"></i>' : '<i class="fas fa-exclamation-circle" style="color:#a83232"></i>';
        setTimeout(() => box.classList.remove('show'), 3000);
    } else {
        alert(msg);
    }
}

// ======================================================
// 2. AUTENTICAÇÃO E PERFIL
// ======================================================
document.getElementById('link-toggle').addEventListener('click', (e) => {
    e.preventDefault();
    modoCadastro = !modoCadastro;
    const btn = document.getElementById('btn-submit-auth');
    const pergunta = document.getElementById('txt-pergunta');
    
    if(modoCadastro) {
        document.getElementById('campos-cadastro').classList.remove('hidden');
        btn.innerText = "Criar Conta";
        document.getElementById('link-toggle').innerText = "Fazer Login";
        pergunta.innerText = "Já tem conta?";
    } else {
        document.getElementById('campos-cadastro').classList.add('hidden');
        btn.innerText = "Entrar";
        document.getElementById('link-toggle').innerText = "Criar conta agora";
        pergunta.innerText = "Novo por aqui?";
    }
});

document.getElementById('form-auth').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email-input').value;
    const senha = document.getElementById('senha-input').value;
    
    try {
        if(modoCadastro) {
            const nome = document.getElementById('nome-input').value;
            if(nome.length < 2) throw new Error("Nome muito curto.");
            const cred = await createUserWithEmailAndPassword(auth, email, senha);
            await updateProfile(cred.user, { displayName: nome });
            await setDoc(doc(db, "usuarios", cred.user.uid), { nome: nome, email: email, progresso: [] });
            notificar(`Bem-vindo, ${nome}!`);
        } else {
            await signInWithEmailAndPassword(auth, email, senha);
            notificar("Login realizado!");
        }
        window.fecharModais();
        document.getElementById('form-auth').reset();
    } catch (erro) {
        console.error(erro);
        let msg = erro.message;
        if(msg.includes("email-already-in-use")) msg = "E-mail já cadastrado.";
        if(msg.includes("wrong-password")) msg = "Senha incorreta.";
        notificar(msg, "error");
    }
});

onAuthStateChanged(auth, (user) => {
    usuarioAtual = user;
    const areaUser = document.getElementById('user-area');
    
    if(user) {
        const nome = user.displayName || "Irmão";
        areaUser.innerHTML = `<div class="avatar-img">${nome[0].toUpperCase()}</div> ${nome.split(' ')[0]}`;
        areaUser.onclick = window.abrirPerfil; 
        carregarProgresso(user.uid);
    } else {
        areaUser.innerHTML = `<i class="fas fa-user-circle"></i> Entrar`;
        areaUser.onclick = window.abrirLogin;
    }
});

window.abrirPerfil = () => {
    if(!usuarioAtual) return;
    document.getElementById('edit-nome').value = usuarioAtual.displayName;
    document.getElementById('edit-email').value = usuarioAtual.email;
    const letra = (usuarioAtual.displayName || "U")[0].toUpperCase();
    document.getElementById('perfil-avatar-grande').innerText = letra;
    document.getElementById('modal-perfil').classList.remove('hidden');
}

window.salvarPerfil = async () => {
    const novoNome = document.getElementById('edit-nome').value;
    if(novoNome.length < 2) { notificar("Nome muito curto.", "error"); return; }
    try {
        await updateProfile(usuarioAtual, { displayName: novoNome });
        const userRef = doc(db, "usuarios", usuarioAtual.uid);
        await updateDoc(userRef, { nome: novoNome });
        document.getElementById('user-area').innerHTML = `<div class="avatar-img">${novoNome[0].toUpperCase()}</div> ${novoNome.split(' ')[0]}`;
        notificar("Perfil atualizado!");
        window.fecharModais();
    } catch (e) { console.error(e); notificar("Erro ao salvar.", "error"); }
}

window.sairDaConta = async () => {
    if(confirm("Deseja mesmo sair?")) {
        await signOut(auth);
        window.fecharModais();
        notificar("Você saiu da conta.");
    }
}

// ======================================================
// 3. CRONOGRAMA & LEITURA & COMENTÁRIOS (COM ADMIN)
// ======================================================
async function carregarCronograma() {
    const container = document.getElementById('carousel-leitura');
    try {
        const resp = await fetch('cronograma.json');
        const dados = await resp.json();
        container.innerHTML = "";
        dados.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card-leitura';
            card.dataset.dia = item.dia;
            card.innerHTML = `
                <div class="card-bg" style="background-image: url('${item.img}')"></div>
                <div class="card-info"><h4>${item.ref}</h4><p>${item.titulo}</p></div>
            `;
            card.addEventListener('click', () => abrirLeitura(item));
            container.appendChild(card);
        });
    } catch (e) { console.log("Erro cronograma:", e); }
}
carregarCronograma();

// VARIÁVEL GLOBAL PARA CACHE (Adicione isso no topo do app.js junto com as outras variáveis let, se quiser, ou deixe dentro da função como fiz abaixo para simplificar)
let cacheDevocionais = null;

window.abrirLeitura = async (item) => {
    // 1. Configura o item básico
    if(typeof item === 'number') item = { dia: item, ref: "Leitura do Dia", titulo: "Devocional" };
    diaAtualLeitura = item.dia;
    
    // 2. Abre o modal imediatamente
    document.getElementById('modal-titulo-texto').innerText = `${item.ref} - ${item.titulo}`;
    document.getElementById('modal-leitura').classList.remove('hidden');
    
    // 3. Tenta carregar o conteúdo rico do JSON
    const areaTexto = document.getElementById('modal-corpo-texto');
    areaTexto.innerHTML = "<p style='text-align:center; padding:20px'>Carregando devocional...</p>";

    try {
        // Se ainda não baixamos o arquivo JSON, baixa agora
        if(!cacheDevocionais) {
            const resp = await fetch('devocionais.json');
            cacheDevocionais = await resp.json();
        }

        // Procura o devocional do dia clicado
        const devocional = cacheDevocionais.find(d => d.dia == item.dia);

        if(devocional && devocional.texto) {
            // INJETA O TEXTO RICO (COM HTML)
            areaTexto.innerHTML = devocional.texto;
        } else {
            // Fallback se não achar o dia específico
            areaTexto.innerHTML = `
                <p style="text-align: center; color: #888; margin-top: 20px;">
                    Use sua Bíblia física para acompanhar a leitura de <strong>${item.ref}</strong>.
                </p>
                <hr style="border-color: #333; margin: 20px 0;">
                <p>O texto devocional para este dia estará disponível em breve.</p>
            `;
        }
    } catch (e) {
        console.error("Erro ao carregar devocional:", e);
        areaTexto.innerHTML = "<p>Erro ao carregar o texto. Verifique sua conexão.</p>";
    }

    // 4. Carrega os comentários da comunidade (Função que já existia)
    carregarComentarios(item.dia);
}

let unsubscribeComentarios = null;

function carregarComentarios(dia) {
    const lista = document.getElementById('lista-comentarios');
    lista.innerHTML = "<small style='color:#666; text-align:center; padding:10px'>Carregando...</small>";
    if(unsubscribeComentarios) unsubscribeComentarios();
    
    const q = query(collection(db, "comentarios"), where("dia", "==", dia), orderBy("data", "asc"));
    
    unsubscribeComentarios = onSnapshot(q, (snapshot) => {
        lista.innerHTML = "";
        if(snapshot.empty) {
            lista.innerHTML = "<small style='color:#666; text-align:center; padding:10px'>Seja o primeiro a comentar!</small>";
            return;
        }
        
        snapshot.forEach(doc => {
            const c = doc.data();
            const id = doc.id;
            
            // Lógica de Permissão
            const souDono = usuarioAtual && c.uid === usuarioAtual.uid;
            const souAdmin = usuarioAtual && usuarioAtual.email === EMAIL_ADMIN;
            
            let botoesHtml = "";
            if (souDono || souAdmin) {
                botoesHtml = `
                <div class="comment-actions">
                    <button onclick="window.editarComentario('${id}', '${c.texto.replace(/'/g, "\\'")}')" class="btn-action btn-edit"><i class="fas fa-pencil-alt"></i></button>
                    <button onclick="window.deletarItem('comentarios', '${id}')" class="btn-action btn-delete"><i class="fas fa-trash"></i></button>
                </div>`;
            }

            const div = document.createElement('div');
            div.className = 'comment-bubble';
            div.innerHTML = `
                <span class="comment-author">${c.autor}</span> 
                ${c.texto}
                ${botoesHtml}
            `;
            lista.appendChild(div);
        });
        lista.scrollTop = lista.scrollHeight;
    }, (error) => {
        if(error.message.includes("requires an index")) console.log("CLIQUE NO LINK NO CONSOLE!");
    });
}

window.enviarComentario = async () => {
    if(!usuarioAtual) { notificar("Faça login para comentar.", "error"); window.abrirLogin(); return; }
    const input = document.getElementById('input-comentario');
    const texto = input.value.trim();
    if(!texto) return;
    try {
        await addDoc(collection(db, "comentarios"), {
            dia: diaAtualLeitura, texto: texto, autor: usuarioAtual.displayName, uid: usuarioAtual.uid, data: new Date()
        });
        input.value = "";
    } catch (e) { console.error(e); notificar("Erro ao enviar.", "error"); }
};

// ======================================================
// 4. MURAL DE ORAÇÃO (FEED) COM ADMIN
// ======================================================
const qOracoes = query(collection(db, "oracoes"), orderBy("data", "desc"));

onSnapshot(qOracoes, (snapshot) => {
    const feed = document.getElementById('feed-oracao');
    feed.innerHTML = "";
    
    if(snapshot.empty) {
        feed.innerHTML = "<div class='card-empty' style='padding:20px; text-align:center; color:#666'>Nenhum pedido ainda.</div>";
        return;
    }

    snapshot.forEach(docSnap => {
        const d = docSnap.data();
        const id = docSnap.id;
        const oraram = d.oraram || [];
        const total = oraram.length;
        const euOrei = usuarioAtual && oraram.includes(usuarioAtual.uid);
        
        // Lógica de Permissão
        const souDono = usuarioAtual && d.autorId === usuarioAtual.uid;
        const souAdmin = usuarioAtual && usuarioAtual.email === EMAIL_ADMIN;

        let botoesAdmin = "";
        if(souDono || souAdmin) {
            botoesAdmin = `
                <div class="actions-row">
                    <button onclick="window.editarOracao('${id}', '${d.texto.replace(/'/g, "\\'")}')" class="btn-action btn-edit"><i class="fas fa-pencil-alt"></i></button>
                    <button onclick="window.deletarItem('oracoes', '${id}')" class="btn-action btn-delete"><i class="fas fa-trash"></i></button>
                </div>
            `;
        }

        const card = document.createElement('div');
        card.className = 'feed-card';
        card.innerHTML = `
            <div class="feed-header">
                <strong>${d.autor}</strong>
                <small>${d.data ? new Date(d.data.seconds * 1000).toLocaleDateString() : 'Hoje'}</small>
            </div>
            <div class="feed-body">"${d.texto}"</div>
            <div class="feed-actions">
                <button class="btn-pray ${euOrei ? 'active' : ''}" onclick="window.orarPor('${id}')">
                    🙏 ${euOrei ? 'Orei' : 'Orar'} (${total})
                </button>
                ${botoesAdmin}
            </div>
        `;
        feed.appendChild(card);
    });
});

document.getElementById('btn-enviar-pedido').addEventListener('click', async () => {
    const txt = document.getElementById('texto-pedido').value;
    const anonimo = document.getElementById('check-anonimo').checked;
    if(!txt) return;
    if(!usuarioAtual) { window.abrirLogin(); return; }
    await addDoc(collection(db, "oracoes"), {
        texto: txt, autor: anonimo ? "Anônimo" : usuarioAtual.displayName, autorId: usuarioAtual.uid, data: new Date(), oraram: []
    });
    window.fecharModais();
    notificar("Pedido publicado!");
    document.getElementById('texto-pedido').value = "";
});

window.orarPor = async (id) => {
    if(!usuarioAtual) { notificar("Entre para orar.", "error"); window.abrirLogin(); return; }
    const docRef = doc(db, "oracoes", id);
    const docSnap = await getDoc(docRef);
    if(docSnap.exists()) {
        const dados = docSnap.data();
        const jaOrei = dados.oraram && dados.oraram.includes(usuarioAtual.uid);
        if(jaOrei) await updateDoc(docRef, { oraram: arrayRemove(usuarioAtual.uid) });
        else { await updateDoc(docRef, { oraram: arrayUnion(usuarioAtual.uid) }); notificar("Deus ouviu sua oração!"); }
    }
};

// ======================================================
// 5. FUNÇÕES DE EDIÇÃO E DELEÇÃO (GLOBAL)
// ======================================================

// Função genérica para deletar (serve para oração e comentário)
window.deletarItem = async (colecao, id) => {
    if(confirm("Tem certeza que deseja apagar este item?")) {
        try {
            await deleteDoc(doc(db, colecao, id));
            notificar("Item apagado.", "success");
        } catch(e) {
            console.error(e);
            notificar("Erro ao apagar.", "error");
        }
    }
}

// Editar Comentário
window.editarComentario = async (id, textoAtual) => {
    const novoTexto = prompt("Edite seu comentário:", textoAtual);
    if(novoTexto !== null && novoTexto.trim() !== "") {
        try {
            await updateDoc(doc(db, "comentarios", id), { texto: novoTexto });
            notificar("Comentário atualizado!");
        } catch(e) {
            notificar("Erro ao editar.", "error");
        }
    }
}

// Editar Oração
window.editarOracao = async (id, textoAtual) => {
    const novoTexto = prompt("Edite seu pedido de oração:", textoAtual);
    if(novoTexto !== null && novoTexto.trim() !== "") {
        try {
            await updateDoc(doc(db, "oracoes", id), { texto: novoTexto });
            notificar("Pedido atualizado!");
        } catch(e) {
            notificar("Erro ao editar.", "error");
        }
    }
}

async function carregarProgresso(uid) {
    const snap = await getDoc(doc(db, "usuarios", uid));
    if(snap.exists()) {
        const lidos = snap.data().progresso || [];
        lidos.forEach(dia => {
            const el = document.querySelector(`.card-leitura[data-dia="${dia}"]`);
            if(el) el.classList.add('lido');
        });
    }
}