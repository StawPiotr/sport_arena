from datetime import datetime, timezone
from secrets import compare_digest, token_urlsafe
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


class Team(BaseModel):
    name: str
    short_name: str
    score: int | None = None


class Match(BaseModel):
    id: int
    discipline: str
    status: Literal["LIVE", "NADCHODZĄCY", "ZAKOŃCZONY"]
    time: str
    home: Team
    away: Team


class Article(BaseModel):
    id: int
    category: str
    title: str
    excerpt: str
    published_at: str
    reading_time: int
    featured: bool = False
    accent: str
    author: str = "Redakcja Arena"
    image_url: str | None = None
    image_alt: str | None = None
    content: list[str] = []
    quote: str | None = None


class Standing(BaseModel):
    position: int
    team: str
    played: int
    points: int


class HomeResponse(BaseModel):
    articles: list[Article]
    matches: list[Match]
    standings: list[Standing]


class LoginRequest(BaseModel):
    username: str
    password: str


class SessionResponse(BaseModel):
    token: str
    username: str


class UserResponse(BaseModel):
    username: str


ARTICLES = [
    Article(
        id=1,
        category="Piłka nożna",
        title="Biało-czerwoni gotowi na najważniejszy mecz tego lata",
        excerpt="Ostatni trening za nami. Selekcjoner zdradził, czego oczekuje od zespołu przed wieczornym spotkaniem.",
        published_at="12 min temu",
        reading_time=4,
        featured=True,
        accent="#e8ff47",
        author="Michał Zieliński",
        image_url="/images/football/pexels-mateo-franciosi-283676800-36958057.jpg",
        image_alt="Piłkarze podczas pojedynku na boisku",
        content=[
            "Reprezentacja zakończyła przygotowania do wieczornego spotkania. Ostatnie zajęcia były krótkie, ale intensywne — sztab skupił się na stałych fragmentach gry, szybkim wyprowadzeniu piłki i pressingu tuż po stracie.",
            "W kadrze panuje spokój. Zawodnicy podkreślają, że plan na mecz jest jasny: odważnie rozpocząć, nie oddawać rywalom środka pola i cierpliwie szukać przestrzeni za linią obrony. Właśnie tam biało-czerwoni mają dziś upatrywać swojej największej szansy.",
            "Selekcjoner nie zdradził wyjściowej jedenastki. Przyznał jednak, że decyzje personalne zapadły już po porannym rozruchu, a wszyscy powołani są gotowi do gry. Najwięcej pytań dotyczy obsady prawego skrzydła i partnera dla kapitana w ataku.",
            "Pierwszy gwizdek zabrzmi o 20:45. Stadion ma wypełnić się do ostatniego miejsca, a organizatorzy proszą kibiców o wcześniejsze przybycie ze względu na specjalną oprawę przed rozpoczęciem meczu.",
        ],
        quote="Chcemy, żeby od pierwszej minuty było widać energię, odwagę i jasny pomysł na ten mecz.",
    ),
    Article(
        id=2,
        category="Tenis",
        title="Fenomenalny powrót w trzecim secie. Polka z awansem",
        excerpt="Dwie godziny walki i tie-break, który trzymał kibiców w napięciu.",
        published_at="38 min temu",
        reading_time=3,
        accent="#ff7a45",
        author="Anna Kowalska",
        image_url="/images/tennis/pexels-onbab-32832526.jpg",
        image_alt="Piłka tenisowa przy linii kortu",
        content=[
            "To był mecz, w którym wynik zmieniał się niemal z każdym gemem. Polka rozpoczęła nerwowo, lecz z biegiem czasu coraz lepiej czytała serwis rywalki i przejmowała inicjatywę w dłuższych wymianach.",
            "Po przegranym pierwszym secie kluczowa okazała się zmiana ustawienia przy returnie. Nasza zawodniczka weszła głębiej w kort, skróciła czas reakcji przeciwniczki i zaczęła regularnie zdobywać punkty po jej drugim podaniu.",
            "Najwięcej emocji przyniosła decydująca partia. Polka obroniła dwie piłki meczowe, doprowadziła do tie-breaka, a w nim od stanu 3:5 wygrała cztery akcje z rzędu. Ostatnią wymianę zakończyła precyzyjnym bekhendem po linii.",
            "W kolejnej rundzie zmierzy się z rozstawioną rywalką, która słynie z agresywnej gry przy siatce. Spotkanie zaplanowano na piątkowe popołudnie.",
        ],
        quote="Nawet przez moment nie przestałam wierzyć, że mogę odwrócić ten mecz.",
    ),
    Article(id=3, category="Formuła 1", title="Nowe ustawienia bolidu zdały egzamin na szybkim torze", excerpt="Zespół znalazł tempo, którego brakowało podczas piątkowych treningów.", published_at="1 godz. temu", reading_time=5, accent="#66d9ff"),
    Article(id=4, category="Siatkówka", title="Liga Narodów: komplet zwycięstw i pewny awans", excerpt="Reprezentanci imponują spokojem i skutecznością przed fazą finałową.", published_at="2 godz. temu", reading_time=4, accent="#b48cff"),
    Article(id=5, category="Kolarstwo", title="Górski etap wywrócił klasyfikację generalną", excerpt="Odważny atak na ostatnim podjeździe przyniósł zmianę lidera.", published_at="3 godz. temu", reading_time=6, accent="#50e3a4"),
]

