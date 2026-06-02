import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Results from './Results.jsx'

const isResults = window.location.pathname === '/results'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isResults ? <Results /> : <App />}
  </StrictMode>,
)
 
