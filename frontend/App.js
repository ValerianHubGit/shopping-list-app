import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput,Button, FlatList} from 'react-native';
import { useState } from 'react'

export default function App() {
  const [artikel, setArtikel] = useState(""); 
  const [liste, setListe] = useState([]);
  const artikelHinzufuegen = () => {
    if (artikel.trim() === "") return;
    setListe([...liste, artikel]);
    setArtikel("");
  }

  return (
    <View style={styles.container}>
    <Text style={styles.title}>🛒 Meine Einkaufsliste</Text>
    <TextInput style={styles.normaltext} placeholder="Bitte Artikel eingeben" value={artikel} onChangeText={setArtikel}/>
    <StatusBar style="auto" />
    <Button title="Hinzufügen" onPress={artikelHinzufuegen}/>
    {/* Einkaufsliste: rendert jeden Artikel als Texteintrag */}
    <FlatList data={liste}                                {/*  das Array das durchlaufen wird */}
      keyExtractor={(item, index) => index.toString()}    {/*  eindeutiger Schlüssel pro Eintrag */}
      renderItem={ ({ item }) => (<Text>{item}</Text>) }  {/*was für jeden Eintrag angezeigt wird */}
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