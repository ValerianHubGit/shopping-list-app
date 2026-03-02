import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput,Button, FlatList} from 'react-native';
import { useState } from 'react'

export default function App() {
  const [artikel, setArtikel] = useState(""); 
  const [liste, setListe] = useState([]);
  
  const artikelHinzufuegen = async () => {
  if (artikel.trim() === "") return;

  try {
    // Schritt 1: Produkt im Backend anlegen
    const response = await fetch("http://127.0.0.1:8000/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: artikel })
    });
    const neuesProdukt = await response.json();

    // Schritt 2: Lokal zur Liste hinzufügen
    setListe([...liste, neuesProdukt.name]);
    setArtikel("");

  } catch (fehler) {
    console.error("Fehler beim Hinzufügen:", fehler);
  }
};

  return (
    <View style={styles.container}>
    <Text style={styles.title}>🛒 Meine Einkaufsliste</Text>
    <TextInput style={styles.normaltext} placeholder="Bitte Artikel eingeben" value={artikel} onChangeText={setArtikel}/>
    <StatusBar style="auto" />
    <Button title="Hinzufügen" onPress={artikelHinzufuegen}/>
    {/* Einkaufsliste: rendert jeden Artikel als Texteintrag */}
    <FlatList data={liste}
      keyExtractor={(item, index) => index.toString()}
      renderItem={ ({ item }) => (<Text>{item}</Text>) }
    />
    </View>
  );
}






const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  normaltext:{fontSize:16}
});