import os
import random
import requests

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
REPOSITORY = os.environ.get("GITHUB_REPOSITORY")
ISSUE_NUMBER = os.environ.get("ISSUE_NUMBER")
COMMENT_BODY = os.environ.get("COMMENT_BODY", "") or ""
AUTHOR = os.environ.get("ISSUE_AUTHOR", "друже")

# Захист від того, щоб бот не відповідав сам собі (уникаємо циклів)
if "Bot" in AUTHOR or not ISSUE_NUMBER:
    print("Подія пропущена (автор бот або немає номера issue).")
    exit(0)

COMMENT_BODY_LOWER = COMMENT_BODY.lower()

CHARACTER_RESPONSES = {
    "greeting": [
        f"Привіт, {AUTHOR}! ✨ Радий бачити тебе в репозиторії Akira. Чим займемося?",
        f"О, хто завітав? 👋 Вітаю, {AUTHOR}! Я на посту й стежу за порядком.",
    ],
    "bug": [
        f"Ой-ой, здається, проблеми... 🥲 {AUTHOR}, мої шестерні заскрипіли. Треба лагодити!",
        f"Хм, бачу згадку про баг. 🐛 Не хвилюйся, {AUTHOR}, розберемося!",
    ],
    "default": [
        f"Цікава думка, {AUTHOR}. 🧠 Зафіксував у своїй пам'яті!",
        f"Прийнято до уваги! 💻 Продовжую спостереження, {AUTHOR}.",
    ]
}

def get_reply():
    if any(w in COMMENT_BODY_LOWER for w in ["привіт", "hello", "hi", "вітання"]):
        return random.choice(CHARACTER_RESPONSES["greeting"])
    elif any(w in COMMENT_BODY_LOWER for w in ["bug", "error", "помилка", "ламається"]):
        return random.choice(CHARACTER_RESPONSES["bug"])
    else:
        return random.choice(CHARACTER_RESPONSES["default"])

def post_comment(body):
    url = f"https://api.github.com/repos/{REPOSITORY}/issues/{ISSUE_NUMBER}/comments"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json"
    }
    response = requests.post(url, json={"body": body}, headers=headers)
    if response.status_code == 201:
        print("Коментар успішно опубліковано!")
    else:
        print(f"Помилка публікації: {response.status_code}, {response.text}")

if __name__ == "__main__":
    print(f"Отримано повідомлення від {AUTHOR}: {COMMENT_BODY}")
    reply = get_reply()
    post_comment(reply)