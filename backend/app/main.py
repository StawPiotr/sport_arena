from datetime import datetime, timezone
from secrets import token_urlsafe
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .database import (
    create_article,
    create_result,
    delete_article,
    delete_result,
    get_article,
    get_result,
    get_result_settings,
    get_user,
    init_database,
    list_articles,
    list_results,
    set_article_hidden,
    set_featured_article,
    set_result_limit,
    set_result_visibility,
    toggle_result_status,
    update_article,
    update_result,
    verify_password,
)


class Team(BaseModel):
    name: str
    short_name: str
    score: int | None = None


class Match(BaseModel):
    id: int
    discipline: str
    category: str | None = None
    status: str
    time: str
    is_live: bool = False
    visible: bool = True
    created_at: str | None = None
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
    category_featured: bool = False
    hidden: bool = False
    accent: str
    author: str
    image_url: str | None = None
    image_alt: str | None = None
    content: list[str] = Field(default_factory=list)
    blocks: list[dict[str, str]] = Field(default_factory=list)
    quote: str | None = None


class Sport(BaseModel):
    name: str
    accent: str


class ArticleBlock(BaseModel):
    type: Literal["text", "image"]
    content: str | None = None
    src: str | None = None
    alt: str | None = None


class ArticleCreateRequest(BaseModel):
    category: str
    title: str = ""
    excerpt: str = ""
    published_at: str | None = None
    blocks: list[ArticleBlock] = Field(default_factory=list)


class ArticleVisibilityRequest(BaseModel):
    hidden: bool


class FeaturedRequest(BaseModel):
    scope: Literal["home", "category"]


class ResultCreateRequest(BaseModel):
    category: str
    home_name: str = ""
    home_short_name: str = ""
    home_score: int | None = None
    away_name: str = ""
    away_short_name: str = ""
    away_score: int | None = None
    is_live: bool = False
    event_time: str = ""
    visible: bool = True


class ResultVisibilityRequest(BaseModel):
    visible: bool


class ResultLimitRequest(BaseModel):
    category: str
    visible_limit: int


class ResultSetting(BaseModel):
    category: str
    visible_limit: int


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
    full_name: str


class UserResponse(BaseModel):
    username: str
    full_name: str


MATCHES = [
    Match(
        id=1,
        discipline="Piłka nożna",
        status="LIVE",
        time="67'",
        home=Team(name="Polska", short_name="POL", score=2),
        away=Team(name="Holandia", short_name="NED", score=1),
    ),
    Match(
        id=2,
        discipline="Tenis",
        status="NADCHODZĄCY",
        time="18:30",
        home=Team(name="I. Świątek", short_name="ŚWI"),
        away=Team(name="C. Gauff", short_name="GAU"),
    ),
    Match(
        id=3,
        discipline="Siatkówka",
        status="ZAKOŃCZONY",
        time="Koniec",
        home=Team(name="Polska", short_name="POL", score=3),
        away=Team(name="Włochy", short_name="ITA", score=1),
    ),
]

STANDINGS = [
    Standing(position=1, team="Lech Poznań", played=34, points=70),
    Standing(position=2, team="Raków Częstochowa", played=34, points=69),
    Standing(position=3, team="Jagiellonia", played=34, points=61),
    Standing(position=4, team="Legia Warszawa", played=34, points=54),
    Standing(position=5, team="Pogoń Szczecin", played=34, points=53),
]

SPORTS = [
    Sport(name="Piłka nożna", accent="#e8ff47"),
    Sport(name="Tenis", accent="#ff7a45"),
    Sport(name="Formuła 1", accent="#66d9ff"),
    Sport(name="Siatkówka", accent="#b48cff"),
    Sport(name="Kolarstwo", accent="#50e3a4"),
]

ACTIVE_SESSIONS: dict[str, str] = {}
init_database()

app = FastAPI(
    title="Arena Sports API",
    description="Bazowe API dla portalu sportowego Arena.",
    version="0.2.0",
)
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
    return HomeResponse(
        articles=[Article(**item) for item in list_articles()],
        matches=[Match(**item) for item in list_results()],
        standings=STANDINGS,
    )


