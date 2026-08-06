# Arena — portal sportowy

Bazowa wersja portalu: responsywny frontend Angular 21 oraz API Python/FastAPI.

## Uruchomienie

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend (w drugim terminalu):

```powershell
cd frontend
npm start
```

Portal: `http://localhost:4200`  
Dokumentacja API: `http://localhost:8000/docs`

## Strefa pracownika

Podstrona logowania nie jest widoczna w nawigacji portalu:

`http://localhost:4200/employee`

Dane konta demonstracyjnego:

- login: `redaktor`
- hasło: `arena2026`

Po zalogowaniu nazwa użytkownika jest wyświetlana w prawym górnym rogu
portalu. Konto i sesje są obecnie demonstracyjne oraz przechowywane w pamięci
backendu. Użytkownik i artykuły są zapisywane w lokalnej bazie SQLite
`backend/arena.db`, a hasło jest przechowywane jako hash PBKDF2. Przed
wdrożeniem produkcyjnym należy przenieść sekret i trwałe sesje do
infrastruktury produkcyjnej.

Konto `redaktor` jest przypisane do autora **Jan Kowal**. Baza startowa zawiera
15 przykładowych artykułów — po trzy dla piłki nożnej, tenisa, Formuły 1,
siatkówki i kolarstwa.
