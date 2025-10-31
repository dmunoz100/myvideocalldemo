import { useState } from 'react';
import './App.css'
import {VideoCall} from './VideoCall'

function App() {
  const [roomId, _setRoomId] = useState<string>('demo-room');
  return (
   <div>
      <h1>Video Llamada Demo</h1>
      <VideoCall roomId={roomId} />
    </div>
  )
}

export default App
