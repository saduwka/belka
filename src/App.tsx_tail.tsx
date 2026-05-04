      {phase === 'ROUND_OVER' && (
        <RoundOverOverlay 
          scores={scores}
          eyes={eyes}
          myTeam={myTeam}
          otherTeam={otherTeam}
          eggsCount={eggsCount}
          votingState={votingState}
          readyPlayers={readyPlayers}
          timeLeft={timeLeft}
          myPlayerIndex={myPlayerIndex}
          players={players}
          submitVote={submitVote}
          setReady={setReady}
          resetRound={resetRound}
        />
      )}

      {phase === 'GAME_OVER' && (
        <GameOverOverlay 
          eyes={eyes}
          myTeam={myTeam}
          otherTeam={otherTeam}
          onLeave={() => setLobbyView(true)}
        />
      )}

      {/* Лента событий (для дебага) */}
      <div className="game-logs">
        {logs.slice(0, 5).map((log, i) => (
          <div key={i} className="log-item">{log}</div>
        ))}
      </div>
    </div>
  )
}

export default App