MATCHES = [
    Match(id=1, discipline="Piłka nożna", status="LIVE", time="67'", home=Team(name="Polska", short_name="POL", score=2), away=Team(name="Holandia", short_name="NED", score=1)),
    Match(id=2, discipline="Tenis", status="NADCHODZĄCY", time="18:30", home=Team(name="I. Świątek", short_name="ŚWI"), away=Team(name="C. Gauff", short_name="GAU")),
    Match(id=3, discipline="Siatkówka", status="ZAKOŃCZONY", time="Koniec", home=Team(name="Polska", short_name="POL", score=3), away=Team(name="Włochy", short_name="ITA", score=1)),
]

STANDINGS = [
    Standing(position=1, team="Lech Poznań", played=34, points=70),
    Standing(position=2, team="Raków Częstochowa", played=34, points=69),
    Standing(position=3, team="Jagiellonia", played=34, points=61),
    Standing(position=4, team="Legia Warszawa", played=34, points=54),
    Standing(position=5, team="Pogoń Szczecin", played=34, points=53),
]

EMPLOYEE_USERNAME = "redaktor"
EMPLOYEE_PASSWORD = "arena2026"
ACTIVE_SESSIONS: dict[str, str] = {}

app = FastAPI(title="Arena Sports API", description="Bazowe API dla portalu sportowego Arena.", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/home", response_model=HomeResponse)
def home() -> HomeResponse:
    return HomeResponse(articles=ARTICLES, matches=MATCHES, standings=STANDINGS)


@app.get("/api/articles", response_model=list[Article])
def articles(category: str | None = None) -> list[Article]:
    if not category:
        return ARTICLES
    return [item for item in ARTICLES if item.category.casefold() == category.casefold()]


@app.get("/api/articles/{article_id}", response_model=Article)
def article(article_id: int) -> Article:
    result = next((item for item in ARTICLES if item.id == article_id), None)
    if result is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono artykułu")
    return result


@app.get("/api/matches", response_model=list[Match])
def matches() -> list[Match]:
    return MATCHES


def get_session_token(authorization: str | None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token or token not in ACTIVE_SESSIONS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesja jest nieprawidłowa lub wygasła",
        )
    return token


@app.post("/api/auth/login", response_model=SessionResponse)
def login(credentials: LoginRequest) -> SessionResponse:
    username_valid = compare_digest(credentials.username, EMPLOYEE_USERNAME)
    password_valid = compare_digest(credentials.password, EMPLOYEE_PASSWORD)
    if not username_valid or not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowy login lub hasło",
        )

    token = token_urlsafe(32)
    ACTIVE_SESSIONS[token] = EMPLOYEE_USERNAME
    return SessionResponse(token=token, username=EMPLOYEE_USERNAME)


@app.get("/api/auth/me", response_model=UserResponse)
def current_user(authorization: str | None = Header(default=None)) -> UserResponse:
    token = get_session_token(authorization)
    return UserResponse(username=ACTIVE_SESSIONS[token])


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(authorization: str | None = Header(default=None)) -> None:
    token = get_session_token(authorization)
    ACTIVE_SESSIONS.pop(token, None)
