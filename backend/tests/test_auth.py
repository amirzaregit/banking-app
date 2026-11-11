
import jwt

from app.core.config import settings
from tests.conftest import auth_header, fake_phone, login


def test_register_and_duplicate_email(client, user):
    r = client.post(
        "/auth/register",
        json={"email": "ALICE@example.com", "password": "another-pass-1", "full_name": "X", "phone": fake_phone()},
    )
    assert r.status_code == 409


def test_register_rejects_short_password(client):
    r = client.post(
        "/auth/register",
        json={"email": "b@example.com", "password": "short", "full_name": "B", "phone": fake_phone()},
    )
    assert r.status_code == 422


def test_register_never_returns_password(client, user):
    r = client.post(
        "/auth/register",
        json={"email": "c@example.com", "password": "long-enough-1", "full_name": "C", "phone": fake_phone()},
    )
    assert "password" not in r.text


def test_login_wrong_password_and_unknown_email_look_identical(client, user):
    bad_pw = client.post("/auth/login", json={"email": user["email"], "password": "nope-nope"})
    unknown = client.post("/auth/login", json={"email": "ghost@example.com", "password": "nope-nope"})
    assert bad_pw.status_code == unknown.status_code == 401
    assert bad_pw.json() == unknown.json()


def test_me_requires_valid_token(client, user):
    assert client.get("/users/me").status_code == 401
    assert client.get("/users/me", headers={"Authorization": "Bearer junk"}).status_code == 401
    tokens = login(client, user)
    r = client.get("/users/me", headers=auth_header(tokens))
    assert r.status_code == 200
    assert r.json()["email"] == "alice@example.com"


def test_expired_access_token_rejected(client, user):
    tokens = login(client, user)
    payload = jwt.decode(tokens["access_token"], settings.secret_key, algorithms=["HS256"])
    payload["exp"] = payload["iat"] - 10
    expired = jwt.encode(payload, settings.secret_key, algorithm="HS256")
    r = client.get("/users/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401


def test_refresh_token_cannot_be_used_as_access_token(client, user):
    tokens = login(client, user)
    r = client.get("/users/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"})
    assert r.status_code == 401


