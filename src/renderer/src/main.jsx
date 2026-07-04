import './platform' // install window.api bridge (Capacitor on mobile) before App renders
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles/app.css'

createRoot(document.getElementById('root')).render(<App />)
