const firebaseConfig = {
    apiKey: "AIzaSyA9cxdX1Fl_Xp9jY7cYTBow_85kbeQNDXc",
    authDomain: "darkroomnsi-bd41c.firebaseapp.com",
    projectId: "darkroomnsi-bd41c",
    storageBucket: "darkroomnsi-bd41c.firebasestorage.app",
    messagingSenderId: "550222388264",
    appId: "1:550222388264:web:1f618af1c51cd2d080291d",
    measurementId: "G-VWZKW4KNQ1"
};

// Initialisation Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let currentUsername = null;
let currentUserDocId = null;

// --- FONCTION NOTIFICATION (TOAST) ---
function afficherNotification(message) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.backgroundColor = '#78c1df';
    toast.style.color = 'black';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '5px';
    toast.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    toast.style.zIndex = '10000';
    toast.innerText = message;
    
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// --- GESTION CONNEXION ---
async function tenterConnexion() {
    const idField = document.getElementById('loginId');
    const pwdField = document.getElementById('loginPwd');
    const id = idField.value.trim();
    const mdp = pwdField.value.trim();

    try {
        const query = await db.collection("users").where("id", "==", id).where("Mdp", "==", mdp).get();
        if (!query.empty) {
            currentUsername = id;
            currentUserDocId = query.docs[0].id;
            
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
    } catch (e) { 
        console.error("Erreur de connexion:", e); 
    }
}

document.getElementById('loginBtn').addEventListener('click', tenterConnexion);

[document.getElementById('loginId'), document.getElementById('loginPwd')].forEach(input => {
    input.addEventListener('keydown', (e) => { 
        if (e.key === 'Enter') {
            e.preventDefault();
            tenterConnexion(); 
        }
    });
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (currentUserDocId) await db.collection("users").doc(currentUserDocId).update({ isOnline: false });
    window.location.reload();
});

// --- PRÉSENCE UTILISATEURS ---
function initUsersPresence() {
    const usersList = document.getElementById('usersList');
    db.collection("users").onSnapshot(snap => {
        usersList.innerHTML = "";
        snap.forEach(doc => {
            const user = doc.data();
            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `<div class="status-indicator ${user.isOnline ? 'online' : 'offline'}"></div><span>${user.id}</span>`;
            usersList.appendChild(div);
        });
    });
}

// --- GESTION DU CHAT ---
function initChat() {
    const chatBox = document.getElementById('chatBox');
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const txt = userInput.value.trim();
        if (!txt) return;

        // Commande spéciale pour vider le chat
        if (txt === '/clear') {
            if (confirm("Supprimer l'historique complet ?")) {
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
            let displayName = m.sender;

            if (m.sender === "Ghost") {
                colorClass += " color-ghost";
                displayName = "Lorenzo";
            } else if (m.sender === "Chicky7") {
                colorClass += " color-chicky";
                displayName = "Sabry";
            } else if (m.sender === "Dev") {
                colorClass += " color-dev";
                displayName = "Enzo";
            }
            
            div.className = `message ${colorClass}`;
            const time = m.createdAt ? new Date(m.createdAt.toDate()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '...';
            div.innerHTML = `<div class="message-info"><b>${displayName}</b> <span>${time}</span></div><div class="message-text">${m.text}</div>`;
            chatBox.appendChild(div);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

// --- ÉDITEUR COLLABORATIF ET PDF ---
function initCollaborativeEditor() {
    const codeEditor = document.getElementById('codeEditor');
    const saveBtn = document.getElementById('saveBtn');
    const historyBtn = document.getElementById('historyBtn');
    const historyPanel = document.getElementById('history-panel');
    const fileInput = document.getElementById('fileInput');
    const codeRef = db.collection("workspace").doc("shared_code");

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            codeEditor.value = ev.target.result;
            afficherNotification("Fichier importé avec succès !");
        };
        reader.readAsText(file);
    });

    // Suppression sans confirmation
    async function supprimerSauvegarde(docId, itemElement) {
        try {
            await db.collection("history").doc(docId).delete();
            itemElement.remove();
            afficherNotification("Sauvegarde supprimée !");
        } catch (e) {
            console.error("Erreur suppression:", e);
            afficherNotification("Erreur lors de la suppression.");
        }
    }

    function telechargerPDF(contenu, auteurRaw, dateLabel) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        let auteurReel = auteurRaw;
        if (auteurRaw === "Ghost") auteurReel = "Lorenzo";
        else if (auteurRaw === "Chicky7") auteurReel = "Sabry";
        else if (auteurRaw === "Dev") auteurReel = "Enzo";

        // Fonction pour dessiner le bas de page et forcer la police du code
        const dessinerFooterEtResetPolice = () => {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(150);
            doc.text("Made for Cheat by Enzo.P", pageWidth / 2, pageHeight - 10, { align: "center" });
            doc.setTextColor(0);
            // On remet la police Courier pour le code immédiatement
            doc.setFont("courier", "normal");
            doc.setFontSize(13);
        };

        // Page 1 - Header
        doc.setFont("helvetica", "bold");
        doc.setFontSize(30);
        doc.text("Exportation Fichier Python", pageWidth / 2, 30, { align: "center" });
        doc.setFontSize(25);
        doc.text(dateLabel, pageWidth / 2, 45, { align: "center" });
        doc.setFontSize(20);
        doc.setFont("helvetica", "italic");
        doc.text(`Par : ${auteurReel}`, pageWidth / 2, 58, { align: "center" });
        doc.setLineWidth(1);
        doc.line(20, 65, 190, 65);
        
        dessinerFooterEtResetPolice();

        // Corps du code
        const margin = 20;
        let y = 80;
        const lineHeight = 6; 
        const splitText = doc.splitTextToSize(contenu, 170);

        for (let i = 0; i < splitText.length; i++) {
            if (y > pageHeight - 25) {
                doc.addPage();
                dessinerFooterEtResetPolice();
                y = margin; 
            }
            doc.text(splitText[i], margin, y);
            y += lineHeight;
        }

        const maintenant = new Date();
        const datePropre = maintenant.toLocaleDateString('fr-FR').replace(/\//g, '-');
        const heurePropre = maintenant.getHours() + "h" + maintenant.getMinutes().toString().padStart(2, '0');
        const nomFichier = `Récapitulatif sauvegarde du ${datePropre} à ${heurePropre}.pdf`;

        doc.save(nomFichier);
        afficherNotification("PDF généré !");
    }

    async function chargerHistorique() {
        historyPanel.innerHTML = "<h4>Historique des sauvegardes</h4>";
        const snap = await db.collection("history").orderBy("updatedAt", "desc").limit(10).get();
        if (snap.empty) {
            historyPanel.innerHTML += "<p style='font-size:0.8rem; color:gray; padding:10px;'>Vide.</p>";
            return;
        }
        snap.forEach(doc => {
            const data = doc.data();
            const docId = doc.id;
            const d = data.updatedAt ? data.updatedAt.toDate() : new Date();
            const dateStr = d.toLocaleDateString('fr-FR');
            const heureStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            
            let displayAuteur = data.lastBy;
            if (data.lastBy === "Ghost") displayAuteur = "Lorenzo";
            else if (data.lastBy === "Chicky7") displayAuteur = "Sabry";
            else if (data.lastBy === "Dev") displayAuteur = "Enzo";

            const item = document.createElement('div');
            item.className = "history-item";
            item.innerHTML = `
                <div style="flex:1; cursor:pointer;" class="restore">
                    <strong>${displayAuteur}</strong><br>
                    <small>${dateStr} à ${heureStr}</small>
                </div>
                <div class="history-actions">
                    <button class="btn-pdf" title="PDF">📄</button>
                    <button class="btn-delete" title="Supprimer">🗑️</button>
                </div>
            `;
            item.querySelector('.restore').onclick = () => { 
                if(confirm("Restaurer ce code ?")) {
                    codeEditor.value = data.content;
                    afficherNotification("Code restauré !");
                }
            };
            item.querySelector('.btn-pdf').onclick = (e) => {
                e.stopPropagation();
                telechargerPDF(data.content, data.lastBy, `${dateStr} à ${heureStr}`);
            };
            item.querySelector('.btn-delete').onclick = (e) => {
                e.stopPropagation();
                supprimerSauvegarde(docId, item);
            };
            historyPanel.appendChild(item);
        });
    }

    codeRef.onSnapshot(doc => {
        if (doc.exists && document.activeElement !== codeEditor) {
            codeEditor.value = doc.data().content;
            let lastAuteur = doc.data().lastBy;
            if (lastAuteur === "Ghost") lastAuteur = "Lorenzo";
            else if (lastAuteur === "Chicky7") lastAuteur = "Sabry";
            else if (lastAuteur === "Dev") lastAuteur = "Enzo";
            document.getElementById('last-editor').innerText = "Modifié par : " + lastAuteur;
        }
    });

    saveBtn.addEventListener('click', async () => {
        const payload = { content: codeEditor.value, lastBy: currentUsername, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        await codeRef.set(payload);
        await db.collection("history").add(payload);
        saveBtn.innerText = "✅";
        afficherNotification("Sauvegarde réussie !");
        setTimeout(() => saveBtn.innerText = "Confirmer", 2000);
    });

    historyBtn.addEventListener('click', () => {
        const isVisible = historyPanel.style.display === 'block';
        historyPanel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) chargerHistorique();
    });
}
