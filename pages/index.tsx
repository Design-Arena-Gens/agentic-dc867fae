import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { getSocket } from '../lib/socket';

interface Lobby {
  id: string;
  entryFee: number;
  games: Game[];
}

interface Game {
  id: string;
  gameNumber: number;
  status: string;
  seats: Seat[];
  prizePool: number;
}

interface Seat {
  id: string;
  seatNumber: number;
  userId: string;
  user: {
    username: string;
  };
}

export default function Home() {
  const { user, setUser } = useStore();
  const [username, setUsername] = useState('');
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [selectedLobby, setSelectedLobby] = useState<Lobby | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [markedCells, setMarkedCells] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (user) {
      fetchLobbies();
    }
  }, [user]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('lobby-state', (lobby: Lobby) => {
      setSelectedLobby(lobby);
    });

    socket.on('game-updated', (game: Game) => {
      setSelectedGame(game);
    });

    socket.on('countdown-start', ({ timeLeft }: { timeLeft: number }) => {
      setGameState((prev: any) => ({ ...prev, countdown: timeLeft }));
    });

    socket.on('game-started', ({ masterCard, prizePool, interval }: any) => {
      setGameState({ masterCard, prizePool, interval, calledNumbers: [] });
      setMarkedCells(new Set());
    });

    socket.on('number-called', ({ number, calledNumbers }: any) => {
      setGameState((prev: any) => ({ ...prev, calledNumbers, currentNumber: number }));
    });

    socket.on('game-ended', ({ winnerId, prizePool }: any) => {
      setGameState((prev: any) => ({ ...prev, winnerId, prizePool, finished: true }));

      // Refresh user balance
      if (user) {
        fetch(`/api/users?id=${user.id}`)
          .then(res => res.json())
          .then(data => setUser(data));
      }
    });

    socket.on('game-reset', () => {
      setGameState(null);
      setMarkedCells(new Set());
      setSelectedGame(null);
    });

    return () => {
      socket.off('lobby-state');
      socket.off('game-updated');
      socket.off('countdown-start');
      socket.off('game-started');
      socket.off('number-called');
      socket.off('game-ended');
      socket.off('game-reset');
    };
  }, [user]);

  const handleLogin = async () => {
    if (!username.trim()) return;

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });

    const userData = await res.json();
    setUser(userData);
  };

  const fetchLobbies = async () => {
    const res = await fetch('/api/lobbies');
    const data = await res.json();
    setLobbies(data);
  };

  const createLobby = async (entryFee: number) => {
    await fetch('/api/lobbies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryFee })
    });
    fetchLobbies();
  };

  const joinLobby = (lobby: Lobby) => {
    setSelectedLobby(lobby);
    const socket = getSocket();
    if (socket && user) {
      socket.emit('join-lobby', { lobbyId: lobby.id, userId: user.id });
    }
  };

  const selectGame = (game: Game) => {
    setSelectedGame(game);
    setGameState(null);
    setMarkedCells(new Set());
    const socket = getSocket();
    if (socket && user) {
      socket.emit('join-game-room', { gameId: game.id });
    }
  };

  const selectSeat = (seatNumber: number) => {
    if (!selectedGame || !user) return;

    const socket = getSocket();
    if (socket) {
      socket.emit('join-game', {
        gameId: selectedGame.id,
        userId: user.id,
        seatNumber
      });
    }
  };

  const markCell = (number: number) => {
    if (!gameState || !selectedGame || !user) return;

    const newMarked = new Set(markedCells);
    if (newMarked.has(number)) {
      newMarked.delete(number);
    } else {
      newMarked.add(number);
    }
    setMarkedCells(newMarked);

    const socket = getSocket();
    if (socket) {
      socket.emit('mark-cell', {
        gameId: selectedGame.id,
        userId: user.id,
        number
      });
    }
  };

  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-box">
          <h2>🎰 WildCard Bingo</h2>
          <input
            className="input"
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button className="btn btn-primary" onClick={handleLogin}>
            Join Game
          </button>
        </div>
      </div>
    );
  }

  if (selectedGame) {
    const mySeats = selectedGame.seats.filter(s => s.userId === user.id);
    const playerRow = gameState?.masterCard && mySeats[0]
      ? gameState.masterCard.rows[mySeats[0].seatNumber - 1]
      : null;

    return (
      <div className="container">
        <div className="user-info">
          <div>
            <h3>👤 {user.username}</h3>
            <div className="balance">💰 ${user.balance.toFixed(2)}</div>
          </div>
          <button className="btn btn-secondary" onClick={() => setSelectedGame(null)}>
            ← Back to Lobby
          </button>
        </div>

        <div className="game-view">
          <div className="game-header">
            <h2>Game {selectedGame.gameNumber}</h2>
            <div>
              <span className={`game-status status-${selectedGame.status}`}>
                {selectedGame.status}
              </span>
              {gameState?.prizePool && (
                <div style={{ marginTop: '10px', fontSize: '1.3rem', fontWeight: 'bold' }}>
                  💰 Prize Pool: ${gameState.prizePool}
                </div>
              )}
            </div>
          </div>

          {selectedGame.status === 'waiting' && (
            <>
              <h3 style={{ marginBottom: '15px' }}>Select Your Seat(s) - Max 2 per player</h3>
              <div className="seats-grid">
                {Array.from({ length: 15 }, (_, i) => i + 1).map((seatNum) => {
                  const seat = selectedGame.seats.find(s => s.seatNumber === seatNum);
                  const isMySeat = seat?.userId === user.id;
                  return (
                    <div
                      key={seatNum}
                      className={`seat ${seat ? 'taken' : ''} ${isMySeat ? 'my-seat' : ''}`}
                      onClick={() => !seat && selectSeat(seatNum)}
                    >
                      {seat ? seat.user.username.slice(0, 8) : seatNum}
                    </div>
                  );
                })}
              </div>
              <div style={{ textAlign: 'center', marginTop: '20px' }}>
                Seats: {selectedGame.seats.length}/15
              </div>
            </>
          )}

          {gameState?.countdown && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <h2 style={{ fontSize: '3rem', marginBottom: '20px' }}>Game Starting Soon!</h2>
              <div style={{ fontSize: '5rem', fontWeight: 'bold' }}>
                {Math.ceil(gameState.countdown)}
              </div>
            </div>
          )}

          {gameState?.masterCard && playerRow && (
            <>
              <div className="called-numbers">
                <h3>Called Numbers</h3>
                {gameState.currentNumber && (
                  <div className="current-number">{gameState.currentNumber}</div>
                )}
                <div className="numbers-list">
                  {gameState.calledNumbers.map((num: number) => (
                    <span key={num} className="number-chip">{num}</span>
                  ))}
                </div>
              </div>

              <div className="bingo-card">
                <div className="card-header">
                  <span>B</span>
                  <span>I</span>
                  <span>N</span>
                  <span>G</span>
                  <span>O</span>
                </div>
                <div className="card-row">
                  {playerRow.map((num: number, idx: number) => {
                    const isCalled = gameState.calledNumbers.includes(num);
                    const isMarked = markedCells.has(num);
                    return (
                      <div
                        key={idx}
                        className={`card-cell ${isCalled ? 'called' : ''} ${isMarked ? 'marked' : ''}`}
                        onClick={() => isCalled && markCell(num)}
                      >
                        {num}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {gameState?.finished && (
            <div className="winner-modal">
              <div className="winner-content">
                <h2>🎉 {gameState.winnerId === user.id ? 'YOU WON!' : 'Game Over'}</h2>
                <p style={{ fontSize: '1.5rem', marginBottom: '20px' }}>
                  {gameState.winnerId === user.id
                    ? `Congratulations! You won $${gameState.prizePool}!`
                    : 'Better luck next time!'}
                </p>
                <p>Game will reset in 10 seconds...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (selectedLobby) {
    return (
      <div className="container">
        <div className="user-info">
          <div>
            <h3>👤 {user.username}</h3>
            <div className="balance">💰 ${user.balance.toFixed(2)}</div>
          </div>
          <button className="btn btn-secondary" onClick={() => setSelectedLobby(null)}>
            ← Back to Lobbies
          </button>
        </div>

        <div className="header">
          <h1>${selectedLobby.entryFee} Lobby</h1>
        </div>

        <div className="lobbies-grid">
          {selectedLobby.games.map((game) => (
            <div key={game.id} className="lobby-card" onClick={() => selectGame(game)}>
              <div className="lobby-title">Game {game.gameNumber}</div>
              <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
                <span className={`game-status status-${game.status}`}>{game.status}</span>
              </div>
              <div>Seats: {game.seats.length}/15</div>
              {game.prizePool > 0 && <div>Prize: ${game.prizePool}</div>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="user-info">
        <div>
          <h3>👤 {user.username}</h3>
          <div className="balance">💰 ${user.balance.toFixed(2)}</div>
        </div>
      </div>

      <div className="header">
        <h1>🎰 WildCard Bingo</h1>
        <p>Select a lobby to start playing</p>
      </div>

      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <button className="btn btn-primary" onClick={() => createLobby(5)} style={{ marginRight: '10px' }}>
          Create $5 Lobby
        </button>
        <button className="btn btn-primary" onClick={() => createLobby(10)} style={{ marginRight: '10px' }}>
          Create $10 Lobby
        </button>
        <button className="btn btn-primary" onClick={() => createLobby(25)}>
          Create $25 Lobby
        </button>
      </div>

      <div className="lobbies-grid">
        {lobbies.map((lobby) => (
          <div key={lobby.id} className="lobby-card" onClick={() => joinLobby(lobby)}>
            <div className="lobby-title">${lobby.entryFee} Entry Fee</div>
            <div>Games: {lobby.games.length}</div>
            <div style={{ marginTop: '10px' }}>
              {lobby.games.map(g => (
                <div key={g.id} style={{ fontSize: '0.9rem', opacity: 0.9 }}>
                  Game {g.gameNumber}: {g.seats.length}/15 seats
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {lobbies.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', opacity: 0.8 }}>
          No lobbies available. Create one to get started!
        </div>
      )}
    </div>
  );
}
