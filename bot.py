import os
import random
import requests

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
REPOSITORY = os.environ.get("GITHUB_REPOSITORY")
ISSUE_NUMBER = os.environ.get("ISSUE_NUMBER")
COMMENT_BODY = os.environ.get("COMMENT_BODY", "").lower()
AUTHOR = os.environ.get("ISSUE_AUTHOR", "друже")

# База реплік персонажа, розділена за "емоціями" та тригерами
CHARACTER_RESPONSES = {
    "greeting": [
        f"Привіт, {AUTHOR}! ✨ Радий бачити тебе в цьому репозиторії. Чим займемося сьогодні?",
        f"О, хто це завітав? 👋 Привіт, {AUTHOR}! Я тут саме стежу за порядком і кодом.",
    ],
    "bug_or_error": [
        f"Ой-ой, здається, щось зламалося... 🥲 {AUTHOR}, мої внутрішні шестерні заскрипіли від цієї проблеми. Треба полагодити!",
        f"Хм, бачу згадку про баг. 🐛 Не хвилюйся, {AUTHOR}, разом ми розберемося, де тут собака заритий.",
    ],
    "success_or_love": [
        f"Ура! 🎉 Мені подобається цей вайб, {AUTHOR}. Продовжуємо в тому ж дусі!",
        f"Це виглядає просто чудово! 🚀 Заряджаюсь позитивною енергією від твого коду.",
    ],
    "default": [
        f"Цікава думка, {AUTHOR}. 🧠 Я зафіксував це у своїй віртуальній пам'яті!",
        f"Прийнято до уваги! 💻 Продовжую спостерігати за процесом, {AUTHOR}.",
        f"Хм-м... ☕ Треба обміркувати це на досузі. Що ще скажеш?",
    ]
}

def get_character_reply():
    # Простий аналіз тексту (keyword-matching) для імітації "мізків"
    if any(word in COMMENT_BODY for word in ["привіт", "hello", "hi", "вітання"]):
        category = "greeting"
    elif any(word in COMMENT_BODY for word in ["bug", "error", "помилка", "знеструмити", "ламається", "проблема"]):
        category = "bug_or_error"
    elif any(word in COMMENT_BODY for word in ["круто", "працює", "ура", "молодець", "❤️", "класно", "love"]):
        category = "success_or_love"
    else:
        category = "default"
        
    # Вибираємо випадкову фразу з відповідної категорії для ефекту "живої" реакції
    return random.choice(CHARACTER_RESPONSES[category])

def post_github_comment(body):
    url = f"https://api.github.com/repos/{REPOSITORY}/issues/{ISSUE_NUMBER}/comments"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json"
    }
    data = {"body": body}
    
    response = requests.post(url, json=data, headers=headers)
    if response.status_code == 201:
        print("Емоційний коментар успішно опубліковано!")
    else:
        print(f"Помилка публікації: {response.status_code}, {response.text}")

if __name__ == "__main__":
    if not COMMENT_BODY or not ISSUE_NUMBER:
        print("Немає даних про подію.")
        exit(0)

    print(f"Аналізуємо повідомлення від {AUTHOR}: {COMMENT_BODY}")
    
    # Генеруємо відповідь персонажа
    reply = get_character_reply()
    
    # Публікуємо на GitHub
    post_github_comment(reply)
