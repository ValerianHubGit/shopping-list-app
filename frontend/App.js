import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import AuthScreen    from './screens/AuthScreen';
import ListsScreen   from './screens/ListsScreen';
import ShoppingList  from './screens/ShoppingList';

const STORAGE_KEY = 'auth_session';

export default function App() {
  // auth: null | { token, userId, username }
  const [auth, setAuth]           = useState(null);
  // aktive Liste: null | { id, name }
  const [aktiveListe, setAktiveListe] = useState(null);
  const [laedt, setLaedt]         = useState(true);

  // Session beim Start laden
  useEffect(() => {
    (async () => {
      try {
        const gespeichert = await AsyncStorage.getItem(STORAGE_KEY);
        if (gespeichert) setAuth(JSON.parse(gespeichert));
      } catch (_) {}
      finally { setLaedt(false); }
    })();
  }, []);

  const handleLogin = async (session) => {
    setAuth(session);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch (_) {}
  };

  const handleLogout = async () => {
    setAuth(null);
    setAktiveListe(null);
    try { await AsyncStorage.removeItem(STORAGE_KEY); } catch (_) {}
  };

  if (laedt) return null;

  if (!auth) {
    return (
      <>
        <AuthScreen onLogin={handleLogin} />
        <StatusBar style="auto" />
      </>
    );
  }

  if (!aktiveListe) {
    return (
      <>
        <ListsScreen
          auth={auth}
          onListSelect={(liste) => setAktiveListe(liste)}
          onLogout={handleLogout}
        />
        <StatusBar style="auto" />
      </>
    );
  }

  return (
    <>
      <ShoppingList
        listId={aktiveListe.id}
        listName={aktiveListe.name}
        auth={auth}
        onZurueck={() => setAktiveListe(null)}
        onLogout={handleLogout}
      />
      <StatusBar style="auto" />
    </>
  );
}
