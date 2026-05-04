import { create } from 'zustand';
import { db } from '../firebase';
import { ref, set as firebaseSet, onValue, push, update as firebaseUpdate, runTransaction } from 'firebase/database';

interface MultiplayerStore {
  roomId: string | null;
  myPlayerIndex: number | null;
  isHost: boolean;
  playersCount: number;
  
  createRoom: () => Promise<string>;
  joinRoom: (id: string) => Promise<{ success: boolean; message?: string }>;
  syncState: (state: any) => Promise<void>;
}

export const useMultiplayerStore = create<MultiplayerStore>((set, get) => ({
  roomId: null,
  myPlayerIndex: null,
  isHost: false,
  playersCount: 0,

  createRoom: async () => {
    // Генерируем простой 6-значный код
    const id = Math.floor(100000 + Math.random() * 900000).toString();
    const roomRef = ref(db, `rooms/${id}`);
    
    const initialData = {
      players: { 0: true }, 
      playersCount: 1,
      state: null 
    };

    await firebaseSet(roomRef, initialData);
    
    set({ roomId: id, myPlayerIndex: 0, isHost: true, playersCount: 1 });
    return id;
  },

  joinRoom: async (id: string) => {
    const roomRef = ref(db, `rooms/${id}/players`);
    
    try {
      const result = await runTransaction(roomRef, (currentPlayers) => {
        if (!currentPlayers) return { 0: true };
        const count = Object.keys(currentPlayers).length;
        if (count >= 4) return undefined;
        
        for (let i = 0; i < 4; i++) {
          if (!currentPlayers[i]) {
            currentPlayers[i] = true;
            return currentPlayers;
          }
        }
        return currentPlayers;
      });

      if (!result.committed || !result.snapshot.exists()) {
        return { success: false, message: "Комната полна или не существует" };
      }

      const players = result.snapshot.val();
      const myIndex = Object.keys(players).length - 1;

      set({ roomId: id, myPlayerIndex: myIndex, isHost: false, playersCount: Object.keys(players).length });
      return { success: true };
    } catch (e) {
      console.error("Join error:", e);
      return { success: false, message: "Ошибка подключения" };
    }
  },

  syncState: async (gameState: any) => {
    const { roomId, isHost } = get();
    if (!roomId || !isHost) return;
    
    await firebaseUpdate(ref(db, `rooms/${roomId}`), { state: gameState });
  }
}));