@app.get("/api/articles", response_model=list[Article])
def articles(category: str | None = None) -> list[Article]:
    return [Article(**item) for item in list_articles(category)]


@app.get("/api/employee/articles", response_model=list[Article])
def employee_articles(authorization: str | None = Header(default=None)) -> list[Article]:
    session_user(authorization)
    return [Article(**item) for item in list_articles(include_hidden=True)]


@app.get("/api/sports", response_model=list[Sport])
def sports() -> list[Sport]:
    return SPORTS


@app.get("/api/articles/{article_id}", response_model=Article)
def article(article_id: int) -> Article:
    result = get_article(article_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono artykułu")
    return Article(**result)


@app.post("/api/articles", response_model=Article, status_code=status.HTTP_201_CREATED)
def add_article(
    payload: ArticleCreateRequest,
    authorization: str | None = Header(default=None),
) -> Article:
    user = session_user(authorization)
    title = payload.title.strip()
    excerpt = payload.excerpt.strip()
    if len(title) < 3:
        raise HTTPException(status_code=400, detail="Tytuł musi mieć przynajmniej 3 znaki")
    if len(excerpt) < 10:
        raise HTTPException(status_code=400, detail="Skrót artykułu musi mieć przynajmniej 10 znaków")

    sport = next((item for item in SPORTS if item.name == payload.category), None)
    if sport is None:
        raise HTTPException(status_code=400, detail="Nieznana kategoria sportu")

    normalized_blocks: list[dict[str, str]] = []
    first_image_url: str | None = None
    first_image_alt: str | None = None
    word_count = 0

    for block in payload.blocks:
        if block.type == "text":
            text = (block.content or "").strip()
            if not text:
                continue
            normalized_blocks.append({"type": "text", "content": text})
            word_count += len(text.split())
        if block.type == "image":
            src = (block.src or "").strip()
            if not src:
                continue
            alt = (block.alt or title).strip()
            normalized_blocks.append({"type": "image", "src": src, "alt": alt})
            if first_image_url is None:
                first_image_url = src
                first_image_alt = alt

    if not normalized_blocks or not any(item["type"] == "text" for item in normalized_blocks):
        raise HTTPException(
            status_code=400,
            detail="Artykuł musi mieć przynajmniej jeden blok tekstowy",
        )

    published_at = payload.published_at
    if not published_at:
        published_at = datetime.now(timezone.utc).isoformat()
    else:
        try:
            parsed = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Nieprawidłowa data publikacji") from exc
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        published_at = parsed.astimezone(timezone.utc).isoformat()

    article = create_article(
        category=sport.name,
        title=title,
        excerpt=excerpt,
        published_at=published_at,
        reading_time=max(1, round(word_count / 180)),
        accent=sport.accent,
        author_id=int(user["id"]),
        image_url=first_image_url,
        image_alt=first_image_alt,
        blocks=normalized_blocks,
    )
    return Article(**article)


@app.put("/api/articles/{article_id}", response_model=Article)
def edit_article(
    article_id: int,
    payload: ArticleCreateRequest,
    authorization: str | None = Header(default=None),
) -> Article:
    session_user(authorization)
    title = payload.title.strip()
    excerpt = payload.excerpt.strip()
    if len(title) < 3:
        raise HTTPException(status_code=400, detail="Tytuł musi mieć przynajmniej 3 znaki")
    if len(excerpt) < 10:
        raise HTTPException(status_code=400, detail="Skrót artykułu musi mieć przynajmniej 10 znaków")

    sport = next((item for item in SPORTS if item.name == payload.category), None)
    if sport is None:
        raise HTTPException(status_code=400, detail="Nieznana kategoria sportu")

    normalized_blocks: list[dict[str, str]] = []
    first_image_url: str | None = None
    first_image_alt: str | None = None
    word_count = 0

    for block in payload.blocks:
        if block.type == "text":
            text = (block.content or "").strip()
            if not text:
                continue
            normalized_blocks.append({"type": "text", "content": text})
            word_count += len(text.split())
        if block.type == "image":
            src = (block.src or "").strip()
            if not src:
                continue
            alt = (block.alt or title).strip()
            normalized_blocks.append({"type": "image", "src": src, "alt": alt})
            if first_image_url is None:
                first_image_url = src
                first_image_alt = alt

    if not normalized_blocks or not any(item["type"] == "text" for item in normalized_blocks):
        raise HTTPException(
            status_code=400,
            detail="Artykuł musi mieć przynajmniej jeden blok tekstowy",
        )

    published_at = payload.published_at
    if not published_at:
        published_at = datetime.now(timezone.utc).isoformat()
    else:
        try:
            parsed = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Nieprawidłowa data publikacji") from exc
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        published_at = parsed.astimezone(timezone.utc).isoformat()

    article = update_article(
        article_id,
        category=sport.name,
        title=title,
        excerpt=excerpt,
        published_at=published_at,
        reading_time=max(1, round(word_count / 180)),
        accent=sport.accent,
        image_url=first_image_url,
        image_alt=first_image_alt,
        blocks=normalized_blocks,
    )
    if article is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono artykułu")
    return Article(**article)


@app.patch("/api/articles/{article_id}/visibility", response_model=Article)
def change_article_visibility(
    article_id: int,
    payload: ArticleVisibilityRequest,
    authorization: str | None = Header(default=None),
) -> Article:
    session_user(authorization)
    article = set_article_hidden(article_id, payload.hidden)
    if article is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono artykułu")
    return Article(**article)


@app.patch("/api/articles/{article_id}/featured", response_model=Article)
def change_featured_article(
    article_id: int,
    payload: FeaturedRequest,
    authorization: str | None = Header(default=None),
) -> Article:
    session_user(authorization)
    try:
        article = set_featured_article(article_id, payload.scope)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Nieprawidłowy zakres wyróżnienia") from exc
    if article is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono artykułu")
    return Article(**article)


@app.delete("/api/articles/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_article(
    article_id: int,
    authorization: str | None = Header(default=None),
) -> None:
    session_user(authorization)
    if not delete_article(article_id):
        raise HTTPException(status_code=404, detail="Nie znaleziono artykułu")


@app.get("/api/matches", response_model=list[Match])
def matches(category: str | None = None) -> list[Match]:
    return [Match(**item) for item in list_results(category)]


@app.get("/api/employee/results", response_model=list[Match])
def employee_results(authorization: str | None = Header(default=None)) -> list[Match]:
    session_user(authorization)
    return [Match(**item) for item in list_results(include_hidden=True)]


@app.post("/api/results", response_model=Match, status_code=status.HTTP_201_CREATED)
def add_result(
    payload: ResultCreateRequest,
    authorization: str | None = Header(default=None),
) -> Match:
    session_user(authorization)
    sport = next((item for item in SPORTS if item.name == payload.category), None)
    if sport is None:
        raise HTTPException(status_code=400, detail="Nieznana kategoria sportu")
    if not payload.home_name.strip() or not payload.away_name.strip():
        raise HTTPException(status_code=400, detail="Podaj obie strony wyniku")

    result = create_result(
        category=sport.name,
        home_name=payload.home_name.strip(),
        home_short_name=(payload.home_short_name or payload.home_name[:3]).strip().upper()[:4],
        home_score=payload.home_score,
        away_name=payload.away_name.strip(),
        away_short_name=(payload.away_short_name or payload.away_name[:3]).strip().upper()[:4],
        away_score=payload.away_score,
        is_live=payload.is_live,
        status="LIVE" if payload.is_live else "Koniec",
        event_time="LIVE" if payload.is_live else "Koniec",
        visible=payload.visible,
    )
    return Match(**result)


@app.get("/api/results/{result_id}", response_model=Match)
def result(result_id: int, authorization: str | None = Header(default=None)) -> Match:
    session_user(authorization)
    item = get_result(result_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono wyniku")
    return Match(**item)


@app.put("/api/results/{result_id}", response_model=Match)
def edit_result(
    result_id: int,
    payload: ResultCreateRequest,
    authorization: str | None = Header(default=None),
) -> Match:
    session_user(authorization)
    sport = next((item for item in SPORTS if item.name == payload.category), None)
    if sport is None:
        raise HTTPException(status_code=400, detail="Nieznana kategoria sportu")
    if not payload.home_name.strip() or not payload.away_name.strip():
        raise HTTPException(status_code=400, detail="Podaj obie strony wyniku")

    item = update_result(
        result_id,
        category=sport.name,
        home_name=payload.home_name.strip(),
        home_short_name=(payload.home_short_name or payload.home_name[:3]).strip().upper()[:4],
        home_score=payload.home_score,
        away_name=payload.away_name.strip(),
        away_short_name=(payload.away_short_name or payload.away_name[:3]).strip().upper()[:4],
        away_score=payload.away_score,
        is_live=payload.is_live,
        status="LIVE" if payload.is_live else "Koniec",
        event_time="LIVE" if payload.is_live else "Koniec",
        visible=payload.visible,
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono wyniku")
    return Match(**item)


@app.patch("/api/results/{result_id}/visibility", response_model=Match)
def change_result_visibility(
    result_id: int,
    payload: ResultVisibilityRequest,
    authorization: str | None = Header(default=None),
) -> Match:
    session_user(authorization)
    result = set_result_visibility(result_id, payload.visible)
    if result is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono wyniku")
    return Match(**result)


@app.patch("/api/results/{result_id}/status", response_model=Match)
def change_result_status(
    result_id: int,
    authorization: str | None = Header(default=None),
) -> Match:
    session_user(authorization)
    result = toggle_result_status(result_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono wyniku")
    return Match(**result)


@app.delete("/api/results/{result_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_result(
    result_id: int,
    authorization: str | None = Header(default=None),
) -> None:
    session_user(authorization)
    if not delete_result(result_id):
        raise HTTPException(status_code=404, detail="Nie znaleziono wyniku")


@app.get("/api/result-settings", response_model=list[ResultSetting])
def result_settings(authorization: str | None = Header(default=None)) -> list[ResultSetting]:
    session_user(authorization)
    return [ResultSetting(**item) for item in get_result_settings()]


@app.put("/api/result-settings", response_model=ResultSetting)
def update_result_setting(
    payload: ResultLimitRequest,
    authorization: str | None = Header(default=None),
) -> ResultSetting:
    session_user(authorization)
    if payload.visible_limit < 0 or payload.visible_limit > 20:
        raise HTTPException(status_code=400, detail="Limit musi być w zakresie 0-20")
    return ResultSetting(**set_result_limit(payload.category, payload.visible_limit))


def session_user(authorization: str | None) -> dict:
    scheme, _, token = (authorization or "").partition(" ")
    username = ACTIVE_SESSIONS.get(token)
    if scheme.lower() != "bearer" or not token or not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesja jest nieprawidłowa lub wygasła",
        )
    user = get_user(username)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return {"token": token, **user}


@app.post("/api/auth/login", response_model=SessionResponse)
def login(credentials: LoginRequest) -> SessionResponse:
    user = get_user(credentials.username)
    if user is None or not verify_password(user, credentials.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowy login lub hasło",
        )

    token = token_urlsafe(32)
    ACTIVE_SESSIONS[token] = user["username"]
    return SessionResponse(
        token=token,
        username=user["username"],
        full_name=user["full_name"],
    )


@app.get("/api/auth/me", response_model=UserResponse)
def current_user(authorization: str | None = Header(default=None)) -> UserResponse:
    user = session_user(authorization)
    return UserResponse(username=user["username"], full_name=user["full_name"])


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(authorization: str | None = Header(default=None)) -> None:
    user = session_user(authorization)
    ACTIVE_SESSIONS.pop(user["token"], None)
