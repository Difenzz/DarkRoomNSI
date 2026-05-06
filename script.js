const firebaseConfig = {
    apiKey: "AIzaSyA9cxdX1Fl_Xp9jY7cYTBow_85kbeQNDXc",
    authDomain: "darkroomnsi-bd41c.firebaseapp.com",
    projectId: "darkroomnsi-bd41c",
    storageBucket: "darkroomnsi-bd41c.firebasestorage.app",
    messagingSenderId: "550222388264",
    appId: "1:550222388264:web:1f618af1c51cd2d080291d",
    measurementId: "G-VWZKW4KNQ1"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentUsername = null;
let currentUserDocId = null;

// --- AUTHENTIFICATION ---
async function tenterConnexion() {
    const id = document.getElementById('loginId').value.trim();
    const mdp = document.getElementById('loginPwd').value.trim();

    try {
        const query = await db.collection("users").where("id", "==", id).where("Mdp", "==", mdp).get();
        if (!query.empty) {
            currentUsername = id;
            currentUserDocId = query.docs[0].id;

            // Passage en ligne[cite: 2]
            await db.collection("users").doc(currentUserDocId).update({ isOnline: true });

            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app-content').style.display = 'flex';
            document.getElementById('user-display').innerText = "Utilisateur : " + id;
            
            initChat();
            initCollaborativeEditor();
            initUsersPresence();
        } else {
            document.getElementById('loginError').style.display = 'block';
        }
    } catch (e) { console.error("Erreur de connexion:", e); }
}

document.getElementById('loginBtn').addEventListener('click', tenterConnexion);
[document.getElementById('loginId'), document.getElementById('loginPwd')].forEach(input => {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tenterConnexion(); });
});

// Déconnexion manuelle
document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (currentUserDocId) {
        await db.collection("users").doc(currentUserDocId).update({ isOnline: false });
    }
    window.location.reload();
});

// Détection fermeture d'onglet pour le statut "Hors-ligne"
window.addEventListener('beforeunload', () => {
    if (currentUserDocId) {
        db.collection("users").doc(currentUserDocId).update({ isOnline: false });
    }
});

// --- PRÉSENCE ---
function initUsersPresence() {
    const usersList = document.getElementById('usersList');
    db.collection("users").onSnapshot(snap => {
        usersList.innerHTML = "";
        snap.forEach(doc => {
            const user = doc.data();
            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `
                <div class="status-indicator ${user.isOnline ? 'online' : 'offline'}"></div>
                <span>${user.id}</span>
            `;
            usersList.appendChild(div);
        });
    });
}

// --- CHAT + COMMANDE /CLEAR GLOBAL ---
function initChat() {
    const chatBox = document.getElementById('chatBox');
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const txt = userInput.value.trim();
        if (!txt) return;

        // Commande /clear : Messages + Historique Code[cite: 2]
        if (txt === '/clear') {
            if (confirm("Supprimer définitivement TOUS les messages et l'historique du code ?")) {
                const batch = db.batch();
                
                const msgSnap = await db.collection("messages").get();
                msgSnap.docs.forEach(doc => batch.delete(doc.ref));

                const histSnap = await db.collection("history").get();
                histSnap.docs.forEach(doc => batch.delete(doc.ref));

                await batch.commit();
            }
            userInput.value = "";
            return;
        }

        await db.collection("messages").add({
            text: txt,
            sender: currentUsername,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        userInput.value = "";
    });

    db.collection("messages").orderBy("createdAt", "asc").onSnapshot(snap => {
        chatBox.innerHTML = "";
        snap.forEach(doc => {
            const m = doc.data();
            const div = document.createElement('div');
            let colorClass = m.sender === currentUsername ? 'sent' : 'received';
            if (m.sender === "Ghost") colorClass += " color-ghost";
            else if (m.sender === "Chicky7") colorClass += " color-chicky";
            else if (m.sender === "Dev") colorClass += " color-dev";

            div.className = `message ${colorClass}`;
            const time = m.createdAt ? new Date(m.createdAt.toDate()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '...';
            
            div.innerHTML = `
                <div class="message-info">
                    <span class="user-name">${m.sender}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-text">${m.text}</div>
            `;
            chatBox.appendChild(div);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

// --- ÉDITEUR COLLABORATIF ---
function initCollaborativeEditor() {
    const codeEditor = document.getElementById('codeEditor');
    const lastEditorLabel = document.getElementById('last-editor');
    const saveBtn = document.getElementById('saveBtn');
    const historyBtn = document.getElementById('historyBtn');
    const codeRef = db.collection("workspace").doc("shared_code");
    const historyPanel = document.getElementById('history-panel');

    codeRef.onSnapshot(doc => {
        if (doc.exists && document.activeElement !== codeEditor) {
            const data = doc.data();
            codeEditor.value = data.content;
            lastEditorLabel.innerText = "Dernière modification par : " + data.lastBy;
        }
    });

    saveBtn.addEventListener('click', async () => {
        const content = codeEditor.value;
        const payload = { 
            content, 
            lastBy: currentUsername, 
            updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
        };
        await codeRef.set(payload);
        await db.collection("history").add(payload);
        saveBtn.innerText = "✅";
        setTimeout(() => saveBtn.innerText = "Confirmer", 2000);
    });

    historyBtn.addEventListener('click', async () => {
        const isVisible = historyPanel.style.display === 'block';
        historyPanel.style.display = isVisible ? 'none' : 'block';
        
        if (!isVisible) {
            historyPanel.innerHTML = "<h4>Dernières sauvegardes</h4>";
            const snap = await db.collection("history").orderBy("updatedAt", "desc").limit(10).get();
            if (snap.empty) {
                historyPanel.innerHTML += "<p style='padding:15px; font-size:0.8rem; color:gray;'>Aucun historique.</p>";
            }
            snap.forEach(doc => {
                const data = doc.data();
                const item = document.createElement('div');
                item.className = "history-item";
                item.innerHTML = `<strong>${data.lastBy}</strong> <span>${data.updatedAt ? new Date(data.updatedAt.toDate()).toLocaleTimeString() : '...'}</span>`;
                item.onclick = () => { if(confirm("Restaurer cette version ?")) codeEditor.value = data.content; };
                historyPanel.appendChild(item);
            });
        }
    });

    document.getElementById('fileInput').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => { codeEditor.value = e.target.result; };
        reader.readAsText(file);
    });
}