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
    } catch (e) { console.error("Erreur de connexion:", e); }
}

document.getElementById('loginBtn').addEventListener('click', tenterConnexion);
[document.getElementById('loginId'), document.getElementById('loginPwd')].forEach(input => {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tenterConnexion(); });
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (currentUserDocId) await db.collection("users").doc(currentUserDocId).update({ isOnline: false });
    window.location.reload();
});

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

function initChat() {
    const chatBox = document.getElementById('chatBox');
    const chatForm = document.getElementById('chatForm');
    const userInput = document.getElementById('userInput');
    const codeRef = db.collection("workspace").doc("shared_code");

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const txt = userInput.value.trim();
        if (!txt) return;

        if (txt.toLowerCase() === '/clear') {
            if (confirm("Voulez-vous TOUT supprimer (Chat + Code) ?")) {
                await codeRef.set({
                    content: "",
                    lastBy: currentUsername,
                    saveName: "Nettoyage global",
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                const messagesSnap = await db.collection("messages").get();
                const batch = db.batch();
                messagesSnap.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                afficherNotification("Tout a été nettoyé !");
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
            if (m.sender === "Ghost") { colorClass += " color-ghost"; displayName = "Lorenzo"; }
            else if (m.sender === "Chicky7") { colorClass += " color-chicky"; displayName = "Sabry"; }
            else if (m.sender === "Dev") { colorClass += " color-dev"; displayName = "Enzo"; }
            
            div.className = `message ${colorClass}`;
            const time = m.createdAt ? new Date(m.createdAt.toDate()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '...';
            div.innerHTML = `<div class="message-info"><b>${displayName}</b> <span>${time}</span></div><div class="message-text">${m.text}</div>`;
            chatBox.appendChild(div);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

function initCollaborativeEditor() {
    const codeEditor = document.getElementById('codeEditor');
    const saveBtn = document.getElementById('saveBtn');
    const saveNameInput = document.getElementById('saveName');
    const historyBtn = document.getElementById('historyBtn');
    const historyPanel = document.getElementById('history-panel');
    const fileInput = document.getElementById('fileInput');
    const codeRef = db.collection("workspace").doc("shared_code");

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Récupère le nom du fichier et enlève l'extension .py
        const fileName = file.name.replace('.py', '');
        saveNameInput.value = fileName;

        const reader = new FileReader();
        reader.onload = async (ev) => { 
            const contenuImporte = ev.target.result;
            codeEditor.value = contenuImporte;
            await codeRef.set({
                content: contenuImporte,
                lastBy: currentUsername,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            afficherNotification(`Fichier "${fileName}" importé !`);
        };
        reader.readAsText(file);
    });

    async function supprimerSauvegarde(docId, itemElement) {
        await db.collection("history").doc(docId).delete();
        itemElement.remove();
        afficherNotification("Sauvegarde supprimée !");
    }

    function telechargerPDF(contenu, auteurRaw, dateLabel, nomVersion) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        let auteurReel = auteurRaw;
        if (auteurRaw === "Ghost") auteurReel = "Lorenzo";
        else if (auteurRaw === "Chicky7") auteurReel = "Sabry";
        else if (auteurRaw === "Dev") auteurReel = "Enzo";

        const dessinerFooterEtResetPolice = () => {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(150);
            doc.text("Made for Cheat by Enzo.P", pageWidth / 2, pageHeight - 10, { align: "center" });
            doc.setTextColor(0);
            doc.setFont("courier", "normal");
            doc.setFontSize(10); 
        };

        doc.setFont("helvetica", "bold");
        doc.setFontSize(26);
        doc.text("Exportation Fichier Python", pageWidth / 2, 25, { align: "center" });
        
        doc.setFontSize(18);
        doc.setTextColor(59, 130, 246);
        doc.text(`Version : ${nomVersion || 'Sans nom'}`, pageWidth / 2, 35, { align: "center" });

        doc.setTextColor(0);
        doc.setFontSize(14);
        doc.text(`${dateLabel} | Par : ${auteurReel}`, pageWidth / 2, 48, { align: "center" });
        doc.setLineWidth(1);
        doc.line(20, 55, 190, 55);
        
        dessinerFooterEtResetPolice();

        const margin = 20;
        let y = 70;
        const lineHeight = 5; 
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

        doc.save(`Save_${nomVersion || 'brute'}_${dateLabel.replace(/ /g, '_')}.pdf`);
    }

    async function chargerHistorique() {
        historyPanel.innerHTML = "<h4>Historique des sauvegardes</h4>";
        const snap = await db.collection("history").orderBy("updatedAt", "desc").limit(10).get();
        snap.forEach(doc => {
            const data = doc.data();
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
                    <strong style="color:var(--accent-blue)">${data.saveName || 'Sans titre'}</strong><br>
                    <small>${displayAuteur} - ${dateStr} à ${heureStr}</small>
                </div>
                <div class="history-actions">
                    <button class="btn-pdf" title="PDF">📄</button>
                    <button class="btn-delete" title="Supprimer">🗑️</button>
                </div>
            `;
            item.querySelector('.restore').onclick = () => { 
                if(confirm("Restaurer ce code ?")) {
                    codeEditor.value = data.content;
                    codeRef.set({
                        content: data.content,
                        lastBy: currentUsername,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            };
            item.querySelector('.btn-pdf').onclick = (e) => {
                e.stopPropagation();
                telechargerPDF(data.content, data.lastBy, `${dateStr} à ${heureStr}`, data.saveName);
            };
            item.querySelector('.btn-delete').onclick = (e) => {
                e.stopPropagation();
                supprimerSauvegarde(doc.id, item);
            };
            historyPanel.appendChild(item);
        });
    }

    codeEditor.addEventListener('input', () => {
        codeRef.set({
            content: codeEditor.value,
            lastBy: currentUsername,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    });

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
        const customName = saveNameInput.value.trim() || "Sans Titre";
        const payload = { 
            content: codeEditor.value, 
            lastBy: currentUsername, 
            saveName: customName,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
        };
        await db.collection("history").add(payload);
        saveNameInput.value = "";
        saveBtn.innerText = "✅";
        afficherNotification("Sauvegarde : " + customName);
        setTimeout(() => saveBtn.innerText = "Confirmer", 2000);
    });

    historyBtn.addEventListener('click', () => {
        const isVisible = historyPanel.style.display === 'block';
        historyPanel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) chargerHistorique();
    });
}
