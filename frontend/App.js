import { StatusBar } from 'expo-status-bar';
import ShoppingList from './screens/ShoppingList';

export default function App() {
  return (
    <>
      <ShoppingList />
      <StatusBar style="auto" />
    </>
  );
}