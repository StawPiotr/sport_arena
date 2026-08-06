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

## Deploy na Railway

Projekt jest przygotowany do wdrożenia jako jedna usługa Railway przez `Dockerfile`
w katalogu głównym repozytorium. Docker buduje frontend Angular, kopiuje wynik do
obrazu backendu i uruchamia FastAPI, które serwuje zarówno API `/api`, jak i
portal.

W Railway:

1. Utwórz nowy projekt z repozytorium.
2. Railway powinien wykryć `railway.json` i użyć `Dockerfile`.
3. Dodaj volume dla trwałej bazy SQLite i zamontuj go pod `/data`.
4. Ustaw zmienną środowiskową:

```text
ARENA_DB_PATH=/data/arena.db
```

Jeśli nie dodasz volume, aplikacja wystartuje, ale baza SQLite będzie nietrwała
po redeployu lub restarcie kontenera.

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
