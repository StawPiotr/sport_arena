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

.\.venv\Scripts\Activate.ps1 && pip install -r requirements.txt && uvicorn app.main:app --reload
```

Frontend (w drugim terminalu):

```powershell
cd frontend
npm start

cd frontend && npm start
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
backendu — przed wdrożeniem produkcyjnym należy zastąpić je bazą danych,
haszowaniem haseł i trwałym magazynem sesji.
