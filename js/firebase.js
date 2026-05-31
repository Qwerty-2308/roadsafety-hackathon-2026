const firebaseConfig = {
  apiKey: "AIzaSyBzdIW5GriL9MHfI_aF3dH8_vcyRg7xPCk",
  authDomain: "spendly-505e3.firebaseapp.com",
  projectId: "spendly-505e3",
  storageBucket: "spendly-505e3.firebasestorage.app",
  messagingSenderId: "608274656251",
  appId: "1:608274656251:web:834e33dd412e5a8f64395e",
  measurementId: "G-PZ7GMK3XDM"
};

let fbApp, fbFirestore, fbStorage, fbAuth;

function initFirebase() {
  if (fbApp) return;
  fbApp = firebase.initializeApp(firebaseConfig, 'roadsos');
  fbFirestore = firebase.firestore(fbApp);
  fbStorage = firebase.storage(fbApp);
  fbAuth = firebase.auth(fbApp);
  fbFirestore.settings({ merge: true });
}

async function signInAnonymously() {
  initFirebase();
  try {
    await fbAuth.signInAnonymously();
    return fbAuth.currentUser;
  } catch (e) {
    console.warn('Firebase auth failed:', e);
    return null;
  }
}

async function saveReport(data) {
  initFirebase();
  try {
    const user = fbAuth.currentUser || await signInAnonymously();
    const report = {
      ...data,
      userId: user?.uid || 'anonymous',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: new Date().toISOString()
    };
    const docRef = await fbFirestore.collection('accident_reports').add(report);
    return docRef.id;
  } catch (e) {
    console.warn('Firebase save failed:', e);
    return null;
  }
}

async function uploadPhoto(file) {
  initFirebase();
  try {
    const user = fbAuth.currentUser || await signInAnonymously();
    const path = `accident_photos/${user.uid}/${Date.now()}_${file.name}`;
    const ref = fbStorage.ref(path);
    const snapshot = await ref.put(file);
    return await snapshot.ref.getDownloadURL();
  } catch (e) {
    console.warn('Photo upload failed:', e);
    return null;
  }
}

async function syncSavedContacts(contactIds) {
  initFirebase();
  try {
    const user = fbAuth.currentUser || await signInAnonymously();
    await fbFirestore.collection('user_data').doc(user.uid).set({
      savedContacts: contactIds,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  } catch (e) {
    console.warn('Firebase sync failed:', e);
    return false;
  }
}