def test_refresh_rotates_token(client, user):
    first = login(client, user)
    r = client.post("/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert r.status_code == 200
    second = r.json()
    assert second["refresh_token"] != first["refresh_token"]
    assert client.get("/users/me", headers=auth_header(second)).status_code == 200


def test_reusing_old_refresh_token_kills_the_whole_login(client, user):
    first = login(client, user)
    second = client.post("/auth/refresh", json={"refresh_token": first["refresh_token"]}).json()

    # Attacker replays the already-used token
    replay = client.post("/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert replay.status_code == 401

    # ...which also invalidates the legitimate newest token
    again = client.post("/auth/refresh", json={"refresh_token": second["refresh_token"]})
    assert again.status_code == 401


def test_logout_revokes_refresh_token(client, user):
    tokens = login(client, user)
    r = client.post("/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 204
    r = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


def test_sessions_lists_devices_and_marks_current(client, user):
    phone = login(client, user, "iPhone")
    login(client, user, "Pixel")
    r = client.get("/auth/sessions", headers=auth_header(phone))
    assert r.status_code == 200
    sessions = r.json()
    assert {s["device_name"] for s in sessions} == {"iPhone", "Pixel"}
    assert [s["device_name"] for s in sessions if s["is_current"]] == ["iPhone"]


def test_sessions_stay_one_per_device_after_refresh(client, user):
    phone = login(client, user, "iPhone")
    client.post("/auth/refresh", json={"refresh_token": phone["refresh_token"]})
    r = client.get("/auth/sessions", headers=auth_header(phone))
    assert len(r.json()) == 1


def test_revoke_other_device(client, user):
    phone = login(client, user, "iPhone")
    pixel = login(client, user, "Pixel")
    sessions = client.get("/auth/sessions", headers=auth_header(phone)).json()
    pixel_id = next(s["id"] for s in sessions if s["device_name"] == "Pixel")

    assert client.delete(f"/auth/sessions/{pixel_id}", headers=auth_header(phone)).status_code == 204
    assert client.post("/auth/refresh", json={"refresh_token": pixel["refresh_token"]}).status_code == 401
    assert len(client.get("/auth/sessions", headers=auth_header(phone)).json()) == 1


def test_cannot_revoke_someone_elses_session(client, user):
    client.post(
        "/auth/register",
        json={"email": "bob@example.com", "password": "bobs-password-1", "full_name": "Bob", "phone": fake_phone()},
    )
    bob = login(client, {"email": "bob@example.com", "password": "bobs-password-1"}, "Bob phone")
    bob_session = client.get("/auth/sessions", headers=auth_header(bob)).json()[0]["id"]

    alice = login(client, user)
    r = client.delete(f"/auth/sessions/{bob_session}", headers=auth_header(alice))
    assert r.status_code == 404
    assert client.post("/auth/refresh", json={"refresh_token": bob["refresh_token"]}).status_code == 200


def test_logout_all(client, user):
    a = login(client, user, "iPhone")
    b = login(client, user, "Pixel")
    assert client.post("/auth/logout-all", headers=auth_header(a)).status_code == 204
    for t in (a, b):
        assert client.post("/auth/refresh", json={"refresh_token": t["refresh_token"]}).status_code == 401


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


# ---------------------------------------------------------------- login throttling

from fastapi.testclient import TestClient

from app.main import app


def attempt(client, email, password):
    return client.post("/auth/login", json={"email": email, "password": password})


def from_ip(ip):
    """A client that appears to connect from a different address."""
    return TestClient(app, client=(ip, 50000))


def test_repeated_failures_throttle_even_the_right_password(client, user):
    for _ in range(5):
        assert attempt(client, user["email"], "wrong-password-x").status_code == 401
    r = attempt(client, user["email"], user["password"])  # correct, but too late
    assert r.status_code == 429
    assert r.json()["code"] == "login_throttled"
    assert "Try again in" in r.json()["detail"]
    assert int(r.headers["Retry-After"]) > 0


def test_unknown_emails_are_throttled_the_same_way(client):
    for _ in range(5):
        assert attempt(client, "ghost@example.com", "whatever-123").status_code == 401
    assert attempt(client, "ghost@example.com", "whatever-123").status_code == 429


def test_a_success_clears_the_strikes(client, user):
    for _ in range(4):
        attempt(client, user["email"], "wrong-password-x")
    assert attempt(client, user["email"], user["password"]).status_code == 200
    for _ in range(4):  # a fresh allowance of 4 more failures
        assert attempt(client, user["email"], "wrong-password-x").status_code == 401
    assert attempt(client, user["email"], user["password"]).status_code == 200


def test_attacker_cannot_lock_the_owner_out_from_another_address(client, user):
    attacker = from_ip("203.0.113.9")
    for _ in range(6):
        attempt(attacker, user["email"], "wrong-password-x")
    assert attempt(attacker, user["email"], user["password"]).status_code == 429  # attacker is blocked
    assert attempt(client, user["email"], user["password"]).status_code == 200  # the owner is fine


def test_guessing_one_account_from_many_addresses_is_still_stopped(client, user):
    for n in range(4):  # 4 addresses x 5 failures = 20 failures against ONE email
        bot = from_ip(f"198.51.100.{n + 1}")
        for _ in range(5):
            assert attempt(bot, user["email"], "wrong-password-x").status_code == 401
    fresh = from_ip("198.51.100.200")
    assert attempt(fresh, user["email"], user["password"]).status_code == 429


def test_one_address_spraying_many_accounts_is_stopped(client):
    bot = from_ip("203.0.113.77")
    codes = [attempt(bot, f"victim{n}@example.com", "wrong-password-x").status_code for n in range(31)]
    assert codes[:30] == [401] * 30 and codes[30] == 429
