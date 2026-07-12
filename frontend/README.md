# GestureBridge Frontend

React + Vite SPA served by Flask in production.

## Development

```bash
npm install
npm run dev          # http://localhost:3000  (proxies /api/* → Flask :5000)
```

## Production build

```bash
npm run build        # Outputs to ../backend/static/dist/
# Then: cd ../backend && python app.py
```

## Folder structure

```
src/
├── pages/
│   ├── Landing.jsx       Public hero page
│   ├── Auth.jsx          Login + Register
│   ├── Dashboard.jsx     Stats, model status, quick actions
│   ├── SignToText.jsx    Webcam → MediaPipe → /predict
│   ├── TextToSign.jsx   Text → /text-to-sign → animation
│   ├── History.jsx       /history/:user_id
│   ├── Profile.jsx       /profile
│   └── Settings.jsx      Theme, language, capture settings
├── components/
│   ├── AppShell.jsx      Sidebar + Topbar layout wrapper
│   ├── Sidebar.jsx       Navigation sidebar
│   ├── Topbar.jsx        Fixed top bar
│   ├── ProtectedRoute.jsx Auth guard
│   ├── Alert.jsx         Reusable alert banner
│   └── LoadingSpinner.jsx Spinner variants
├── context/
│   ├── AuthContext.jsx   JWT auth state (login/logout/updateUser)
│   └── SettingsContext.jsx Theme, language, capture interval
└── services/
    └── api.js            Axios wrapper for all Flask endpoints
```

## API endpoints used

| Method | Path              | Page            |
|--------|-------------------|-----------------|
| POST   | /register         | Auth            |
| POST   | /login            | Auth            |
| GET    | /profile          | Profile/Dashboard |
| POST   | /predict          | Sign-to-Text    |
| GET    | /model/status     | Dashboard       |
| GET    | /history/:user_id | History         |
