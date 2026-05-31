let fbApp, fbFirestore, fbStorage, fbAuth;

function initFirebase() {
  if (fbApp) return;
  const config = {
    apiKey: env('FIREBASE_API_KEY'),
    authDomain: env('FIREBASE_AUTH_DOMAIN'),
    projectId: env('FIREBASE_PROJECT_ID'),
    storageBucket: env('FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: env('FIREBASE_MESSAGING_SENDER_ID'),
    appId: env('FIREBASE_APP_ID'),
    measurementId: env('FIREBASE_MEASUREMENT_ID')
  };
  if (!config.apiKey || !config.projectId) { console.warn('Firebase config missing in .env'); return; }
  fbApp = firebase.initializeApp(config, 'roadsos');
  fbFirestore = firebase.firestore(fbApp);
  fbStorage = firebase.storage(fbApp);
  fbAuth = firebase.auth(fbApp);
  fbFirestore.settings({ merge: true });
}

async function signInAnonymously() {
  initFirebase();
  if (!fbAuth) return null;
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
  if (!fbFirestore) return null;
  try {
    const user = fbAuth?.currentUser || await signInAnonymously();
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
  if (!fbStorage) return null;
  try {
    const user = fbAuth?.currentUser || await signInAnonymously();
    const path = `accident_photos/${user?.uid || 'anon'}/${Date.now()}_${file.name}`;
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
  if (!fbFirestore) return false;
  try {
    const user = fbAuth?.currentUser || await signInAnonymously();
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
